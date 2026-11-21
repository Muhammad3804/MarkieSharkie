import rateLimit from 'express-rate-limit'
import { AppError } from '../lib/AppError.js'

const MINUTE = 60 * 1000

// docs/api-and-security.md "Hardening": rate limits on the auth routes, per client IP (see TRUST_PROXY).
// The REQ-2 per-account lockout is separate (users.failed_login_attempts); this one slows guessing across accounts.
export const AUTH_RATE_LIMITS = Object.freeze({
  register: { windowMs: 60 * MINUTE, limit: 10 },
  login: { windowMs: 15 * MINUTE, limit: 20 },
  refresh: { windowMs: 15 * MINUTE, limit: 60 },
})

export function createRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts from this device. Wait a few minutes and try again.'))
    },
  })
}
