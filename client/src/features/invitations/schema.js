import { z } from 'zod'
import { INVITE_EVENT_TYPES, INVITE_TEMPLATES, LIMITS, MAX_PARTY_SIZE } from './options.js'
import { normalizePkMobile } from '../../lib/phone.js'
import { todayKey } from '../../lib/format.js'

// Invitation builder and RSVP validation. Errors are keyed by field (the field ids in the steps).
// api/invitations.js checks the same rules again, like the server will with Zod at the route boundary.

const details = z.object({
  title: z.string().trim().min(3, 'Give the event a name, like “Ali & Sara’s Walima”.').max(LIMITS.title, `Keep the event name under ${LIMITS.title + 1} characters.`),
  eventType: z.enum(INVITE_EVENT_TYPES.map((t) => t.value), { error: 'Pick the type of event.' }),
  hostNames: z.string().trim().min(2, 'Enter the host family names, like “The Khan and Malik families”.').max(LIMITS.hostNames, `Keep the names under ${LIMITS.hostNames + 1} characters.`),
  message: z.string().trim().max(LIMITS.message, `Keep the message under ${LIMITS.message + 1} characters.`),
  contactPhone: z.string().refine((value) => normalizePkMobile(value) !== null, 'Enter a Pakistani mobile number, like 0300-1234567.'),
  rsvpBy: z.string().min(1, 'Pick the last day guests can reply.'),
  dressCode: z.string().trim().max(100, 'Keep the dress code under 101 characters.').optional(),
  notes: z.string().trim().max(1000, 'Keep the notes under 1001 characters.').optional(),
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

// rsvpBy: from today, and strictly before the event day.
export function rsvpByError(rsvpBy, eventDate, today = todayKey()) {
  if (!rsvpBy) return 'Pick the last day guests can reply.'
  if (rsvpBy < today) return 'The reply deadline can’t be in the past.'
  if (rsvpBy >= eventDate) return 'The reply deadline must be before the event day.'
  return null
}

export function validateInviteStep(step, draft, eventDate) {
  const errors = {}
  if (step === 'template' && !INVITE_TEMPLATES.some((t) => t.value === draft.template)) errors.template = 'Pick a design.'
  if (step === 'details') {
    Object.assign(errors, zodErrors(details.safeParse(draft)))
    const deadline = rsvpByError(draft.rsvpBy, eventDate)
    if (deadline) errors.rsvpBy = deadline
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

const rsvp = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name.')
    .max(60, 'Keep your name under 61 characters.')
    .regex(/^[\p{L}\p{M}\s.'-]+$/u, 'Use letters only for your name.'),
  phone: z.string().refine((value) => normalizePkMobile(value) !== null, 'Enter a Pakistani mobile number, like 0300-1234567.'),
  response: z.enum(['yes', 'no'], { error: 'Choose whether you’re coming.' }),
  partySize: z.number().int().min(1, 'At least 1 person.').max(MAX_PARTY_SIZE, `Up to ${MAX_PARTY_SIZE} people per reply.`),
})

// A "no" carries no party size (stored as 0).
export function validateRsvp(input) {
  const errors = zodErrors(rsvp.safeParse(input.response === 'no' ? { ...input, partySize: 1 } : input))
  return { valid: Object.keys(errors).length === 0, errors }
}
