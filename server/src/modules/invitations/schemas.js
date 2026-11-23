import { z } from 'zod'
import { EVENT_TYPES } from '../../config/constants.js'
import { phoneSchema } from '../../lib/validators.js'

// EUC-25, 26, 27 (srs-alignment #39). The client's invitation steps check the same rules.

const text = (max, label) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max + 1} characters.`)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-20.')

export const bookingParamsSchema = z.object({ id: z.uuid({ error: 'Unknown booking.' }) }).strict()
export const invitationParamsSchema = z.object({ id: z.uuid({ error: 'Unknown invitation.' }) }).strict()
export const guestParamsSchema = z
  .object({ id: z.uuid({ error: 'Unknown invitation.' }), guestId: z.uuid({ error: 'Unknown guest.' }) })
  .strict()
export const tokenParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }).strict()

export const invitationBodySchema = z
  .object({
    template: z.enum(['classic', 'floral', 'modern', 'mehndi'], { error: 'Pick a design.' }),
    title: z
      .string({ error: 'Give the event a name.' })
      .trim()
      .min(3, 'Give the event a name, like “Ali & Sara’s Walima”.')
      .max(80, 'Keep the event name under 81 characters.'),
    eventType: z.enum(EVENT_TYPES, { error: 'Pick the type of event.' }),
    hostNames: z
      .string()
      .trim()
      .min(2, 'Enter the host family names.')
      .max(120, 'Keep the names under 121 characters.'),
    message: text(300, 'the message').default(''),
    dressCode: text(100, 'the dress code').default(''),
    notes: text(1000, 'the notes').default(''),
    contactPhone: z
      .union([phoneSchema, z.literal('').transform(() => null)])
      .nullable()
      .default(null),
    rsvpBy: z
      .union([day, z.literal('').transform(() => null)])
      .nullable()
      .default(null),
  })
  .strict()

const guestSchema = z
  .object({
    name: z
      .string({ error: 'Enter the guest’s name.' })
      .trim()
      .min(2, 'Enter the guest’s name.')
      .max(60, 'Keep the name under 61 characters.'),
    email: z
      .union([z.email('Enter an email like name@example.com.').trim().toLowerCase().max(254), z.literal('')])
      .transform((v) => v || null)
      .nullable()
      .default(null),
    phone: z
      .union([phoneSchema, z.literal('')])
      .transform((v) => v || null)
      .nullable()
      .default(null),
  })
  .strict()
  .refine((g) => g.email || g.phone, { path: ['email'], message: 'Add an email or a mobile number.' })

export const addGuestsSchema = z
  .object({
    guests: z
      .array(guestSchema)
      .min(1, 'Add at least one guest.')
      .max(200, 'Add up to 200 guests at a time.')
      .superRefine((list, ctx) => {
        const seen = new Set()
        list.forEach((g, i) => {
          for (const key of [g.email && `e:${g.email}`, g.phone && `p:${g.phone}`].filter(Boolean)) {
            if (seen.has(key))
              ctx.addIssue({ code: 'custom', path: [i, 'name'], message: 'This guest is listed twice.' })
            seen.add(key)
          }
        })
      }),
  })
  .strict()

export const sendBodySchema = z
  .object({ guestIds: z.array(z.uuid()).max(500).optional() })
  .strict()
  .default({})

export const guestsQuerySchema = z
  .object({
    status: z.enum(['all', 'attending', 'declined', 'awaiting', 'not_delivered']).default('all'),
    q: z.string().trim().max(100).optional(),
  })
  .strict()

export const rsvpBodySchema = z
  .object({
    response: z.enum(['yes', 'no'], { error: 'Choose whether you’re coming.' }),
    partySize: z.number().int().min(1, 'At least 1 person.').max(20, 'Up to 20 people per reply.').default(1),
    note: z.string().trim().max(300, 'Keep the note under 301 characters.').default(''),
  })
  .strict()

export const emptyBodySchema = z.object({}).strict().default({})
