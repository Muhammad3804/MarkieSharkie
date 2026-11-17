import { createMockStore, latency } from './mockStore.js'
import { getBooking, listMyBookings } from './bookings.js'
import { getVenueById } from './venues.js'
import { validateInviteStep, validateRsvp } from '../features/invitations/schema.js'
import { normalizePkMobile } from '../lib/phone.js'
import { todayKey } from '../lib/format.js'

// Mock invitation API (localStorage `markiesharkie:invitations`) until the server exists. Rows are shaped like
// `invitations`, `guests` and `rsvps` in db/schema.sql (camelCase); each export names the endpoint that replaces it
// (docs/api-and-security.md "Invitations" / "Guest").
//
// Deviations, all in docs/srs-alignment.md #21 (decided 2026-11-17):
// - One open link per invitation (/invite/:invitationId). Guests register themselves when they reply: the reply
//   creates a `guests` row (name + phone, its own invite_token) and an `rsvps` row. The host-added guest list with
//   one /i/:token link per guest and WhatsApp delivery status (REQ-37) is a later task.
// - Proposed [Design] columns: invitations.template, event_type, host_names, rsvp_by, contact_phone and
//   rsvps.party_size. The rsvp_response enum stays yes / no (REQ-38).
// - In the mock, a guest's reply is saved in the guest's own browser. Replies only reach the host when both use
//   the same browser profile (the demo). TODO(server): POST /i/:token/rsvp makes them shared.
// TODO(auth): host calls act as the demo customer (api/bookings.js), like the rest of the booking mock.

const store = createMockStore('markiesharkie:invitations', {
  seed: () => ({ version: 1, invitations: [], guests: [], rsvps: [] }),
  isValid: (value) => value?.version === 1 && Array.isArray(value.invitations) && Array.isArray(value.guests) && Array.isArray(value.rsvps),
})

export class InvitationError extends Error {
  // code: NOT_FOUND | NOT_CONFIRMED | VALIDATION | RSVP_CLOSED
  constructor(code, message, details) {
    super(message)
    this.name = 'InvitationError'
    this.code = code
    this.details = details
  }
}

