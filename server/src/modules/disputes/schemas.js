import { z } from 'zod'
import { moneySchema, paginationQuerySchema } from '../../lib/validators.js'
import { DISPUTE_CATEGORIES, OUTCOMES, REPORT_REASONS } from './service.js'

// REQ-48 / EUC-35 and venue reports (srs-alignment #41). The client's dialogs check the same lengths.

const text = (min, max, field) =>
  z
    .string({ error: `Add ${field}.` })
    .trim()
    .min(min, `Write at least ${min} characters.`)
    .max(max, `Keep it under ${max + 1} characters.`)

export const bookingParamsSchema = z.object({ id: z.uuid({ error: 'Unknown booking.' }) }).strict()
export const disputeParamsSchema = z.object({ id: z.uuid({ error: 'Unknown dispute.' }) }).strict()
export const fileParamsSchema = z
  .object({ id: z.uuid({ error: 'Unknown dispute.' }), fileId: z.uuid({ error: 'Unknown photo.' }) })
  .strict()
export const venueParamsSchema = z.object({ id: z.uuid({ error: 'Unknown venue.' }) }).strict()
export const reportParamsSchema = z.object({ id: z.uuid({ error: 'Unknown report.' }) }).strict()
export const emptyBodySchema = z.object({}).strict().default({})

export const openDisputeSchema = z
  .object({
    category: z.enum(DISPUTE_CATEGORIES, { error: 'Pick what the problem is about.' }),
    description: text(20, 2000, 'what happened'),
    evidenceIds: z.array(z.uuid()).max(5, 'Attach up to 5 photos.').default([]),
  })
  .strict()

export const noteSchema = z.object({ body: text(1, 2000, 'a message') }).strict()
export const adminNoteSchema = z.object({ body: text(1, 2000, 'a note'), internal: z.boolean().default(true) }).strict()

export const myDisputesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'closed', 'all']).default('all'),
})

export const adminDisputesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'under_review', 'resolved', 'rejected', 'all']).default('open'),
  category: z.enum(DISPUTE_CATEGORIES).optional(),
  q: z.string().trim().max(100).optional(),
})

export const resolveSchema = z
  .object({
    outcome: z.enum(OUTCOMES, { error: 'Pick the outcome.' }),
    compensation: moneySchema.optional(),
    resolution: text(10, 2000, 'the resolution'),
  })
  .strict()

export const rejectSchema = z.object({ reason: text(10, 2000, 'a reason') }).strict()

export const reportVenueSchema = z
  .object({
    reason: z.enum(REPORT_REASONS, { error: 'Pick a reason.' }),
    details: text(10, 1000, 'some details'),
  })
  .strict()

export const adminReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'under_review', 'resolved', 'all']).default('open'),
})
export const resolveReportSchema = z.object({ resolution: text(10, 1000, 'what you did') }).strict()
