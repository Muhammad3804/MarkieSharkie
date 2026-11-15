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
export const SLOT_PRESETS = [
  { value: 'lunch', label: 'Lunch', time: '12:00 PM – 4:00 PM' },
  { value: 'evening', label: 'Evening', time: '7:00 PM – 11:00 PM' },
]
