import pino from 'pino'
import { env } from '../config/env.js'

// docs/api-and-security.md "Logs: no passwords, tokens, OTPs or full phone numbers".
// Request logs never include bodies; these paths are a second line of defence for anything logged by hand.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'phone',
  'contactNumber',
  'contact_number',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.phone',
  '*.contactNumber',
  '*.contact_number',
]

// Errors are logged with what helps debugging but without pg's `detail`, which contains row values
// (e.g. `Key (phone)=(+923001234567) already exists`).
export function serializeError(err) {
  if (!err || typeof err !== 'object') return err
  return {
    type: err.name,
    message: err.message,
    code: err.code,
    constraint: err.constraint,
    stack: err.stack,
  }
}

export function createLogger({ level = env.logLevel, destination } = {}) {
  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      serializers: { err: serializeError },
      base: { service: 'markiesharkie-api' },
    },
    destination,
  )
}

export const logger = createLogger()

// +923001234567 -> +92300*****67, for the rare place a phone must be shown (e.g. the create-admin summary).
export function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 8) return '[redacted]'
  return `${phone.slice(0, 6)}${'*'.repeat(phone.length - 8)}${phone.slice(-2)}`
}
