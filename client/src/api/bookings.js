import { ApiError, apiFetch } from './http.js'
import { getVenueAvailability } from './venues.js'
import { addDays } from '../lib/days.js'
import { todayKey } from '../lib/format.js'

// Booking API (server/openapi.yaml "Bookings", docs/booking-engine.md). Holds and bookings live in PostgreSQL; the
// server checks the hold, prices the booking and stops double booking (SYS-01). Same function names as the
// localStorage mock this replaced, so the pages didn't change shape.
//
//   GET    /api/venues/:id/availability   slots per hall (expired holds read as available; heldByMe for my hold)
//   POST   /api/slots/:slotId/hold        DELETE /api/slots/:slotId/hold
//   POST   /api/bookings                  GET /api/bookings   GET /api/bookings/:id   POST /api/bookings/:id/cancel
//   GET    /api/owner/bookings            POST /api/owner/bookings/:id/confirm | reject

export class BookingError extends Error {
  // code: SLOT_UNAVAILABLE | SLOT_TAKEN | HOLD_EXPIRED | PAST_DATE | VALIDATION | NOT_FOUND | INVALID_TRANSITION | UNAUTHENTICATED
  constructor(code, message, details) {
    super(message)
    this.name = 'BookingError'
    this.code = code
    this.details = details
  }
}

function rethrow(error) {
  if (!(error instanceof ApiError)) throw error
  const code = error.code === 'VALIDATION_ERROR' ? 'VALIDATION' : error.code
  const field = Object.values(error.fieldErrors)[0]
  throw new BookingError(code, field && code === 'VALIDATION' ? field : error.message, error.details?.alternatives ?? error.fieldErrors)
}

// The server names the evening slot 'dinner' (venue_slot_templates); the booking UI calls it 'evening'.
const toSlot = (slotType) => (slotType === 'lunch' ? 'lunch' : 'evening')
const AVAILABILITY_DAYS = 91 // the server returns at most 92 days per request; slots exist ~60 days ahead

// ---------------------------------------------------------------------------------------------------------------
// Slots

// -> [{ slotId, hallId, date, slot, startTime, endTime, status, heldUntil?, heldByMe? }] from `from` to `to`.
// Days the venue hasn't opened yet (no slot rows) are simply missing; the calendar shows them as unavailable.
export async function getVenueSlots(venueId, { from, to }) {
  const end = to < addDays(from, AVAILABILITY_DAYS) ? to : addDays(from, AVAILABILITY_DAYS)
  const { halls } = await getVenueAvailability(venueId, { from, to: end })
  return halls.flatMap((hall) =>
    hall.slots.map((s) => ({
      slotId: s.slotId,
      hallId: hall.hallId,
      date: s.date,
      slot: toSlot(s.slotType),
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      heldUntil: s.heldUntil ?? null,
      heldByMe: Boolean(s.heldByMe),
    })),
  )
}

async function findSlot(venueId, { hallId, date, slot }) {
  const rows = await getVenueSlots(venueId, { from: date, to: date })
  return rows.find((r) => r.hallId === hallId && r.slot === slot) ?? null
}

// Nearest free dates for the same hall and slot, and other halls free at the same date and slot (EUC-14 2.1).
async function alternativesFor(venueId, { hallId, date, slot }) {
  const today = todayKey()
  const from = addDays(date, -30) < today ? today : addDays(date, -30)
  const rows = await getVenueSlots(venueId, { from, to: addDays(date, 60) })
  const free = (r) => (r.status === 'available' || r.heldByMe) && r.date >= today
  const dates = rows
    .filter((r) => r.hallId === hallId && r.slot === slot && r.date !== date && free(r))
    .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(date)) - Math.abs(Date.parse(b.date) - Date.parse(date)))
    .slice(0, 3)
    .map((r) => r.date)
    .sort()
  const hallIds = rows.filter((r) => r.date === date && r.slot === slot && r.hallId !== hallId && free(r)).map((r) => r.hallId)
  return { dates, hallIds }
}

// -> { status, available, alternatives } for one hall slot. A day with no slot row isn't open for booking.
export async function checkSlot({ venueId, hallId, date, slot, halls = [] }) {
  if (date < todayKey()) throw new BookingError('PAST_DATE', 'That date has passed. Pick a date from today on.')
  const row = await findSlot(venueId, { hallId, date, slot })
  const status = row ? (row.heldByMe ? 'available' : row.status) : 'blocked'
  if (status === 'available') return { status, available: true, alternatives: null }
  const alt = await alternativesFor(venueId, { hallId, date, slot })
  return { status, available: false, alternatives: { dates: alt.dates, halls: halls.filter((h) => alt.hallIds.includes(h.hallId)) } }
}

