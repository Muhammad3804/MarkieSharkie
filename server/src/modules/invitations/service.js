import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { sendInvitationEmail } from '../../integrations/mailer.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { logger } from '../../lib/logger.js'
import { validationError } from '../../lib/validation.js'
import * as repo from './repository.js'

// Invitations and guest replies (EUC-25, 26, 27; REQ-36 to 39; srs-alignment #39).
// - Only the customer who owns a CONFIRMED booking makes its invitation (REQ-36); one per booking.
// - Each guest gets a personal link /i/<token>. The token is 24 random bytes; only its sha256 is stored, so a link
//   can't be read back: it is shown once when sent (and emailed), and "new link" replaces it.
// - Links work until the day after the event (Asia/Karachi) unless revoked; replies (yes / no, REQ-38) can be
//   changed until the event day. A bad, expired or revoked link is the same generic 404 (nothing to probe).
// - Emails go out after the database commit; a failed one leaves the guest "failed" with the reason, to retry.
//   The invitation is never lost because of the mailer (NFR-2).

const notFound = () => notFoundError('We couldn’t find that invitation.')
const badLink = () =>
  new AppError(404, 'INVITATION_NOT_FOUND', 'This invitation link isn’t valid any more. Ask your host for a new one.')
const MAX_GUESTS = 500
const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')
const newToken = () => crypto.randomBytes(24).toString('base64url')
const linkFor = (token) => `${env.clientOrigin}/i/${token}`
const todayKarachi = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
// End of the event day in Pakistan time: links stop working after that.
const linkExpiry = (eventDate) => {
  const next = new Date(Date.parse(`${eventDate}T00:00:00+05:00`) + 86_400_000)
  return next.toISOString()
}
const longDay = (day) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))
const mapsLink = (f) =>
  f.google_maps_url ??
  (f.lat !== null && f.lng !== null ? `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}` : null)

// What both the host and the guest see about the event (no money, no guest list: NFR-8).
function eventFacts(f) {
  return {
    eventDate: f.event_date,
    startTime: f.start_time,
    endTime: f.end_time,
    venueName: f.venue_name,
    hallName: f.hall_name,
    venueAddress: f.venue_address,
    venueCity: f.venue_city,
    lat: f.lat === null ? null : Number(f.lat),
    lng: f.lng === null ? null : Number(f.lng),
    mapsUrl: mapsLink(f),
  }
}

function toInvitation(row, f) {
  return {
    invitationId: row.invitation_id,
    bookingId: row.booking_id,
    template: row.template,
    title: row.title,
    eventType: row.event_type,
    hostNames: row.host_names ?? '',
    message: row.message,
    dressCode: row.dress_code ?? '',
    notes: row.notes ?? '',
    rsvpBy: row.rsvp_by ? iso(row.rsvp_by).slice(0, 10) : null,
    contactPhone: row.contact_phone,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...eventFacts(f),
  }
}

// The booking, checked: it must be this customer's (else 404) and, to write, confirmed and upcoming (REQ-36).
async function ownedBooking(db, user, bookingId, { forWrite = false } = {}) {
  const facts = await repo.findBookingFacts(db, bookingId)
  if (!facts || facts.customer_id !== user.id) throw notFoundError('We couldn’t find that booking.')
  if (forWrite && facts.status !== 'confirmed')
    throw new AppError(409, 'NOT_CONFIRMED', 'Invitations can only be made for a confirmed booking.')
  if (forWrite && !facts.upcoming) throw new AppError(409, 'EVENT_PASSED', 'This event has already taken place.')
  return facts
}

async function ownedInvitation(db, user, invitationId, { lock = false } = {}) {
  const inv = await repo.findInvitation(db, invitationId, { lock })
  if (!inv || inv.customer_id !== user.id) throw notFound()
  return inv
}

// ---------------------------------------------------------------- host: the invitation (EUC-25 steps 1-3)

export async function getForBooking(user, bookingId) {
  const facts = await ownedBooking(pool, user, bookingId)
  const row = await repo.findInvitationByBooking(pool, bookingId)
  return {
    booking: {
      bookingId,
      status: facts.status,
      eventType: facts.event_type,
      eventName: facts.event_name,
      guestCount: facts.guest_count,
      hallCapacity: facts.hall_capacity,
      hostName: facts.host_name,
      hostPhone: facts.host_phone,
      ...eventFacts(facts),
    },
    invitation: row ? toInvitation(row, facts) : null,
    totals: row ? await repo.guestTotals(pool, row.invitation_id) : null,
  }
}