const withLock = (task) => (typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request('markiesharkie:invitations', task) : task())
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`)
// guests.invite_token: 32 random bytes, base64url (docs/api-and-security.md).
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Booking facts the invitation shows (the server joins them from bookings / time_slots / venues / halls).
async function bookingFacts(booking) {
  let venue = null
  try {
    venue = await getVenueById(booking.venueId)
  } catch (error) {
    console.warn('[invitations] venue lookup failed', error)
  }
  const hall = venue?.halls.find((h) => h.hallId === booking.hallId)
  return {
    bookingId: booking.bookingId,
    eventDate: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    venueName: booking.venueName,
    hallName: booking.hallName,
    venueAddress: venue?.address ?? booking.venueCity,
    lat: venue?.lat ?? null,
    lng: venue?.lng ?? null,
    hallCapacity: hall?.capacity ?? null,
    bookedGuests: booking.guestCount,
  }
}

// What the builder needs for a booking: { booking, facts, invitation (or null) }. Throws NOT_FOUND / NOT_CONFIRMED.
export async function getInvitationContext(bookingId) {
  const booking = await getBooking(bookingId)
  if (!booking) throw new InvitationError('NOT_FOUND', 'We couldn’t find this booking.')
  const facts = await bookingFacts(booking)
  const invitation = store.get().invitations.find((i) => i.bookingId === bookingId) ?? null
  return { booking, facts, invitation }
}

// POST /api/bookings/:id/invitation (creates, or updates this booking's invitation; the id and link stay the same).
// REQ-36: only for a Confirmed booking. Title / message / date / time / venue come from the booking.
export async function saveInvitation(bookingId, input) {
  await latency(300)
  const booking = await getBooking(bookingId)
  if (!booking) throw new InvitationError('NOT_FOUND', 'We couldn’t find this booking.')
  if (booking.status !== 'confirmed') throw new InvitationError('NOT_CONFIRMED', 'Invitations can only be made for a confirmed booking.')
  for (const step of ['template', 'details']) {
    const result = validateInviteStep(step, input, booking.date)
    if (!result.valid) throw new InvitationError('VALIDATION', Object.values(result.errors)[0], result.errors)
  }
  const facts = await bookingFacts(booking)
  return withLock(() => {
    const now = new Date().toISOString()
    const existing = store.get().invitations.find((i) => i.bookingId === bookingId)
    const invitationId = existing?.invitationId ?? uuid()
    const invitation = {
      invitationId,
      bookingId,
      title: input.title.trim(),
      message: input.message.trim(),
      eventDate: facts.eventDate, // invitations.event_date
      eventTime: facts.startTime, // invitations.event_time
      shareLink: `/invite/${invitationId}`,
      qrEnabled: false, // REQ-40 check-in QR, separate task (SSD6)
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      // Proposed [Design] columns (srs-alignment #21)
      template: input.template,
      eventType: input.eventType,
      hostNames: input.hostNames.trim(),
      rsvpBy: input.rsvpBy,
      contactPhone: normalizePkMobile(input.contactPhone),
      // Joined by the server
      ...facts,
    }
    store.update((state) => ({
      ...state,
      invitations: existing ? state.invitations.map((i) => (i.invitationId === invitationId ? invitation : i)) : [...state.invitations, invitation],
    }))
    return invitation
  })
}

// Only what a guest may see (NFR-8: no guest list, no booking money).
export function toPublicCard(invitation) {
  const { invitationId, template, title, eventType, hostNames, message, eventDate, startTime, endTime, venueName, hallName, venueAddress, lat, lng, rsvpBy, contactPhone } = invitation
  return { invitationId, template, title, eventType, hostNames, message, eventDate, startTime, endTime, venueName, hallName, venueAddress, lat, lng, rsvpBy, contactPhone }
}

// GET /i/:token (here: by invitation id). null when this browser has no copy; the page then uses the link's card.
export async function getPublicInvitation(invitationId) {
  await latency(120)
  const invitation = store.get().invitations.find((i) => i.invitationId === invitationId)
  return invitation ? toPublicCard(invitation) : null
}

export const isRsvpOpen = (rsvpBy, today = todayKey()) => Boolean(rsvpBy) && today <= rsvpBy

// POST /i/:token/rsvp. `card` is the invitation as the guest sees it, used for the deadline when this browser has
// no stored copy (mock only: the server always has the invitation). Same phone on the same invitation = the same
// guest (guests UNIQUE (invitation_id, phone)), so a reply can be changed later (EUC-26 4.1).
// Returns { inviteToken, reply } so the guest's device can find its reply again.
export async function submitRsvp(invitationId, input, card) {
  await latency(300)
  const check = validateRsvp(input)
  if (!check.valid) throw new InvitationError('VALIDATION', Object.values(check.errors)[0], check.errors)
  return withLock(() => {
    const state = store.get()
    const invitation = state.invitations.find((i) => i.invitationId === invitationId) ?? card
    if (!invitation) throw new InvitationError('NOT_FOUND', 'This invitation no longer exists.')
    if (!isRsvpOpen(invitation.rsvpBy)) throw new InvitationError('RSVP_CLOSED', 'Replies for this event have closed.')
    const phone = normalizePkMobile(input.phone)
    const now = new Date().toISOString()
    const existing = state.guests.find((g) => g.invitationId === invitationId && g.phone === phone)
    const guest = existing
      ? { ...existing, name: input.name.trim() }
      : { guestId: uuid(), invitationId, name: input.name.trim(), phone, inviteToken: randomToken(), deliveryStatus: 'delivered', deliveryError: null }
    const previous = state.rsvps.find((r) => r.guestId === guest.guestId)
    const rsvp = { rsvpId: previous?.rsvpId ?? uuid(), guestId: guest.guestId, response: input.response, partySize: input.response === 'yes' ? input.partySize : 0, respondedAt: now }
    store.update((current) => ({
      ...current,
      guests: existing ? current.guests.map((g) => (g.guestId === guest.guestId ? guest : g)) : [...current.guests, guest],
      rsvps: previous ? current.rsvps.map((r) => (r.rsvpId === rsvp.rsvpId ? rsvp : r)) : [...current.rsvps, rsvp],
    }))
    // TODO(server): notify the host (notification_type 'invitation') after commit.
    return { inviteToken: guest.inviteToken, reply: { name: guest.name, phone, response: rsvp.response, partySize: rsvp.partySize, respondedAt: now } }
  })
}

// The guest's own reply, found by the token their device kept. null when unknown.
export function getMyReply(invitationId, inviteToken) {
  const state = store.get()
  const guest = state.guests.find((g) => g.invitationId === invitationId && g.inviteToken === inviteToken)
  const rsvp = guest && state.rsvps.find((r) => r.guestId === guest.guestId)
  return rsvp ? { name: guest.name, phone: guest.phone, response: rsvp.response, partySize: rsvp.partySize, respondedAt: rsvp.respondedAt } : null
}

// GET /invitations/:id/rsvp-summary for every invitation of the customer's bookings: { [bookingId]: summary }.
// Guest names and phones are the inviting customer's only (NFR-8).
export async function listMyInvitationSummaries() {
  const bookings = await listMyBookings()
  const mine = new Set(bookings.map((b) => b.bookingId))
  const state = store.get()
  const result = {}
  for (const invitation of state.invitations) {
    if (!mine.has(invitation.bookingId)) continue
    const responses = state.guests
      .filter((g) => g.invitationId === invitation.invitationId)
      .map((g) => ({ guest: g, rsvp: state.rsvps.find((r) => r.guestId === g.guestId) }))
      .filter(({ rsvp }) => rsvp)
      .map(({ guest, rsvp }) => ({ guestId: guest.guestId, name: guest.name, phone: guest.phone, response: rsvp.response, partySize: rsvp.partySize, respondedAt: rsvp.respondedAt }))
      .sort((a, b) => Date.parse(b.respondedAt) - Date.parse(a.respondedAt))
    const attending = responses.filter((r) => r.response === 'yes')
    result[invitation.bookingId] = {
      invitation,
      attendingReplies: attending.length,
      attendingGuests: attending.reduce((sum, r) => sum + r.partySize, 0),
      declined: responses.length - attending.length,
      responses,
    }
  }
  return result
}

// Admin Settings "Reset demo data" and tests.
export function resetInvitations() {
  store.reset()
}
