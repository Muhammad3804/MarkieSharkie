// Mirrors the server's SLOT_HOLD_MINUTES (REQ-18, docs/booking-engine.md). The Figma frame says "48 hours";
// the SRS wins, so every hold message on the client reads this value.
export const SLOT_HOLD_MINUTES = 10

export const MIN_GUESTS = 25
export const DEFAULT_GUESTS = '50'

// Guest count from a text input: a whole number from MIN_GUESTS to the selected hall's capacity.
// Returns an error message or null.
export function guestCountError(value, hall) {
  const text = String(value).trim()
  if (text === '') return 'Enter the number of guests.'
  if (!/^-?\d+$/.test(text)) return 'Use a whole number of guests, like 150.'
  const guests = Number(text)
  if (guests < MIN_GUESTS) return `Bookings start at ${MIN_GUESTS} guests.`
  if (guests > hall.capacity) return `${hall.name} holds up to ${hall.capacity.toLocaleString('en-US')} guests. Pick a larger hall or fewer guests.`
  return null
}

// Slot presets until time_slots come from the API (docs/booking-engine.md "Create slots").
// start/end are time_slots.start_time/end_time (Pakistan time).
export const SLOT_PRESETS = [
  { value: 'lunch', label: 'Lunch', time: '12:00 PM – 4:00 PM', start: '12:00', end: '16:00' },
  { value: 'evening', label: 'Evening', time: '7:00 PM – 11:00 PM', start: '19:00', end: '23:00' },
]

// time_slots.status (plus the calendar's own past / unknown) as the customer reads it.
export const SLOT_STATUS_LABELS = { available: 'Available', held: 'On hold', booked: 'Booked', blocked: 'Unavailable', past: 'Past', unknown: 'Checking…' }

export const slotPreset = (value) => SLOT_PRESETS.find((slot) => slot.value === value) ?? SLOT_PRESETS[1]

// Menus can have a higher minimum than MIN_GUESTS (menu_packages.min_guests, REQ-35). The customer can still book
// fewer guests (MIN_GUESTS is the hard floor); the menu is then charged for its minimum.
export const billableGuests = (guests, menu) => Math.max(guests, menu?.minGuests ?? 0)

// bookings.status (REQ-21) -> what the customer sees. "Expired" is a cancelled request the venue never answered
// before the event (docs/booking-engine.md: cancelled, reason recorded), not its own status.
export const EXPIRED_REASON = 'Expired: the venue did not respond before the event date'
export function bookingStatusView(booking) {
  if (booking.status === 'cancelled' && booking.cancellationReason === EXPIRED_REASON) return BOOKING_STATUS_VIEWS.expired
  return BOOKING_STATUS_VIEWS[booking.status]
}
export const BOOKING_STATUS_VIEWS = {
  requested: { key: 'requested', label: 'Pending owner approval', tone: 'pending' },
  held: { key: 'held', label: 'Accepted · pay advance', tone: 'info' },
  confirmed: { key: 'confirmed', label: 'Confirmed', tone: 'success' },
  completed: { key: 'completed', label: 'Completed', tone: 'neutral' },
  cancelled: { key: 'cancelled', label: 'Cancelled', tone: 'danger' },
  expired: { key: 'expired', label: 'Expired', tone: 'neutral' },
}

// Short reference for receipts and calls, from the booking UUID: "MS-7F3A9C".
export const bookingReference = (bookingId) => `MS-${bookingId.replace(/-/g, '').slice(0, 6).toUpperCase()}`
