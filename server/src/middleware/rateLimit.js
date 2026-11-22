import rateLimit from 'express-rate-limit'
import { AppError } from '../lib/AppError.js'

const MINUTE = 60 * 1000

// docs/api-and-security.md "Hardening": rate limits on the auth routes, per client IP (see TRUST_PROXY).
// The REQ-2 per-account lockout is separate (users.failed_login_attempts); this one slows guessing across accounts.
export const AUTH_RATE_LIMITS = Object.freeze({
  register: { windowMs: 60 * MINUTE, limit: 10 },
  login: { windowMs: 15 * MINUTE, limit: 20 },
  refresh: { windowMs: 15 * MINUTE, limit: 60 },
  // REQ-2 password reset: per IP, plus per email address (so one inbox can't be flooded from many IPs).
  forgotPassword: { windowMs: 15 * MINUTE, limit: 10 },
  forgotPasswordPerEmail: { windowMs: 15 * MINUTE, limit: 3, by: 'email' },
  resetCode: { windowMs: 15 * MINUTE, limit: 30 },
})

const RATE_LIMITED_MESSAGES = {
  ip: 'Too many attempts from this device. Wait a few minutes and try again.',
  email: 'Too many codes asked for this email. Wait 15 minutes, then ask for a new one.',
}

// The submitted email, normalised like the validators do (the limiter runs before validation).
const emailKey = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  return `email:${email.slice(0, 254)}`
}

// by: 'ip' (default) or 'email' (keyed on req.body.email).
export function createRateLimiter({ windowMs, limit, by = 'ip' }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(by === 'email' ? { keyGenerator: emailKey } : {}),
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', RATE_LIMITED_MESSAGES[by]))
    },
  })
}
