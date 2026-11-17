import { createMockStore, latency } from './mockStore.js'
import { getVenueById } from './venues.js'
import { priceBreakdown } from '../features/booking/pricing.js'
import { MAX_ADD_ON_QUANTITY } from '../features/booking/options.js'
import { EVENT_TYPES } from '../features/host/options.js'
import { EXPIRED_REASON, MIN_GUESTS, SLOT_HOLD_MINUTES, SLOT_PRESETS, slotPreset } from '../lib/booking.js'
import { addDays, daysBetween } from '../lib/days.js'
import { todayKey } from '../lib/format.js'
import { paisaToAmount } from '../lib/money.js'
import { normalizePkMobile } from '../lib/phone.js'

// Mock booking API (localStorage `markiesharkie:bookings`) until the booking engine exists. Rows are shaped like
// `time_slots` and `bookings` (+ `booking_add_ons`) in camelCase, so only this file changes when the server
// arrives; each export names the endpoint that replaces it (docs/booking-engine.md, docs/api-and-security.md).
//
// Mock-only parts, all marked below:
// - Slots are per hall (decided 2026-11-17; the schema still has slots per venue, see progress.md TODO). Slot ids
//   are readable keys, not UUIDs, and rows that were never touched are derived from venue.bookedDates (seed).
// - `holdToken` stands in for "this customer's session": each tab gets its own, so two tabs behave like two
//   customers. The server uses `held_by` (the signed-in customer) instead.
// - navigator.locks serialises writes across tabs, the browser's stand-in for SELECT ... FOR UPDATE.
// TODO(auth): every call acts as DEMO_CUSTOMER until JWT auth exists.

export const DEMO_CUSTOMER = { userId: 'demo-customer', name: 'Demo customer' }
const HOLD_MS = SLOT_HOLD_MINUTES * 60 * 1000

const store = createMockStore('markiesharkie:bookings', {
  seed: () => ({ version: 1, slots: {}, bookings: [] }),
  isValid: (value) => value?.version === 1 && value.slots && typeof value.slots === 'object' && Array.isArray(value.bookings),
})

export class BookingError extends Error {
  // code: SLOT_UNAVAILABLE | HOLD_EXPIRED | PAST_DATE | VALIDATION | NOT_FOUND | INVALID_TRANSITION
  constructor(code, message, details) {
    super(message)
    this.name = 'BookingError'
    this.code = code
    this.details = details
  }
}

