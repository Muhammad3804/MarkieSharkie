import { z } from 'zod'
import { EVENT_TYPES, PAGINATION } from '../config/constants.js'

// Field rules shared by registration, login, profile and the create-admin script, so every entry point applies the
// same REQ-1 rules. Messages are user-facing and say how to fix the value (NFR-3).

export const PHONE_MESSAGE = 'Enter a Pakistani mobile number like 0300-1234567'
export const EMAIL_MESSAGE = 'Enter a valid email address like name@example.com.'
export const IDENTIFIER_MESSAGE = 'Enter your email or a Pakistani mobile number like 0300-1234567.'
export const MONEY_MESSAGE = 'Enter an amount in rupees like 350000 or 350000.50.'

// REQ-1 / CLAUDE.md rule 7: accept 03XX-XXXXXXX, 03XXXXXXXXX, +92 3XX XXXXXXX, +923XXXXXXXXX (spaces / dashes
// anywhere) and store +923XXXXXXXXX, the format `users_phone_pk_format` enforces. Returns null for anything else.
export function normalizePkMobile(input) {
  if (typeof input !== 'string') return null
  const compact = input.trim().replace(/[\s-]/g, '')
  if (/^03\d{9}$/.test(compact)) return `+92${compact.slice(1)}`
  if (/^\+923\d{9}$/.test(compact)) return compact
  return null
}

export const phoneSchema = z
  .string({ error: PHONE_MESSAGE })
  .max(30, PHONE_MESSAGE)
  .transform((value, ctx) => {
    const normalized = normalizePkMobile(value)
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: PHONE_MESSAGE })
      return z.NEVER
    }
    return normalized
  })

// users.email is citext; we still store it trimmed and lowercase so responses are consistent.
export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(254, 'Email must be 254 characters or fewer.')
  .pipe(z.email({ error: EMAIL_MESSAGE }))

// REQ-1: at least 8 characters with letters and digits. Max 128 bounds the hashing cost. Never trimmed.
export const passwordSchema = z
  .string({ error: 'Enter a password.' })
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use 128 characters or fewer.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one digit.')

export const nameSchema = z
  .string({ error: 'Enter your full name.' })
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(100, 'Name must be 100 characters or fewer.')

// users.city is NOT NULL (srs-alignment #4); also used for decorators.city (service city) and preferredCity.
export const citySchema = z
  .string({ error: 'Enter your city.' })
  .trim()
  .min(2, 'Enter your city.')
  .max(100, 'City must be 100 characters or fewer.')

export const businessNameSchema = z
  .string({ error: 'Enter your business name.' })
  .trim()
  .min(2, 'Business name must be at least 2 characters.')
  .max(150, 'Business name must be 150 characters or fewer.')

// REQ-1 decorator "short description" (decorators.bio NOT NULL).
export const bioSchema = z
  .string({ error: 'Add a short description of your services.' })
  .trim()
  .min(1, 'Add a short description of your services.')
  .max(500, 'Keep the description to 500 characters or fewer.')

// Money is a decimal string in JSON (CLAUDE.md "Conventions"), never a JS float. numeric(12,2) allows 10 whole digits.
// Normalised to two decimals: "350000" -> "350000.00".
export const moneySchema = z
  .string({ error: MONEY_MESSAGE })
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, MONEY_MESSAGE)
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.')
    return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`
  })
  .refine((value) => value !== '0.00', 'Enter an amount greater than 0.')

const GUESTS_MESSAGE = 'Enter the number of guests as a whole number.'

// customers.preferences (jsonb). REQ-4 "preferences (used for personalization)".
// preference_embedding is NOT computed here; that is REQ-15 (Phase 3 recommendations).
export const preferencesSchema = z
  .object(
    {
      preferredCity: citySchema.optional(),
      eventTypes: z
        .array(z.enum(EVENT_TYPES, { error: `Choose event types from: ${EVENT_TYPES.join(', ')}.` }), {
          error: 'Event types must be a list.',
        })
        .max(EVENT_TYPES.length, 'Too many event types.')
        .transform((list) => [...new Set(list)])
        .optional(),
      guestCount: z
        .number({ error: GUESTS_MESSAGE })
        .int(GUESTS_MESSAGE)
        .min(1, 'Guests must be at least 1.')
        .max(10000, 'Guests must be 10,000 or fewer.')
        .optional(),
      budgetMax: moneySchema.optional(),
    },
    { error: 'Preferences must be an object.' },
  )
  .strict()

// REQ-2: log in with email OR mobile. EUC-02 step 3 says email; REQ-2 is the more specific text (srs-alignment #25).
export const identifierSchema = z
  .string({ error: 'Enter your email or mobile number.' })
  .trim()
  .min(1, 'Enter your email or mobile number.')
  .max(254, IDENTIFIER_MESSAGE)
  .transform((value, ctx) => {
    if (value.includes('@')) {
      const email = value.toLowerCase()
      if (!z.email().safeParse(email).success) {
        ctx.addIssue({ code: 'custom', message: EMAIL_MESSAGE })
        return z.NEVER
      }
      return { type: 'email', value: email }
    }
    const phone = normalizePkMobile(value)
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: IDENTIFIER_MESSAGE })
      return z.NEVER
    }
    return { type: 'phone', value: phone }
  })

const wholeNumber = (label, max) =>
  z.coerce
    .number({ error: `${label} must be a whole number.` })
    .int(`${label} must be a whole number.`)
    .min(1, `${label} must be at least 1.`)
    .max(max, `${label} must be ${max} or less.`)

// docs/api-and-security.md "Pagination: ?page=1&pageSize=20 -> { data, page, pageSize, total }".
export const paginationQuerySchema = z
  .object({
    page: wholeNumber('page', 100_000).default(1),
    pageSize: wholeNumber('pageSize', PAGINATION.maxPageSize).default(PAGINATION.defaultPageSize),
  })
  .strict()
