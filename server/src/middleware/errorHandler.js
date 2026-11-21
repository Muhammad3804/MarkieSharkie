import { AppError } from '../lib/AppError.js'

const INTERNAL_MESSAGE = 'Something went wrong on our side. Please try again in a moment.'

// Body-parser errors carry a `type`; map them to our error shape instead of a 500.
function fromBodyParser(err) {
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', "The request body isn't valid JSON. Check the data and try again.")
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large. Send less data and try again.')
  }
  if (typeof err.type === 'string' && err.status >= 400 && err.status < 500) {
    return new AppError(err.status, 'BAD_REQUEST', "The request couldn't be read. Check the data and try again.")
  }
  return null
}

// One error middleware formats every error as { error: { code, message, details? } } (CLAUDE.md "Errors").
// Unknown errors become 500 INTERNAL_ERROR with no stack, SQL or driver detail in the response; the full error is
// logged server-side (with pg row values stripped, see lib/logger.js serializeError).
// Express needs the 4-argument signature to treat this as an error handler.
export function errorHandler(err, req, res, _next) {
  const known = err instanceof AppError ? err : fromBodyParser(err)

  if (res.headersSent) {
    req.log?.error({ err }, 'error after response started')
    res.end()
    return
  }

  if (known) {
    const body = { code: known.code, message: known.message }
    if (known.details !== undefined) body.details = known.details
    res.status(known.status).json({ error: body })
    return
  }

  res.err = err // pino-http logs it with the request (level error)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: INTERNAL_MESSAGE } })
}
