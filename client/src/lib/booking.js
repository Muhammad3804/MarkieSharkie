// Mirrors the server's SLOT_HOLD_MINUTES (REQ-18, docs/booking-engine.md). The Figma frame says "48 hours";
// the SRS wins, so every hold message on the client reads this value.
export const SLOT_HOLD_MINUTES = 10

// Guest count choices for a venue in steps of 50, always including min and capacity.
export function guestOptions(minGuests, capacity) {
  const options = []
  for (let n = minGuests; n < capacity; n += 50) options.push(n)
  options.push(capacity)
  return options
}

// Default guest count: the largest option up to 250 (the design's example), or the smallest option.
export function defaultGuests(minGuests, capacity) {
  const options = guestOptions(minGuests, capacity)
  return String(options.filter((n) => n <= 250).at(-1) ?? options[0])
}

// Slot presets until time_slots come from the API (docs/booking-engine.md "Create slots").
export const SLOT_PRESETS = [
  { value: 'lunch', label: 'Lunch', time: '12:00 PM – 4:00 PM' },
  { value: 'evening', label: 'Evening', time: '7:00 PM – 11:00 PM' },
]