export async function saveForBooking(user, bookingId, body) {
  return withTransaction(async (client) => {
    const facts = await ownedBooking(client, user, bookingId, { forWrite: true })
    if (body.rsvpBy && body.rsvpBy >= facts.event_date)
      throw validationError([{ field: 'rsvpBy', message: 'The reply deadline must be before the event day.' }])
    const fields = {
      bookingId,
      title: body.title,
      message: body.message,
      eventDate: facts.event_date, // REQ-36: date, time and venue come from the booking
      eventTime: facts.start_time,
      template: body.template,
      eventType: body.eventType,
      hostNames: body.hostNames,
      rsvpBy: body.rsvpBy || null,
      contactPhone: body.contactPhone || null,
      dressCode: body.dressCode || null,
      notes: body.notes || null,
    }
    const existing = await repo.findInvitationByBooking(client, bookingId, { lock: true })
    const row = existing
      ? await repo.updateInvitation(client, existing.invitation_id, fields)
      : await repo.insertInvitation(client, { ...fields, shareLink: `/bookings/${bookingId}/invite` })
    return { invitation: toInvitation(row, facts), created: !existing }
  })
}

// ---------------------------------------------------------------- host: guests (EUC-25 steps 4-6, EUC-27 host view)

function toGuest(g) {
  return {
    guestId: g.guest_id,
    name: g.name,
    email: g.email,
    phone: g.phone,
    delivery: g.revoked_at ? 'revoked' : g.delivery_status,
    deliveryError: g.delivery_error,
    sentAt: iso(g.sent_at),
    revokedAt: iso(g.revoked_at),
    reply: g.response
      ? { response: g.response, partySize: g.party_size, note: g.note ?? '', at: iso(g.replied_at) }
      : null,
  }
}

export async function listGuests(user, invitationId, { status, q }) {
  const inv = await ownedInvitation(pool, user, invitationId)
  const facts = await repo.findBookingFacts(pool, inv.booking_id)
  const escaped = q ? q.replace(/[\\%_]/g, (c) => `\\${c}`) : null
  const [rows, totals] = await Promise.all([
    repo.listGuests(pool, { invitationId, status, q: escaped }),
    repo.guestTotals(pool, invitationId),
  ])
  return {
    guests: rows.map(toGuest),
    totals: { ...totals, hallCapacity: facts.hall_capacity, bookedGuests: facts.guest_count },
  }
}

export async function addGuests(user, invitationId, { guests }) {
  return withTransaction(async (client) => {
    const inv = await ownedInvitation(client, user, invitationId, { lock: true })
    const facts = await ownedBooking(client, user, inv.booking_id, { forWrite: true })
    const totals = await repo.guestTotals(client, invitationId)
    if (totals.invited + guests.length > MAX_GUESTS)
      throw new AppError(409, 'TOO_MANY_GUESTS', `An invitation can have up to ${MAX_GUESTS} guests.`)
    const expiresAt = linkExpiry(facts.event_date)
    try {
      const ids = await repo.insertGuests(
        client,
        invitationId,
        guests.map((g) => ({ ...g, tokenHash: hashToken(newToken()), expiresAt })),
      )
      return { guestIds: ids }
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError(409, 'GUEST_EXISTS', 'One of these guests is already on your list (same email or mobile).')
      }
      throw err
    }
  })
}

export async function removeGuest(user, invitationId, guestId) {
  await withTransaction(async (client) => {
    await ownedInvitation(client, user, invitationId, { lock: true })
    const guest = await repo.findGuest(client, { invitationId, guestId })
    if (!guest) throw notFoundError('We couldn’t find that guest.')
    await repo.deleteGuest(client, guestId)
  })
}

export async function revokeGuest(user, invitationId, guestId) {
  await withTransaction(async (client) => {
    await ownedInvitation(client, user, invitationId, { lock: true })
    const guest = await repo.findGuest(client, { invitationId, guestId })
    if (!guest) throw notFoundError('We couldn’t find that guest.')
    await repo.revokeGuest(client, guestId)
  })
}