// POST /api/slots/:slotId/hold -> { slotId, heldUntil }. A running hold of mine on the same slot comes back as is.
export async function holdSlot({ venueId, hallId, date, slot }) {
  const row = await findSlot(venueId, { hallId, date, slot })
  if (!row) throw new BookingError('SLOT_UNAVAILABLE', 'This venue doesn’t take bookings for that date and time.', { dates: [], halls: [] })
  try {
    const { hold } = await apiFetch(`/slots/${encodeURIComponent(row.slotId)}/hold`, { method: 'POST', body: {} })
    return { slotId: hold.slotId, heldUntil: hold.heldUntil }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'SLOT_UNAVAILABLE') {
      const alt = error.details?.alternatives ?? { dates: [], halls: [] }
      throw new BookingError('SLOT_UNAVAILABLE', error.message, alt)
    }
    return rethrow(error)
  }
}

// DELETE /api/slots/:slotId/hold. No-op when the hold is gone or isn't mine.
export async function releaseHold(slotId) {
  try {
    await apiFetch(`/slots/${encodeURIComponent(slotId)}/hold`, { method: 'DELETE' })
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Bookings

// Server booking -> what the pages use. bookingTerms is the policy snapshot taken when the booking was made.
function toBooking(b) {
  return {
    ...b,
    slot: toSlot(b.slotType),
    bookingTerms: {
      advancePercent: b.advancePercent,
      cancellationPolicy: b.policy?.policy ?? 'strict',
      customTiers: (b.policy?.tiers ?? []).map((t) => ({ fromDays: t.fromDays, toDays: t.toDays ?? '', refundPercent: t.percent })),
      note: b.policy?.note ?? '',
    },
  }
}

// POST /api/bookings -> the new booking (status 'requested'). The hold must still be mine.
export async function requestBooking(draft) {
  try {
    const { booking } = await apiFetch('/bookings', {
      method: 'POST',
      body: {
        slotId: draft.slotId,
        eventType: draft.eventType,
        guestCount: Number(draft.guests),
        menuPackageId: draft.menuId || null,
        addOns: Object.entries(draft.addOns ?? {})
          .filter(([, quantity]) => quantity > 0)
          .map(([addOnId, quantity]) => ({ addOnId, quantity })),
        eventName: draft.eventName.trim(),
        hostName: draft.hostName.trim(),
        hostPhone: draft.hostPhone.trim(),
        specialRequests: draft.specialRequests.trim(),
      },
    })
    return toBooking(booking)
  } catch (error) {
    return rethrow(error)
  }
}

// GET /api/bookings (mine, newest event first).
export async function listMyBookings() {
  const { data } = await apiFetch('/bookings?pageSize=50')
  return data.map(toBooking)
}

// GET /api/bookings/:id -> booking with its history, or null when it isn't mine (or my venue's).
export async function getBooking(bookingId) {
  try {
    const { booking } = await apiFetch(`/bookings/${encodeURIComponent(bookingId)}`)
    return toBooking(booking)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    return rethrow(error)
  }
}

// POST /api/bookings/:id/cancel { reason } (REQ-22) -> the cancelled booking with the recorded refund.
export async function cancelBooking(bookingId, reason) {
  try {
    const { booking } = await apiFetch(`/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST', body: { reason } })
    return toBooking(booking)
  } catch (error) {
    return rethrow(error)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Venue owner (EUC-15)

// status: requested | confirmed | closed | all -> { data, total, page, pageCount, counts }
export async function listOwnerBookings({ status = 'requested', venueId = '', page = 1 } = {}) {
  const params = new URLSearchParams({ status, page: String(page), pageSize: '10' })
  if (venueId) params.set('venueId', venueId)
  const result = await apiFetch(`/owner/bookings?${params}`)
  return { ...result, data: result.data.map(toBooking) }
}

export async function confirmBooking(bookingId) {
  try {
    const { booking } = await apiFetch(`/owner/bookings/${encodeURIComponent(bookingId)}/confirm`, { method: 'POST', body: {} })
    return toBooking(booking)
  } catch (error) {
    return rethrow(error)
  }
}

export async function rejectBooking(bookingId, reason) {
  try {
    const { booking } = await apiFetch(`/owner/bookings/${encodeURIComponent(bookingId)}/reject`, { method: 'POST', body: { reason } })
    return toBooking(booking)
  } catch (error) {
    return rethrow(error)
  }
}
