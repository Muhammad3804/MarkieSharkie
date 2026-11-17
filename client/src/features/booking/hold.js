import { getHold, holdSlot, releaseHold } from '../../api/bookings.js'
import { clearHoldRef, loadHoldRef, saveHoldRef } from './draft.js'

// Place (or keep) this tab's hold on one hall slot. Reuses a running hold on the same slot without extending it,
// and releases a hold this tab has on a different slot first. Throws BookingError SLOT_UNAVAILABLE when taken.
export async function startHold(venueId, { hallId, date, slot }) {
  const existing = loadHoldRef(venueId)
  const live = existing && getHold(existing.slotId, existing.holdToken)
  if (live && existing.hallId === hallId && existing.date === date && existing.slot === slot) return { ...existing, heldUntil: live.heldUntil }
  // Secure the new slot first, so a refusal doesn't also cost the customer the hold they had.
  const hold = await holdSlot({ venueId, hallId, date, slot })
  const ref = { ...hold, hallId, date, slot }
  saveHoldRef(venueId, ref)
  if (live) await releaseHold(existing.slotId, existing.holdToken)
  return ref
}

// This tab's running hold for the venue, or null (expired, released or never placed).
export function currentHold(venueId) {
  const ref = loadHoldRef(venueId)
  if (!ref) return null
  const live = getHold(ref.slotId, ref.holdToken)
  return live ? { ...ref, heldUntil: live.heldUntil } : null
}

export async function dropHold(venueId) {
  const ref = loadHoldRef(venueId)
  clearHoldRef(venueId)
  if (ref) await releaseHold(ref.slotId, ref.holdToken)
}