// Makes fresh links for the chosen guests (commit first), then emails the ones with an email address.
// -> results [{ guestId, name, link, delivery: 'sent' | 'failed' | 'manual', error }]. `link` is shown once.
async function issueAndSend(user, invitationId, { guestIds = null, email = true }) {
  const issued = await withTransaction(async (client) => {
    const inv = await ownedInvitation(client, user, invitationId, { lock: true })
    const facts = await ownedBooking(client, user, inv.booking_id, { forWrite: true })
    const guests = await repo.guestsForSend(client, { invitationId, guestIds })
    if (guestIds && guests.length !== guestIds.length) throw notFoundError('We couldn’t find that guest.')
    const expiresAt = linkExpiry(facts.event_date)
    const out = []
    for (const g of guests) {
      const token = newToken()
      await repo.rotateToken(client, { guestId: g.guest_id, tokenHash: hashToken(token), expiresAt })
      out.push({ guest: g, link: linkFor(token) })
    }
    return { inv, facts, out }
  })

  const { inv, facts, out } = issued
  const results = []
  for (const { guest, link } of out) {
    if (!email || !guest.email) {
      // No email: the host shares the link (WhatsApp, SMS, in person). Delivery stays "pending".
      await repo.markLinkIssued(pool, guest.guest_id)
      results.push({ guestId: guest.guest_id, name: guest.name, link, delivery: 'manual', error: null })
      continue
    }
    try {
      await sendInvitationEmail({
        to: guest.email,
        guestName: guest.name,
        title: inv.title,
        hostNames: inv.host_names,
        message: inv.message,
        eventDay: `${longDay(facts.event_date)}, ${facts.start_time}`,
        venueName: `${facts.venue_name}${facts.hall_name ? `, ${facts.hall_name}` : ''}`,
        link,
      })
      await repo.setDelivery(pool, { guestId: guest.guest_id, status: 'sent' })
      results.push({ guestId: guest.guest_id, name: guest.name, link, delivery: 'sent', error: null })
    } catch (err) {
      const reason = err?.message?.slice(0, 200) || 'The email could not be sent.'
      logger.warn({ err: { message: reason }, invitationId }, 'invitation email not delivered') // never the link
      await repo.setDelivery(pool, { guestId: guest.guest_id, status: 'failed', error: reason })
      results.push({ guestId: guest.guest_id, name: guest.name, link, delivery: 'failed', error: reason })
    }
  }
  return { results }
}

// EUC-25 step 5: send to everyone not sent yet (pending or failed), or to the chosen guests.
export const sendInvitations = (user, invitationId, { guestIds }) =>
  issueAndSend(user, invitationId, { guestIds: guestIds?.length ? guestIds : null })

// Re-send one guest's invitation (a new link; the old one stops working).
export const resendGuest = (user, invitationId, guestId) => issueAndSend(user, invitationId, { guestIds: [guestId] })

// A new link to copy, without emailing (the old link stops working).
export const newGuestLink = (user, invitationId, guestId) =>
  issueAndSend(user, invitationId, { guestIds: [guestId], email: false })

export async function mySummaries(user) {
  const rows = await repo.summariesForCustomer(pool, user.id)
  return {
    data: rows.map((r) => ({
      invitationId: r.invitation_id,
      bookingId: r.booking_id,
      title: r.title,
      invited: r.invited,
      attending: r.attending,
      declined: r.declined,
      awaiting: r.invited - r.attending - r.declined,
      people: r.people,
    })),
  }
}

// ---------------------------------------------------------------- public: the guest's link (EUC-26, EUC-27)

const rsvpOpen = (eventDate) => todayKarachi() <= eventDate

// Only this guest's name and reply, and the event (no other guests, no money: NFR-8).
export async function getByToken(token) {
  const guest = await repo.findGuestByToken(pool, hashToken(token))
  if (!guest) throw badLink()
  const inv = await repo.findInvitation(pool, guest.invitation_id)
  const facts = await repo.findBookingFacts(pool, guest.booking_id)
  const card = toInvitation(inv, facts)
  for (const key of ['invitationId', 'bookingId', 'createdAt', 'updatedAt']) delete card[key] // guests don't need ids
  return {
    invitation: card,
    guest: {
      name: guest.name,
      reply: guest.response
        ? { response: guest.response, partySize: guest.party_size, note: guest.note ?? '', at: iso(guest.replied_at) }
        : null,
    },
    rsvpOpen: rsvpOpen(facts.event_date),
  }
}

export async function rsvpByToken(token, { response, partySize, note }) {
  return withTransaction(async (client) => {
    const guest = await repo.findGuestByToken(client, hashToken(token), { lock: true })
    if (!guest) throw badLink()
    const facts = await repo.findBookingFacts(client, guest.booking_id)
    if (!rsvpOpen(facts.event_date))
      throw new AppError(409, 'RSVP_CLOSED', 'Replies are closed: the event day has passed.')
    const row = await repo.upsertRsvp(client, {
      guestId: guest.guest_id,
      response,
      partySize: response === 'no' ? 0 : partySize,
      note: note || null,
    })
    return {
      reply: { response: row.response, partySize: row.party_size, note: row.note ?? '', at: iso(row.updated_at) },
    }
  })
}
