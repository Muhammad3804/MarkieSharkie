import { issuesToDetails, validationError } from '../lib/validation.js'

const LOCATIONS = ['params', 'query', 'body']

// validate({ body, params, query }) with Zod schemas (CLAUDE.md rule 7). Schemas are expected to be .strict() so
// unknown keys are rejected (docs/api-and-security.md "Input validation"). Errors from every location are collected
// into one 400 so the form can show them all at once. Parsed (normalised) values replace the raw ones.
export function validate(schemas) {
  return (req, _res, next) => {
    const details = []
    const parsed = {}
    for (const location of LOCATIONS) {
      const schema = schemas[location]
      if (!schema) continue
      const result = schema.safeParse(req[location] ?? {})
      if (result.success) parsed[location] = result.data
      else details.push(...issuesToDetails(result.error.issues, location))
    }
    if (details.length) return next(validationError(details))
    for (const [location, value] of Object.entries(parsed)) req[location] = value
    next()
  }
}
