import { z } from 'zod'
import {
  bioSchema,
  businessNameSchema,
  citySchema,
  nameSchema,
  phoneSchema,
  preferencesSchema,
} from '../../lib/validators.js'

// EUC-03 step 3 editable fields, per role, with the same validators as registration (REQ-1, REQ-4).
// .strict(): email, role, password, isActive and anything unknown are rejected with 400 (nothing is saved, step 5.1).
// Changing email / password are separate, later features (see docs/progress.md TODO).

const common = {
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
  city: citySchema.optional(),
}

// `when`: only when every field is otherwise valid; Zod 4 would else also report it next to an unknown-key error.
const atLeastOneField = (schema) =>
  schema.refine((value) => Object.keys(value).length > 0, {
    message: 'Change at least one field before saving.',
    when: (payload) => payload.issues.length === 0,
  })

export const updateMeSchemas = Object.freeze({
  // preferences replaces the whole stored preferences object.
  customer: atLeastOneField(z.object({ ...common, preferences: preferencesSchema.optional() }).strict()),
  venue_owner: atLeastOneField(
    z
      .object({ ...common, businessName: businessNameSchema.optional(), contactNumber: phoneSchema.optional() })
      .strict(),
  ),
  decorator: atLeastOneField(
    z
      .object({
        ...common,
        businessName: businessNameSchema.optional(),
        bio: bioSchema.optional(),
        serviceCity: citySchema.optional(),
      })
      .strict(),
  ),
})

// srs-alignment #24: EUC-03's primary actors. Admins can read GET /me but not edit through PATCH /me.
export const PROFILE_EDIT_ROLES = Object.freeze(Object.keys(updateMeSchemas))
