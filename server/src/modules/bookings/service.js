import { env } from '../../config/env.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { sendBookingRequestEmail } from '../../integrations/mailer.js'
import { logger } from '../../lib/logger.js'
import { absolute } from '../venues/mappers.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { validationError } from '../../lib/validation.js'
import { MAX_ADD_ON_QUANTITY, MIN_GUESTS, policyTiers, priceBooking, refundOnCancel } from './pricing.js'
import * as repo from './repository.js'

// The booking engine (EUC-14, 15, 16, 24, SYS-01; docs/booking-engine.md, srs-alignment #1, #20, #38).
//
//   slot:    available --hold--> held --book--> booked --cancel / reject / expire--> available
//            (a hold past held_until counts as available: lazy release, plus the 30 s job)
//   booking: requested --owner confirms--> confirmed --event date passes--> completed
//            requested --owner rejects / customer cancels / event date passes--> cancelled (closed_as says which)
//            confirmed --customer cancels before the event date--> cancelled
// Anything else is 409 INVALID_TRANSITION. Every change locks the slot row, then the booking row, and writes
// booking_events in the same transaction. The DB constraints (one active booking per slot, no overlapping slots)
// are the last line of defence: a lost race is a 409, never a 500.

export const EXPIRED_REASON = 'Expired: the venue did not respond before the event date'
export const REJECTED_PREFIX = 'Rejected by the venue: '
const slotTypeOf = (startTime) => (startTime < '17:00' ? 'lunch' : 'dinner')
const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))
const notFound = () => notFoundError('We couldn’t find that booking.')
const unavailableVenue = () => notFoundError('This venue isn’t taking bookings right now.')
const invalidTransition = (status, action) =>
  new AppError(409, 'INVALID_TRANSITION', `This booking is ${status}, so it can’t be ${action}. Refresh the page.`)

// A race lost at the database (unique active booking per slot / no overlapping slot) is a 409, not a 500.
function mapRace(err) {
  if (err?.code === '23505' || err?.code === '23P01') {
    return new AppError(409, 'SLOT_TAKEN', 'Someone else just booked this slot. Pick another date, time or hall.')
  }
  return err
}

// ---------------------------------------------------------------- holds (REQ-18, EUC-14 steps 1-3)

export async function holdSlot(user, slotId) {
  return withTransaction(async (client) => {
    const slot = await repo.lockSlot(client, slotId)
    if (!slot) throw notFoundError('We couldn’t find that time slot.')
    const venue = await repo.findBookableVenue(client, slot.venue_id)
    if (!venue?.bookable) throw unavailableVenue()
    if (slot.is_past) throw new AppError(409, 'PAST_DATE', 'That date has passed. Pick a date from today on.')
    const mine = slot.status === 'held' && slot.held_by === user.id && !slot.hold_expired
    const free = slot.status === 'available' || (slot.status === 'held' && slot.hold_expired)
    if (!free && !mine) {
      const message =
        slot.status === 'held' ? 'Someone else is booking this slot right now.' : 'This slot is already booked.'
      const alternatives = await repo.alternatives(client, {
        venueId: slot.venue_id,
        hallId: slot.hall_id,
        date: slot.date,
        startTime: slot.start_time,
      })
      throw new AppError(409, 'SLOT_UNAVAILABLE', message, { alternatives })
    }
    await repo.releaseOtherHolds(client, { customerId: user.id, venueId: slot.venue_id, exceptSlotId: slotId })
    // An own running hold is kept as it is (not extended), so the timer can't be reset forever.
    const heldUntil = mine
      ? slot.held_until
      : await repo.setHold(client, { slotId, customerId: user.id, minutes: env.slotHoldMinutes })
    return {
      hold: {
        slotId,
        venueId: slot.venue_id,
        hallId: slot.hall_id,
        date: slot.date,
        slotType: slotTypeOf(slot.start_time),
        startTime: slot.start_time,
        endTime: slot.end_time,
        heldUntil: iso(heldUntil),
      },
    }
  })
}

export async function releaseHold(user, slotId) {
  await withTransaction(async (client) => {
    const slot = await repo.lockSlot(client, slotId)
    if (slot?.status === 'held' && slot.held_by === user.id) await repo.setSlotStatus(client, slotId, 'available')
  })
}

// ---------------------------------------------------------------- book (REQ-19, REQ-20, EUC-14 steps 4-6, EUC-24)

