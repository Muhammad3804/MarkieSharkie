import request from 'supertest'
import { createApp } from '../../src/app.js'
import { createLogger } from '../../src/lib/logger.js'
import { REFRESH_COOKIE } from '../../src/config/constants.js'

// High limits so a test file never trips the auth rate limiters by accident (rateLimit.test.js tests them on purpose).
export const RELAXED_RATE_LIMITS = {
  register: { windowMs: 60_000, limit: 10_000 },
  login: { windowMs: 60_000, limit: 10_000 },
  refresh: { windowMs: 60_000, limit: 10_000 },
  forgotPassword: { windowMs: 60_000, limit: 10_000 },
  forgotPasswordPerEmail: { windowMs: 60_000, limit: 10_000, by: 'email' },
  resetCode: { windowMs: 60_000, limit: 10_000 },
}

export function testApp(options = {}) {
  return createApp({ logger: createLogger({ level: 'silent' }), rateLimits: RELAXED_RATE_LIMITS, ...options })
}

export function api(app = testApp()) {
  return request(app)
}

// The raw `ms_refresh=...; Path=...` header line, or undefined.
export function refreshCookieHeader(res) {
  const cookies = res.headers['set-cookie'] ?? []
  return cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`))
}

// Just the token value from Set-Cookie.
export function refreshCookieValue(res) {
  const header = refreshCookieHeader(res)
  if (!header) return undefined
  return decodeURIComponent(header.slice(REFRESH_COOKIE.length + 1).split(';')[0])
}

export const cookie = (token) => `${REFRESH_COOKIE}=${encodeURIComponent(token)}`

export const bearer = (token) => `Bearer ${token}`