const withLock = (task) => (typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request('markiesharkie:bookings', task) : task())
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`)

// ---------------------------------------------------------------------------------------------------------------
// Slots

const slotIdOf = (hallId, date, slot) => `${hallId}~${date}~${slot}`

// Small stable hash, so the seeded bookings look random but never change between loads.
function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

// Seed: on each of the venue's booked dates, either the whole day is taken or a random part of it (at least one
// hall slot), so the calendar shows both "Fully booked" and "Few slots left".
function seededStatus(venue, hallId, date, slot) {
  if (!venue.bookedDates?.includes(date)) return 'available'
  if (hash(`${venue.id}:${date}`) < 0.4) return 'booked'
  const keys = venue.halls.flatMap((hall) => SLOT_PRESETS.map((s) => slotIdOf(hall.hallId, date, s.value)))
  const first = keys[Math.floor(hash(`${venue.id}:${date}:first`) * keys.length)]
  const key = slotIdOf(hallId, date, slot)
  return key === first || hash(key) < 0.35 ? 'booked' : 'available'
}

// The time_slots row for one hall slot, with an expired hold read as available (the lazy check in
// docs/booking-engine.md; correctness never waits for the release job).
function readSlot(state, venue, hallId, date, slot, now = Date.now()) {
  const slotId = slotIdOf(hallId, date, slot)
  const preset = slotPreset(slot)
  const row = state.slots[slotId] ?? {
    slotId,
    venueId: venue.id,
    hallId,
    date,
    slot,
    startTime: preset.start,
    endTime: preset.end,
    status: seededStatus(venue, hallId, date, slot),
    heldBy: null,
    heldUntil: null,
    holdToken: null,
  }
  if (row.status === 'held' && Date.parse(row.heldUntil) <= now) return { ...row, status: 'available', heldBy: null, heldUntil: null, holdToken: null }
  return row
}

// What the API returns: never another session's hold token.
const publicSlot = ({ holdToken: _token, ...row }) => row

async function loadVenue(venueId) {
  const venue = await getVenueById(venueId)
  if (!venue) throw new BookingError('NOT_FOUND', 'This venue isn’t available for booking.')
  return venue
}

function findHall(venue, hallId) {
  const hall = venue.halls.find((h) => h.hallId === hallId)
  if (!hall) throw new BookingError('VALIDATION', 'Pick one of this venue’s halls.')
  return hall
}

// Nearest free dates for the same hall and slot (either side, never in the past), and the other halls free at the
// same date and slot. EUC-14 2.1: offer alternatives when the slot is taken.
function alternativesFor(state, venue, hallId, date, slot) {
  const today = todayKey()
  const dates = []
  for (let distance = 1; distance <= 60 && dates.length < 3; distance++) {
    for (const candidate of [addDays(date, -distance), addDays(date, distance)]) {
      if (candidate < today || dates.length >= 3) continue
      if (readSlot(state, venue, hallId, candidate, slot).status === 'available') dates.push(candidate)
    }
  }
  const halls = venue.halls
    .filter((hall) => hall.hallId !== hallId && readSlot(state, venue, hall.hallId, date, slot).status === 'available')
    .map((hall) => ({ hallId: hall.hallId, name: hall.name, capacity: hall.capacity }))
  return { dates: dates.sort(), halls }
}

// GET /api/venues/:id/slots?from&to -> every hall slot from `from` to `to` (day keys, inclusive).
export async function getVenueSlots(venueId, { from, to }) {
  await latency(120)
  const venue = await loadVenue(venueId)
  const state = store.get()
  const now = Date.now()
  const rows = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const hall of venue.halls) for (const slot of SLOT_PRESETS) rows.push(publicSlot(readSlot(state, venue, hall.hallId, date, slot.value, now)))
  }
  return rows
}

// GET /api/venues/:id/slots/check?hallId&date&slot -> { status, available, alternatives }
export async function checkSlot({ venueId, hallId, date, slot }) {
  await latency(250)
  const venue = await loadVenue(venueId)
  findHall(venue, hallId)
  if (date < todayKey()) throw new BookingError('PAST_DATE', 'That date has passed. Pick a date from today on.')
  const state = store.get()
  const { status } = readSlot(state, venue, hallId, date, slot)
  return { status, available: status === 'available', alternatives: status === 'available' ? null : alternativesFor(state, venue, hallId, date, slot) }
}

// POST /api/venues/:venueId/slots/:slotId/hold -> { slotId, holdToken, heldUntil }.
// Refuses a slot that is held (by anyone, this tab included unless it passes its own token) or booked.
export async function holdSlot({ venueId, hallId, date, slot, holdToken = null }) {
  await latency(200)
  const venue = await loadVenue(venueId)
  findHall(venue, hallId)
  if (date < todayKey()) throw new BookingError('PAST_DATE', 'That date has passed. Pick a date from today on.')
  return withLock(() => {
    const state = store.get()
    const row = readSlot(state, venue, hallId, date, slot)
    const ownHold = row.status === 'held' && holdToken && row.holdToken === holdToken
    if (row.status !== 'available' && !ownHold) {
      throw new BookingError('SLOT_UNAVAILABLE', row.status === 'held' ? 'Someone else is booking this slot right now.' : 'This slot is already booked.', alternativesFor(state, venue, hallId, date, slot))
    }
    const held = { ...row, status: 'held', heldBy: DEMO_CUSTOMER.userId, heldUntil: new Date(Date.now() + HOLD_MS).toISOString(), holdToken: ownHold ? holdToken : uuid() }
    store.update((current) => ({ ...current, slots: { ...current.slots, [held.slotId]: held } }))
    return { slotId: held.slotId, holdToken: held.holdToken, heldUntil: held.heldUntil }
  })
}

// Is this hold still ours and running? (The flow checks on load and refresh.) Sync: reads local state only.
export function getHold(slotId, holdToken) {
  const row = store.get().slots[slotId]
  if (!row || row.status !== 'held' || row.holdToken !== holdToken || Date.parse(row.heldUntil) <= Date.now()) return null
  return { slotId, heldUntil: row.heldUntil }
}

// DELETE /api/slots/:slotId/hold. No-op when the hold is gone or belongs to someone else.
export async function releaseHold(slotId, holdToken) {
  return withLock(() => {
    const row = store.get().slots[slotId]
    if (!row || row.status !== 'held' || row.holdToken !== holdToken) return
    store.update((current) => ({ ...current, slots: { ...current.slots, [slotId]: { ...row, status: 'available', heldBy: null, heldUntil: null, holdToken: null } } }))
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Bookings

// The nightly jobs, run lazily on read: requests the venue never answered become "expired" (cancelled with a
// reason) once the event date passes; confirmed bookings become completed.
function settle(booking, today = todayKey()) {
  if (booking.date >= today) return booking
  if (booking.status === 'requested' || booking.status === 'held') return { ...booking, status: 'cancelled', cancellationReason: EXPIRED_REASON }
  if (booking.status === 'confirmed') return { ...booking, status: 'completed' }
  return booking
}

// POST /api/bookings -> the new booking (status 'requested'). The hold must still be ours.
export async function requestBooking(input) {
  await latency(350)
  const venue = await loadVenue(input.venueId)
  const hall = findHall(venue, input.hallId)
  const menu = venue.menuPackages.find((m) => m.menuId === input.menuId) ?? null
  const guests = Number(input.guests)
  if (!Number.isInteger(guests) || guests < MIN_GUESTS || guests > hall.capacity) throw new BookingError('VALIDATION', `Guest count must be ${MIN_GUESTS} to ${hall.capacity} for ${hall.name}.`)
  if (venue.menuPackages.length && !menu) throw new BookingError('VALIDATION', 'Pick one of this venue’s menus.')
  if (!EVENT_TYPES.some((type) => type.value === input.eventType)) throw new BookingError('VALIDATION', 'Pick an event type.')
  const hostPhone = normalizePkMobile(input.hostPhone)
  if (!hostPhone) throw new BookingError('VALIDATION', 'Enter a Pakistani mobile number.')
  const addOns = {}
  for (const [addOnId, quantity] of Object.entries(input.addOns ?? {})) {
    if (!quantity) continue
    const addOn = venue.addOns?.find((a) => a.addOnId === addOnId)
    // REQ-34: the add-on must be offered and available.
    if (!addOn?.isAvailable) throw new BookingError('VALIDATION', 'One of the add-ons is no longer available. Go back and remove it.')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ADD_ON_QUANTITY) throw new BookingError('VALIDATION', `Add-on quantity must be 1 to ${MAX_ADD_ON_QUANTITY}.`)
    addOns[addOnId] = quantity
  }
  const price = priceBreakdown(venue, { hallId: hall.hallId, guests, menuId: menu?.menuId, addOns })

  return withLock(() => {
    const state = store.get()
    const slotId = slotIdOf(hall.hallId, input.date, input.slot)
    if (slotId !== input.slotId) throw new BookingError('VALIDATION', 'The booking doesn’t match the held slot.')
    const row = readSlot(state, venue, hall.hallId, input.date, input.slot)
    // EUC-14 4.1: the hold must still be ours and running.
    if (row.status !== 'held' || row.holdToken !== input.holdToken) throw new BookingError('HOLD_EXPIRED', 'Your hold on this slot has expired.')
    // Last line of defence, like the bookings_one_active_per_slot index.
    if (state.bookings.some((b) => b.slotId === slotId && settle(b).status !== 'cancelled')) throw new BookingError('SLOT_UNAVAILABLE', 'This slot is already booked.')

    const now = new Date().toISOString()
    const preset = slotPreset(input.slot)
    const booking = {
      bookingId: uuid(),
      slotId,
      customerId: DEMO_CUSTOMER.userId,
      venueId: venue.id,
      hallId: hall.hallId,
      menuPackageId: menu?.menuId ?? null,
      eventType: input.eventType,
      guestCount: guests,
      status: 'requested',
      source: 'online',
      clientName: null,
      clientPhone: null,
      totalAmount: paisaToAmount(price.totalPaisa),
      advanceAmount: '0.00', // advance paid so far; owners record payments (REQ-25)
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
      addOns: Object.entries(addOns).map(([addOnId, quantity]) => ({ addOnId, quantity, unitPrice: venue.addOns.find((a) => a.addOnId === addOnId).price })), // booking_add_ons
      // UI-only (no columns yet): what the customer typed on "Event details"
      eventName: input.eventName.trim(),
      hostName: input.hostName.trim(),
      hostPhone,
      specialRequests: input.specialRequests.trim(),
      advanceDue: paisaToAmount(price.advancePaisa),
      // Joined from time_slots / venues / halls / menu_packages by the server
      date: input.date,
      slot: input.slot,
      startTime: preset.start,
      endTime: preset.end,
      venueName: venue.name,
      venueCity: venue.city,
      hallName: hall.name,
      menuName: menu?.name ?? null,
      bookingTerms: venue.bookingTerms,
    }
    store.update((current) => ({
      ...current,
      slots: { ...current.slots, [slotId]: { ...row, status: 'booked', heldBy: null, heldUntil: null, holdToken: null } },
      bookings: [...current.bookings, booking],
    }))
    // TODO(server): notify the owner (REQ-19) and emit slot:updated after commit.
    return booking
  })
}

// GET /api/bookings (customer's own).
export async function listMyBookings() {
  await latency()
  const today = todayKey()
  return store
    .get()
    .bookings.filter((b) => b.customerId === DEMO_CUSTOMER.userId)
    .map((b) => settle(b, today))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

// GET /api/bookings/:id -> booking, or null when it isn't this customer's.
export async function getBooking(bookingId) {
  await latency(150)
  const booking = store.get().bookings.find((b) => b.bookingId === bookingId && b.customerId === DEMO_CUSTOMER.userId)
  return booking ? settle(booking) : null
}

// Shared by cancel and the owner actions: lock, settle, check the transition, write booking + slot together.
function transition(bookingId, allowed, change) {
  return withLock(() => {
    const state = store.get()
    const current = state.bookings.find((b) => b.bookingId === bookingId)
    if (!current) throw new BookingError('NOT_FOUND', 'Booking not found.')
    const booking = settle(current)
    if (!allowed.includes(booking.status)) throw new BookingError('INVALID_TRANSITION', `A ${booking.status} booking can’t be changed this way.`)
    const next = { ...booking, ...change, updatedAt: new Date().toISOString() }
    const releaseSlot = next.status === 'cancelled'
    store.update((s) => ({
      ...s,
      bookings: s.bookings.map((b) => (b.bookingId === bookingId ? next : b)),
      slots: releaseSlot && s.slots[next.slotId] ? { ...s.slots, [next.slotId]: { ...s.slots[next.slotId], status: 'available', heldBy: null, heldUntil: null, holdToken: null } } : s.slots,
    }))
    return next
  })
}

// POST /api/bookings/:id/cancel { reason } (REQ-22): requested, held or confirmed, before the event date.
export async function cancelBooking(bookingId, reason) {
  await latency(300)
  const text = String(reason ?? '').trim()
  if (text.length < 5) throw new BookingError('VALIDATION', 'Tell the venue why you’re cancelling (at least 5 characters).')
  const booking = store.get().bookings.find((b) => b.bookingId === bookingId && b.customerId === DEMO_CUSTOMER.userId)
  if (!booking) throw new BookingError('NOT_FOUND', 'Booking not found.')
  if (daysBetween(todayKey(), booking.date) <= 0) throw new BookingError('INVALID_TRANSITION', 'Bookings can only be cancelled before the event date.')
  return transition(bookingId, ['requested', 'held', 'confirmed'], { status: 'cancelled', cancellationReason: text })
}

// DEV ONLY until the owner dashboard exists (REQ-21, EUC-15): the venue owner's accept / reject / record advance.
// Replace with PATCH /api/owner/bookings/:id and POST /api/bookings/:id/payments on the owner side.
export async function devOwnerAction(bookingId, action) {
  await latency(200)
  if (action === 'accept') return transition(bookingId, ['requested'], { status: 'held' })
  if (action === 'reject') return transition(bookingId, ['requested', 'held'], { status: 'cancelled', cancellationReason: 'Rejected by venue' })
  if (action === 'advance') {
    const booking = store.get().bookings.find((b) => b.bookingId === bookingId)
    return transition(bookingId, ['held'], { status: 'confirmed', advanceAmount: booking?.advanceDue ?? '0.00' })
  }
  throw new BookingError('VALIDATION', `Unknown action ${action}`)
}

// Admin Settings "Reset demo data" and tests.
export function resetBookings() {
  store.reset()
}
