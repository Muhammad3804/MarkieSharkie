import { z } from 'zod'
import { phoneSchema } from '../../lib/validators.js'

const STATUSES = ['pending', 'changes_requested', 'approved', 'rejected', 'suspended']
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-22.')

export const listVenuesQuerySchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    q: z.string().trim().max(100).optional(),
    city: z.string().trim().max(60).optional(),
    type: z.enum(['indoor', 'outdoor', 'semi_outdoor']).optional(),
    submittedFrom: day.optional(),
    submittedTo: day.optional(),
    sort: z.enum(['oldest', 'newest', 'decided', 'name', 'capacity', 'rating']).default('oldest'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()

export const venueParamsSchema = z.object({ id: z.uuid({ error: 'Unknown venue.' }) }).strict()
export const imageParamsSchema = z.object({ id: z.uuid({ error: 'Unknown photo.' }) }).strict()

const reason = (label) =>
  z
    .string({ error: `Add ${label}.` })
    .trim()
    .min(5, `Add ${label} (at least 5 characters).`)
    .max(500, `Keep ${label} under 501 characters.`)

export const approveBodySchema = z
  .object({ checklist: z.record(z.string().max(40), z.boolean()).optional() })
  .strict()
  .default({})
export const rejectBodySchema = z.object({ reason: reason('a reason the owner will see') }).strict()
export const changesBodySchema = z.object({ note: reason('a note for the owner') }).strict()
export const suspendBodySchema = z.object({ reason: reason('a reason') }).strict()
export const emptyBodySchema = z.object({}).strict().default({})
export const bulkApproveBodySchema = z
  .object({ ids: z.array(z.uuid()).min(1, 'Choose at least one listing.').max(50, 'Approve up to 50 at a time.') })
  .strict()

export const imagesQuerySchema = z
  .object({ status: z.enum(['review', 'accepted', 'removed']).default('review') })
  .strict()
// #42: keep (approved) or remove (rejected) one photo, with a required reason (audited).
export const imageDecisionBodySchema = z
  .object({
    decision: z.enum(['approved', 'rejected'], { error: 'Choose keep or remove.' }),
    reason: z
      .string({ error: 'Add a reason.' })
      .trim()
      .min(5, 'Add a reason (at least 5 characters).')
      .max(500, 'Keep the reason under 501 characters.'),
  })
  .strict()
export const venueEmailParamsSchema = z
  .object({ id: z.uuid({ error: 'Unknown venue.' }), emailId: z.uuid({ error: 'Unknown email.' }) })
  .strict()

export const auditQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    action: z.enum(['venue', 'image', 'review', 'user', 'dispute', 'report']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()

// Edits to live venues waiting for approval (REQ-5, srs-alignment #35).
export const revisionParamsSchema = z.object({ id: z.uuid({ error: 'Unknown change request.' }) }).strict()
export const revisionsQuerySchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()

// Admin user management (REQ-47, EUC-33, srs-alignment #40).
export const userParamsSchema = z.object({ id: z.uuid({ error: 'Unknown user.' }) }).strict()
export const usersQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    role: z.enum(['customer', 'venue_owner', 'decorator', 'admin']).optional(),
    status: z.enum(['active', 'suspended', 'deleted', 'all']).default('all'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
export const userReasonSchema = z.object({ reason: reason('a reason') }).strict()
export const roleChangeSchema = z
  .object({
    role: z.enum(['customer', 'venue_owner', 'decorator'], { error: 'Choose customer, venue owner or decorator.' }),
    reason: reason('a reason'),
    businessName: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(150).optional(),
    contactNumber: phoneSchema.optional(),
    bio: z.string().trim().min(1).max(500, 'Keep the description to 500 characters or fewer.').optional(),
    city: z.string().trim().min(2).max(100).optional(),
  })
  .strict()
