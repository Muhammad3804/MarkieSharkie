import { z } from 'zod'
import {
  bioSchema,
  businessNameSchema,
  citySchema,
  emailSchema,
  identifierSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  preferencesSchema,
} from '../../lib/validators.js'

export const ROLE_MESSAGE = 'Choose an account type: customer, venue_owner or decorator.'

// REQ-1 fields every account has.
const accountFields = {
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  city: citySchema,
}

// EUC-01 step 2-3: the form has a role choice; each role adds its own fields (REQ-1). 'admin' (or anything else) is
// not a public role and fails with ROLE_MESSAGE.
const customerRegistration = z
  .object({ role: z.literal('customer'), ...accountFields, preferences: preferencesSchema.optional() })
  .strict()

const venueOwnerRegistration = z
  .object({
    role: z.literal('venue_owner'),
    ...accountFields,
    businessName: businessNameSchema,
    contactNumber: phoneSchema,
  })
  .strict()

const decoratorRegistration = z
  .object({
    role: z.literal('decorator'),
    ...accountFields,
    businessName: businessNameSchema,
    bio: bioSchema,
    serviceCity: citySchema.optional(), // decorators.city; defaults to city
  })
  .strict()

export const registerBodySchema = z.discriminatedUnion(
  'role',
  [customerRegistration, venueOwnerRegistration, decoratorRegistration],
  { error: (issue) => (issue.code === 'invalid_union' ? ROLE_MESSAGE : undefined) },
)

// The create-admin CLI uses the same account rules (REQ-1), without a role field.
export const adminAccountSchema = z.object(accountFields).strict()

export const loginBodySchema = z
  .object({
    identifier: identifierSchema,
    password: z
      .string({ error: 'Enter your password.' })
      .min(1, 'Enter your password.')
      .max(128, 'Use 128 characters or fewer.'),
  })
  .strict()

// refresh / logout take the cookie only.
export const emptyBodySchema = z.object({}).strict()

// REQ-2 password reset by a 6-digit emailed code.
const resetCodeSchema = z
  .string({ error: 'Enter the 6-digit code from the email.' })
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from the email.')

export const forgotPasswordBodySchema = z.object({ email: emailSchema }).strict()

export const verifyResetCodeBodySchema = z.object({ email: emailSchema, code: resetCodeSchema }).strict()

// Same password rules as signup (REQ-1).
export const resetPasswordBodySchema = z
  .object({ email: emailSchema, code: resetCodeSchema, newPassword: passwordSchema })
  .strict()
