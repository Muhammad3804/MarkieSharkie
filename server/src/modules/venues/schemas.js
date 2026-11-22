import { z } from 'zod'
import { EVENT_TYPES } from '../../config/constants.js'

// GET /api/venues: the Explore page's filters (client/src/features/explore/filters.js toSearchParams).
export const SORTS = ['recommended', 'price-asc', 'price-desc', 'rating', 'capacity']
export const CAPACITY_BUCKETS = Object.freeze({
  any: { min: 0, max: null },
  'up-to-500': { min: 0, max: 500 },
  '500-750': { min: 500, max: 750 },
  '750-plus': { min: 750, max: null },
})
export const RATINGS = ['4.6', '4.8', '4.9']
const SETTINGS = ['indoor', 'outdoor', 'semi_outdoor']
export const PUBLIC_PAGE_SIZE = 12

const whole = (label, max) =>
  z.coerce
    .number({ error: `${label} must be a whole number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} can't be negative.`)
    .max(max, `${label} is too large.`)
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-20.')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Use a real date.')
const csvOf = (allowed, label) =>
  z
    .string()
    .max(500)
    .transform((text) => [
      ...new Set(
        text
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ])
    .refine((list) => list.every((v) => allowed.includes(v)), `Unknown ${label}.`)

export const searchQuerySchema = z
  .object({
    city: z.string().trim().max(80).optional(),
    location: z.string().trim().max(80).optional(), // the landing search bar's old name for city
    date: day.optional(),
    guests: whole('Guests', 100_000).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    priceMin: whole('Minimum price', 10_000_000).optional(),
    priceMax: whole('Maximum price', 10_000_000).optional(),
    capacity: z.enum(Object.keys(CAPACITY_BUCKETS)).default('any'),
    rating: z.enum(RATINGS).optional(),
    setting: csvOf(SETTINGS, 'setting').default([]),
    amenities: z
      .string()
      .max(500)
      .transform((text) => [
        ...new Set(
          text
            .split(',')
            .map((v) => v.trim())
            .filter((v) => /^[a-z_]{1,40}$/.test(v)),
        ),
      ])
      .default([]),
    catering: z.enum(['1']).optional(),
    section: z
      .string()
      .regex(/^[a-z-]{1,40}$/)
      .optional(),
    sort: z.enum(SORTS).default('recommended'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict()

export const venueIdParamsSchema = z.object({ id: z.string() }).strict()

export const availabilityQuerySchema = z
  .object({ from: day.optional(), to: day.optional() })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['to'],
    message: 'The end date must be after the start date.',
  })

// GET /venues/:id/reviews (REQ-42, REQ-43): platform reviews only, newest first.
export const reviewsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
