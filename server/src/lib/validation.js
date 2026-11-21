import { AppError } from './AppError.js'

// Turns Zod issues into the per-field list the forms show inline (NFR-3, EUC-01 5.1, EUC-03 5.1):
// [{ field: 'phone', message: 'Enter a Pakistani mobile number like 0300-1234567' }, ...]
// A field can appear more than once (e.g. a password that is too short AND has no digit).
export function issuesToDetails(issues, location) {
  const details = []
  for (const issue of issues) {
    const prefix = issue.path.map(String)
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        details.push({ field: [...prefix, key].join('.'), message: "This field can't be set here." })
      }
      continue
    }
    const field = prefix.length ? prefix.join('.') : location
    const message =
      issue.code === 'invalid_type' && prefix.length === 0 ? 'Send the fields as a JSON object.' : issue.message
    details.push({ field, message })
  }
  return details
}

export function validationError(details) {
  return new AppError(
    400,
    'VALIDATION_ERROR',
    'Some fields need fixing. Check the highlighted fields and try again.',
    details,
  )
}

// Parses or throws 400 VALIDATION_ERROR. Used by the validate() middleware and by controllers whose schema depends on
// the logged-in user's role (PATCH /me).
export function parseOrThrow(schema, data, location) {
  const result = schema.safeParse(data)
  if (!result.success) throw validationError(issuesToDetails(result.error.issues, location))
  return result.data
}
