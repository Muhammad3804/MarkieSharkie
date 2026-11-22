import { z } from 'zod'

// REQ-44 / EUC-34 (srs-alignment #36).
export const REPORT_REASONS = ['spam', 'offensive', 'fake', 'off_topic', 'personal_info', 'other']

export const reportParamsSchema = z
  .object({ id: z.uuid({ error: 'Unknown venue.' }), reviewId: z.uuid({ error: 'Unknown review.' }) })
  .strict()

export const reportBodySchema = z
  .object({
    reason: z.enum(REPORT_REASONS, { error: 'Choose why you’re reporting this review.' }),
    note: z.string().trim().max(500, 'Keep the details to 500 characters.').optional(),
  })
  .strict()
  .refine((b) => b.reason !== 'other' || (b.note ?? '').length >= 5, {
    path: ['note'],
    message: 'Tell us what’s wrong (at least 5 characters).',
  })

export const reviewParamsSchema = z.object({ id: z.uuid({ error: 'Unknown review.' }) }).strict()

export const listReviewsQuerySchema = z
  .object({
    status: z.enum(['reported', 'hidden', 'all']).default('reported'),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()

// Every moderation decision needs a reason (written to admin_audit_log; shown in the review history).
export const decisionBodySchema = z
  .object({
    reason: z
      .string({ error: 'Add a reason.' })
      .trim()
      .min(5, 'Add a reason (at least 5 characters).')
      .max(500, 'Keep the reason under 501 characters.'),
  })
  .strict()