// The customer's receipt email (requested by the team, 2026-11-23). Sent after the commit; a mail problem is logged
// (reference only, no personal data) and never affects the booking (NFR-2).
const money = (amount) => `Rs. ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const longDay = (day) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))
const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
export const bookingReference = (bookingId) => `MS-${bookingId.replace(/-/g, '').slice(0, 6).toUpperCase()}`

async function emailBookingRequest(bookingId) {
  const reference = bookingReference(bookingId)
  try {
    const row = await repo.findBooking(pool, bookingId)
    if (!row?.customer_email) return
    await sendBookingRequestEmail({
      to: row.customer_email,
      name: row.customer_name,
      reference,
      eventName: row.event_name,
      venueName: row.venue_name,
      hallName: row.hall_name,
      eventDay: longDay(row.event_date),
      timeRange: `${time12(row.start_time)} to ${time12(row.end_time)}`,
      guests: row.guest_count,
      total: money(row.total_amount),
      advance: `${money(row.advance_due)} (${row.advance_percent}%), once the venue confirms`,
      link: `${env.clientOrigin}/bookings`,
    })
  } catch (err) {
    logger.warn({ err: { message: err.message }, reference }, 'booking request email not sent')
  }
}

export async function createBooking(user, body) {
  const result = await createBookingTx(user, body)
  await emailBookingRequest(result.booking.bookingId)
  return result
}

async function createBookingTx(user, body) {
  try {
    return await withTransaction(async (client) => {
      const slot = await repo.lockSlot(client, body.slotId)
      if (!slot) throw notFoundError('We couldn’t find that time slot.')
      if (slot.status !== 'held' || slot.held_by !== user.id || slot.hold_expired) {
        throw new AppError(409, 'HOLD_EXPIRED', 'Your hold on this slot has expired. Pick the slot again to continue.')
      }
      const venue = await repo.findBookableVenue(client, slot.venue_id)
      if (!venue?.bookable) throw unavailableVenue()
      if (slot.is_past) throw new AppError(409, 'PAST_DATE', 'That date has passed. Pick a date from today on.')

      const problems = []
      const hall = await repo.findHall(client, slot.hall_id)
      if (body.guestCount < MIN_GUESTS)
        problems.push({ field: 'guestCount', message: `Bookings start at ${MIN_GUESTS} guests.` })
      if (body.guestCount > hall.capacity)
        problems.push({
          field: 'guestCount',
          message: `${hall.name} holds up to ${hall.capacity.toLocaleString('en-US')} guests. Pick a larger hall or fewer guests.`,
        })
      let menu = null
      if (body.menuPackageId) {
        menu = await repo.findLiveMenu(client, { venueId: venue.venue_id, menuId: body.menuPackageId })
        if (!menu)
          problems.push({ field: 'menuPackageId', message: 'That menu is no longer offered. Pick another one.' })
      } else if ((await repo.countLiveMenus(client, venue.venue_id)) > 0) {
        problems.push({ field: 'menuPackageId', message: 'Pick a menu.' })
      }
      const wanted = body.addOns.filter((a) => a.quantity > 0)
      const rows = wanted.length
        ? await repo.findLiveAddOns(client, { venueId: venue.venue_id, ids: wanted.map((a) => a.addOnId) })
        : []
      const byId = new Map(rows.map((r) => [r.add_on_id, r]))
      wanted.forEach((a, i) => {
        if (!byId.has(a.addOnId))
          problems.push({ field: `addOns.${i}`, message: 'One of the add-ons is no longer available. Remove it.' })
      })
      if (problems.length) throw validationError(problems)

      const price = priceBooking({
        guests: body.guestCount,
        menu,
        addOns: wanted.map((a) => ({ row: byId.get(a.addOnId), quantity: a.quantity })),
        advancePercent: venue.advance_percent,
      })
      const tiers = venue.cancellation_policy === 'custom' ? await repo.findTiers(client, venue.venue_id) : []
      const policySnapshot = {
        policy: venue.cancellation_policy,
        tiers: policyTiers(venue.cancellation_policy, tiers),
        note: venue.cancellation_note,
      }
      const bookingId = await repo.insertBooking(client, {
        slotId: slot.slot_id,
        customerId: user.id,
        venueId: venue.venue_id,
        hallId: slot.hall_id,
        menuId: menu?.menu_id ?? null,
        menuPricePerHead: price.menuPricePerHead,
        eventType: body.eventType,
        guests: body.guestCount,
        billable: price.billable,
        total: price.total,
        hallCharge: price.hallCharge,
        advancePercent: venue.advance_percent,
        advanceDue: price.advanceDue,
        policySnapshot,
        notes: body.specialRequests || null,
        eventName: body.eventName,
        hostName: body.hostName,
        hostPhone: body.hostPhone,
      })
      await repo.insertBookingAddOns(client, bookingId, price.addOns)
      await repo.setSlotStatus(client, slot.slot_id, 'booked')
      await repo.insertEvent(client, { bookingId, to: 'requested', actorId: user.id, actorRole: 'customer' })
      // TODO(notifications, REQ-19 / REQ-45): tell the owner; emit slot:updated after commit (Socket.io, REQ-16).
      return { booking: await loadBooking(client, bookingId, { view: 'customer' }) }
    })
  } catch (err) {
    throw mapRace(err)
  }
}

// ---------------------------------------------------------------- reads

function toBooking(row, addOns = [], events = null, { view }) {
  const snapshot = row.policy_snapshot ?? { policy: 'strict', tiers: [], note: null }
  const closedAs = row.closed_as
  return {
    bookingId: row.booking_id,
    slotId: row.slot_id,
    venueId: row.venue_id,
    venueName: row.venue_name,
    venueCity: row.venue_city,
    coverUrl: row.cover_url ?? null,
    hallId: row.hall_id,
    hallName: row.hall_name,
    date: row.event_date,
    slotType: slotTypeOf(row.start_time),
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    closedAs,
    source: row.source,
    eventType: row.event_type,
    eventName: row.event_name ?? '',
    hostName: row.host_name ?? row.client_name ?? '',
    hostPhone: row.host_phone ?? row.client_phone ?? '',
    specialRequests: row.customer_notes ?? '',
    guestCount: row.guest_count,
    billableGuests: row.billable_guests ?? row.guest_count,
    menuPackageId: row.menu_package_id,
    menuName: row.menu_name,
    menuPricePerHead: row.menu_price_per_head,
    hallCharge: row.hall_charge,
    addOns: addOns.map((a) => ({
      addOnId: a.add_on_id,
      name: a.name,
      type: a.type,
      quantity: a.quantity,
      unitPrice: a.unit_price,
    })),
    totalAmount: row.total_amount,
    advancePercent: row.advance_percent ?? 0,
    advanceDue: row.advance_due,
    advanceAmount: row.advance_amount,
    cancellationReason: row.cancellation_reason,
    refundPercent: row.refund_percent,
    refundAmount: row.refund_amount,
    policy: snapshot,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    // The owner needs to reach the customer; the customer already knows themselves (NFR-8: no extra exposure).
    ...(view === 'owner'
      ? {
          customer: {
            name: row.customer_name ?? row.client_name,
            phone: row.customer_phone ?? row.client_phone,
            email: row.customer_email,
          },
        }
      : {}),
    ...(events
      ? {
          events: events.map((e) => ({
            from: e.from_status,
            to: e.to_status,
            by: e.actor_role,
            byName: e.actor_role === 'system' ? null : e.actor_name,
            reason: e.reason,
            at: iso(e.created_at),
          })),
        }
      : {}),
  }
}

export async function loadBooking(db, bookingId, { view, origin = null }) {
  const row = await repo.findBooking(db, bookingId)
  const [addOns, events] = await Promise.all([repo.bookingAddOns(db, [bookingId]), repo.bookingEvents(db, bookingId)])
  const out = toBooking(row, addOns, events, { view })
  out.coverUrl = row.cover_url ? absolute(origin, row.cover_url) : null
  return out
}

async function withAddOns(db, rows, { view, origin }) {
  const addOns = rows.length
    ? await repo.bookingAddOns(
        db,
        rows.map((r) => r.booking_id),
      )
    : []
  return rows.map((row) => {
    const out = toBooking(
      row,
      addOns.filter((a) => a.booking_id === row.booking_id),
      null,
      { view },
    )
    out.coverUrl = row.cover_url ? absolute(origin, row.cover_url) : null
    return out
  })
}

// The nightly jobs, run lazily before reads so a stale request never shows as pending (docs/booking-engine.md).
export const settle = (db = pool) => repo.settleBookings(db, EXPIRED_REASON)

export async function listMyBookings(user, { page, pageSize }, { origin }) {
  await settle()
  const rows = await repo.listCustomerBookings(pool, user.id, { limit: pageSize, offset: (page - 1) * pageSize })
  const total = rows[0]?.total ?? 0
  return {
    data: await withAddOns(pool, rows, { view: 'customer', origin }),
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

// The booking's customer, or the owner of its venue. Anyone else gets 404 (ids can't be probed).
export async function getBooking(user, bookingId, { origin }) {
  await settle()
  const row = await repo.findBooking(pool, bookingId)
  if (!row) throw notFound()
  const view = row.customer_id === user.id ? 'customer' : row.owner_id === user.id ? 'owner' : null
  if (!view) throw notFound()
  return { booking: await loadBooking(pool, bookingId, { view, origin }) }
}

export async function listOwnerBookings(user, { status, venueId, page, pageSize }, { origin }) {
  await settle()
  const rows = await repo.listOwnerBookings(pool, user.id, {
    status,
    venueId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const total = rows[0]?.total ?? 0
  return {
    data: await withAddOns(pool, rows, { view: 'owner', origin }),
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts: await repo.ownerCounts(pool, user.id),
  }
}

// ---------------------------------------------------------------- transitions (EUC-15, EUC-16)

// Locks the slot, then the booking; settles it first (an expired request can't be confirmed).
async function lockForChange(client, bookingId) {
  const slotId = await repo.findSlotIdOfBooking(client, bookingId)
  if (!slotId) throw notFound()
  await repo.lockSlot(client, slotId)
  await repo.settleBookings(client, EXPIRED_REASON)
  const booking = await repo.lockBooking(client, bookingId)
  if (!booking) throw notFound()
  return booking
}

// EUC-16 / REQ-22: the customer cancels before the event date. The refund is recorded from the policy snapshot.
export async function cancelBooking(user, bookingId, { reason }, { origin }) {
  return withTransaction(async (client) => {
    const b = await lockForChange(client, bookingId)
    if (b.customer_id !== user.id) throw notFound()
    if (!['requested', 'held', 'confirmed'].includes(b.status)) throw invalidTransition(b.status, 'cancelled')
    if (b.days_before <= 0)
      throw new AppError(409, 'INVALID_TRANSITION', 'Bookings can only be cancelled before the event date.')
    const refund = refundOnCancel({
      snapshot: b.policy_snapshot,
      advanceDue: b.advance_due,
      wasConfirmed: b.status === 'confirmed',
      daysBefore: b.days_before,
    })
    await repo.closeBooking(client, {
      bookingId,
      closedAs: 'cancelled',
      reason,
      refundPercent: refund.percent,
      refundAmount: refund.amount,
    })
    await repo.setSlotStatus(client, b.slot_id, 'available')
    await repo.insertEvent(client, {
      bookingId,
      from: b.status,
      to: 'cancelled',
      actorId: user.id,
      actorRole: 'customer',
      reason,
    })
    return { booking: await loadBooking(client, bookingId, { view: 'customer', origin }) }
  })
}

async function ownerTransition(user, bookingId, { origin }, change) {
  return withTransaction(async (client) => {
    const b = await lockForChange(client, bookingId)
    if (b.owner_id !== user.id) throw notFound()
    await change(client, b)
    return { booking: await loadBooking(client, bookingId, { view: 'owner', origin }) }
  })
}

// EUC-15 / REQ-21: confirm (requested -> confirmed directly; 'held' = awaiting advance waits for payments, #38).
export const confirmBooking = (user, bookingId, ctx) =>
  ownerTransition(user, bookingId, ctx, async (client, b) => {
    if (!['requested', 'held'].includes(b.status)) throw invalidTransition(b.status, 'confirmed')
    await repo.setBookingStatus(client, bookingId, 'confirmed')
    await repo.insertEvent(client, {
      bookingId,
      from: b.status,
      to: 'confirmed',
      actorId: user.id,
      actorRole: 'venue_owner',
    })
  })

// EUC-15 3.1: reject with a reason; the slot is free again.
export const rejectBooking = (user, bookingId, { reason }, ctx) =>
  ownerTransition(user, bookingId, ctx, async (client, b) => {
    if (!['requested', 'held'].includes(b.status)) throw invalidTransition(b.status, 'rejected')
    await repo.closeBooking(client, {
      bookingId,
      closedAs: 'rejected',
      reason: `${REJECTED_PREFIX}${reason}`,
      refundPercent: 0,
      refundAmount: '0.00',
    })
    await repo.setSlotStatus(client, b.slot_id, 'available')
    await repo.insertEvent(client, {
      bookingId,
      from: b.status,
      to: 'cancelled',
      actorId: user.id,
      actorRole: 'venue_owner',
      reason,
    })
  })

// ---------------------------------------------------------------- jobs (REQ-18)

export async function runBookingJobs() {
  const released = await repo.releaseExpiredHolds(pool)
  const settled = await settle()
  return { released: released.length, ...settled }
}

export { MAX_ADD_ON_QUANTITY }
