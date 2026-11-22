import { holdSlot, releaseHold } from '../../api/bookings.js'
import { clearHoldRef, loadHoldRef, saveHoldRef } from './draft.js'

// The customer's hold on one hall slot (REQ-18). The hold itself is on the server (time_slots.held_by /
// held_until); this tab only remembers which slot it is and until when, so the flow can show the countdown. The
// server checks the hold again when the booking is sent (409 HOLD_EXPIRED). Placing a hold releases any other
// hold this customer has at the venue, on the server.
export async function startHold(venueId, { hallId, date, slot }) {
  const existing = currentHold(venueId)
  if (existing && existing.hallId === hallId && existing.date === date && existing.slot === slot) return existing
  const hold = await holdSlot({ venueId, hallId, date, slot })
  const ref = { ...hold, hallId, date, slot }
  saveHoldRef(venueId, ref)
  return ref
}

// This tab's running hold for the venue, or null once its time is up.
export function currentHold(venueId) {
  const ref = loadHoldRef(venueId)
  if (!ref?.heldUntil || Date.parse(ref.heldUntil) <= Date.now()) return null
  return ref
}

export async function dropHold(venueId) {
  const ref = loadHoldRef(venueId)
  clearHoldRef(venueId)
  if (ref?.slotId) await releaseHold(ref.slotId)
}
