import { z } from 'zod'
import { EVENT_TYPES } from '../../config/constants.js'
import { nameSchema, phoneSchema } from '../../lib/validators.js'
import { MAX_ADD_ON_QUANTITY } from './pricing.js'

// EUC-14 / EUC-24 / EUC-15 / EUC-16 (docs/booking-engine.md). The client's booking steps check the same rules.

export const slotParamsSchema = z.object({ slotId: z.uuid({ error: 'Unknown time slot.' }) }).strict()
export const bookingParamsSchema = z.object({ id: z.uuid({ error: 'Unknown booking.' }) }).strict()

export const createBookingSchema = z
  .object({
    slotId: z.uuid({ error: 'Pick a date and time first.' }),
    eventType: z.enum(EVENT_TYPES, { error: 'Pick the type of event.' }),
    guestCount: z
      .number({ error: 'Enter the number of guests as a whole number.' })
      .int('Enter the number of guests as a whole number.')
      .min(1)
      .max(20000),
    menuPackageId: z.uuid().nullable().default(null),
    addOns: z
      .array(
        z
          .object({
            addOnId: z.uuid(),
            quantity: z.number().int().min(0).max(MAX_ADD_ON_QUANTITY, `Choose 0 to ${MAX_ADD_ON_QUANTITY}.`),
          })
          .strict(),
      )
      .max(20)
      .default([])
      .refine((list) => new Set(list.map((a) => a.addOnId)).size === list.length, 'Each add-on can be listed once.'),
    eventName: z
      .string({ error: 'Give your event a name.' })
      .trim()
      .min(3, 'Give your event a name, like “Ali & Sara’s Walima”.')
      .max(80, 'Keep the event name under 81 characters.'),
    hostName: nameSchema.pipe(z.string().max(60, 'Keep the name under 61 characters.')),
    hostPhone: phoneSchema,
    specialRequests: z.string().trim().max(500, 'Keep special requests under 501 characters.').default(''),
  })
  .strict()

const reason = (label) =>
  z
    .string({ error: `Add ${label}.` })
    .trim()
    .min(5, `Add ${label} (at least 5 characters).`)
    .max(500, `Keep ${label} under 501 characters.`)

export const cancelBodySchema = z.object({ reason: reason('a reason for the venue') }).strict()
export const rejectBodySchema = z.object({ reason: reason('a reason the customer will see') }).strict()
export const emptyBodySchema = z.object({}).strict().default({})

export const myBookingsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()

export const ownerBookingsQuerySchema = z
  .object({
    status: z.enum(['requested', 'confirmed', 'closed', 'all']).default('requested'),
    venueId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
