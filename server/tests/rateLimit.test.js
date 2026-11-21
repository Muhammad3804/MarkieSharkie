import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { testApp } from './helpers/app.js'
import { resetDb } from './helpers/db.js'
import { AUTH_RATE_LIMITS } from '../src/middleware/rateLimit.js'

beforeEach(resetDb)

const tight = { windowMs: 60_000, limit: 2 }

describe('rate limits on /api/auth/register, /login, /refresh (docs/api-and-security.md "Hardening")', () => {
  it.each(['register', 'login', 'refresh'])('%s returns 429 RATE_LIMITED after the limit', async (route) => {
    const app = testApp({ rateLimits: { ...AUTH_RATE_LIMITS, [route]: tight } })
    const agent = request(app)
    const hit = () => agent.post(`/api/auth/${route}`).send({})
    await hit()
    await hit()
    const res = await hit()
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('RATE_LIMITED')
    expect(res.headers.ratelimit ?? res.headers['ratelimit-policy']).toBeDefined()
  })

  it('logout is not rate limited', async () => {
    const app = testApp({ rateLimits: { register: tight, login: tight, refresh: tight } })
    const agent = request(app)
    for (let i = 0; i < 5; i++) expect((await agent.post('/api/auth/logout')).status).toBe(204)
  })

  it('the production defaults are sensible', () => {
    expect(AUTH_RATE_LIMITS.login.limit).toBeGreaterThanOrEqual(5) // above the per-account lockout (REQ-2)
    expect(AUTH_RATE_LIMITS.login.windowMs).toBe(15 * 60 * 1000)
  })
})
