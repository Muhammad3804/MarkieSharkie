import { z } from 'zod'
import { EVENT_TYPES } from '../host/options.js'
import { guestCountError } from '../../lib/booking.js'
import { todayKey } from '../../lib/format.js'
import { normalizePkMobile } from '../../lib/phone.js'
import { MAX_ADD_ON_QUANTITY } from './options.js'

// Validation per booking step. Errors are keyed by draft field (the field ids in the step components).
// api/bookings.js (and later the server, with Zod at the route boundary) checks the same rules again.

const details = z.object({
  eventType: z.enum(EVENT_TYPES.map((type) => type.value), { error: 'Pick the type of event.' }),
  eventName: z.string().trim().min(3, 'Give your event a name, like “Ali & Sara’s Walima”.').max(80, 'Keep the event name under 81 characters.'),
  hostName: z
    .string()
    .trim()
    .min(2, 'Enter the host’s name.')
    .max(60, 'Keep the name under 61 characters.')
    .regex(/^[\p{L}\s.'-]+$/u, 'Use letters only for the name.'),
  hostPhone: z.string().refine((text) => normalizePkMobile(text) !== null, 'Enter a Pakistani mobile number, like 0300-1234567.'),
  specialRequests: z.string().trim().max(500, 'Keep special requests under 501 characters.'),
})

function zodErrors(result) {
  if (result.success) return {}
  const errors = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.')
    if (!errors[key]) errors[key] = issue.message
  }
  return errors
}

// { valid, errors } for one step of the draft.
export function validateBookingStep(step, draft, venue) {
  const errors = {}
  if (step === 'selection') {
    const hall = venue.halls.find((h) => h.hallId === draft.hallId)
    if (!hall) errors.hallId = 'Pick a hall on the venue page.'
    else {
      const guestError = guestCountError(draft.guests, hall)
      if (guestError) errors.guests = guestError
    }
    if (!draft.date || draft.date < todayKey()) errors.date = 'Pick an event date from today on.'
    if (venue.menuPackages.length && !venue.menuPackages.some((m) => m.menuId === draft.menuId)) errors.menuId = 'Pick a menu.'
  }
  if (step === 'details') Object.assign(errors, zodErrors(details.safeParse(draft)))
  if (step === 'add-ons') {
    for (const [addOnId, quantity] of Object.entries(draft.addOns ?? {})) {
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_ADD_ON_QUANTITY) errors[`addOns.${addOnId}`] = `Choose 0 to ${MAX_ADD_ON_QUANTITY}.`
    }
  }
  if (step === 'review' && !draft.agreed) errors.agreed = 'Tick the box to agree to the cancellation policy and house rules.'
  return { valid: Object.keys(errors).length === 0, errors }
}
