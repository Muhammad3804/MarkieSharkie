import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, refreshCookieHeader, refreshCookieValue } from './helpers/app.js'
import { one, pool, resetDb } from './helpers/db.js'
import { PASSWORD, login, normalized, register, signedIn, userRow } from './helpers/factories.js'
import { INVALID_CREDENTIALS_MESSAGE } from '../src/modules/auth/service.js'

beforeEach(resetDb)

const SUSPENDED_MESSAGE = 'Your account has been suspended by an administrator. Contact support.'

describe('UC-02 / EUC-02 Log In (REQ-2, REQ-3, SYS-04)', () => {
  it('EUC-02 3-6 email + password: access token, refresh cookie, user and role home page', async () => {
    const agent = api()
    const { body, user } = await register(agent, 'customer')
    const res = await login(agent, body.email)

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      user: {
        id: user.id,
        name: body.name,
        email: body.email,
        phone: normalized(body.phone),
        role: 'customer',
        city: 'Faisalabad',
      },
      homePath: '/app',
    })
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i)

    const claims = jwt.decode(res.body.accessToken, { complete: true })
    expect(claims.header.alg).toBe('HS256')
    expect(claims.payload).toMatchObject({
      sub: user.id,
      role: 'customer',
      iss: 'markiesharkie-api',
      aud: 'markiesharkie-client',
    })
    expect(claims.payload.exp - claims.payload.iat).toBe(15 * 60) // ACCESS_TOKEN_TTL_MINUTES
  })

  it('EUC-02 5 refresh cookie is httpOnly, SameSite=Strict, scoped to /api/auth; only its SHA-256 is stored', async () => {
    const agent = api()
    const { body, user } = await register(agent, 'customer')
    const res = await agent
      .post('/api/auth/login')
      .set('User-Agent', 'vitest-browser')
      .send({ identifier: body.email, password: body.password })

    const header = refreshCookieHeader(res)
    expect(header).toMatch(/HttpOnly/i)
    expect(header).toMatch(/SameSite=Strict/i)
    expect(header).toMatch(/Path=\/api\/auth/)
    expect(header).not.toMatch(/Secure/i) // Secure only when NODE_ENV=production

    const token = refreshCookieValue(res)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    const row = await one('SELECT * FROM refresh_tokens WHERE user_id = $1', [user.id])
    expect(row.token_hash).toBe(crypto.createHash('sha256').update(token).digest('hex'))
    expect(row.token_hash).not.toContain(token)
    expect(row.user_agent).toBe('vitest-browser')
    const days = (row.expires_at - row.created_at) / 86_400_000
    expect(days).toBeCloseTo(7, 3) // REFRESH_TOKEN_TTL_DAYS
  })

  it.each([['0300-1234567'], ['03001234567'], ['+92 300 1234567'], ['+923001234567']])(
    'REQ-2 log in with mobile %s',
    async (identifier) => {
      const agent = api()
      await register(agent, 'customer', { phone: '0300 123 4567' })
      expect((await login(agent, identifier)).status).toBe(200)
    },
  )

  it('email is case-insensitive', async () => {
    const agent = api()
    const { body } = await register(agent, 'customer')
    expect((await login(agent, body.email.toUpperCase())).status).toBe(200)
  })

  it.each([
    ['venue_owner', '/owner'],
    ['decorator', '/decorator'],
    ['admin', '/admin'],
  ])('EUC-02 6 %s lands on %s', async (role, homePath) => {
    const session = await signedIn(api(), role)
    expect(session.user.role).toBe(role)
    const res = await login(api(), session.body.email)
    expect(res.body.homePath).toBe(homePath)
  })

  it('EUC-02 4.1 wrong password and unknown user get the identical 401, and another attempt is allowed', async () => {
    const agent = api()
    const { body } = await register(agent, 'customer')

    const wrong = await login(agent, body.email, 'Wrong12345')
    const unknown = await login(agent, 'nobody@example.pk', 'Wrong12345')
    const unknownPhone = await login(agent, '0345-0000000', 'Wrong12345')

    for (const res of [wrong, unknown, unknownPhone]) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE } })
      expect(refreshCookieHeader(res)).toBeUndefined()
    }
    expect((await login(agent, body.email)).status).toBe(200) // try again
  })

  it('validation: identifier must be an email or PK mobile; password required', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'ali', password: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['identifier', 'password'])
  })

  describe('REQ-2 lockout: 5 failures in a row lock the account for 15 minutes', () => {
    it('failures 1-4 are 401; the 5th is 423 with minutes remaining; a correct password is refused while locked', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'customer')

      for (let i = 1; i <= 4; i++) {
        const res = await login(agent, body.email, 'Wrong12345')
        expect(res.status).toBe(401)
        expect((await userRow(user.id)).failed_login_attempts).toBe(i)
      }

      const fifth = await login(agent, body.email, 'Wrong12345')
      expect(fifth.status).toBe(423)
      expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED')
      expect(fifth.body.error.details).toEqual({ minutesRemaining: 15 })
      expect(fifth.body.error.message).toContain('15 more minutes')

      const row = await userRow(user.id)
      expect((row.locked_until - Date.now()) / 60_000).toBeGreaterThan(14)

      const correct = await login(agent, body.email)
      expect(correct.status).toBe(423)
      expect(refreshCookieHeader(correct)).toBeUndefined()
    })

    it('an expired lock resets the counter: the next failure counts as the first', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'customer')
      await pool.query(
        "UPDATE users SET failed_login_attempts = 5, locked_until = now() - interval '1 minute' WHERE user_id = $1",
        [user.id],
      )
      const res = await login(agent, body.email, 'Wrong12345')
      expect(res.status).toBe(401)
      const row = await userRow(user.id)
      expect(row.failed_login_attempts).toBe(1)
      expect(row.locked_until).toBeNull()
    })

    it('an expired lock lets the correct password in', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'customer')
      await pool.query(
        "UPDATE users SET failed_login_attempts = 5, locked_until = now() - interval '1 second' WHERE user_id = $1",
        [user.id],
      )
      expect((await login(agent, body.email)).status).toBe(200)
    })

    it('success resets the counter, clears locked_until and sets last_login_at', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'customer')
      for (let i = 0; i < 3; i++) await login(agent, body.email, 'Wrong12345')
      expect((await userRow(user.id)).last_login_at).toBeNull()

      expect((await login(agent, body.email)).status).toBe(200)
      const row = await userRow(user.id)
      expect(row.failed_login_attempts).toBe(0)
      expect(row.locked_until).toBeNull()
      expect(Date.now() - row.last_login_at).toBeLessThan(60_000)
    })

    it('parallel wrong guesses are counted atomically (no lost updates)', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'customer')
      const results = await Promise.all(Array.from({ length: 5 }, () => login(agent, body.email, 'Wrong12345')))
      const row = await userRow(user.id)
      expect(row.failed_login_attempts).toBe(5)
      expect(row.locked_until).not.toBeNull()
      expect(results.filter((r) => r.status === 423).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('EUC-02 4.2 / REQ-3 blocked accounts', () => {
    it('suspended (is_active=false) + correct password -> 403 ACCOUNT_SUSPENDED, no session', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'decorator')
      await pool.query('UPDATE users SET is_active = false WHERE user_id = $1', [user.id])

      const res = await login(agent, body.email)
      expect(res.status).toBe(403)
      expect(res.body.error).toEqual({ code: 'ACCOUNT_SUSPENDED', message: SUSPENDED_MESSAGE })
      expect(refreshCookieHeader(res)).toBeUndefined()
      expect((await one('SELECT count(*)::int AS n FROM refresh_tokens')).n).toBe(0)
    })

    it('suspended + wrong password -> the generic 401 (a stranger cannot learn the account is suspended)', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'customer')
      await pool.query('UPDATE users SET is_active = false WHERE user_id = $1', [user.id])
      const res = await login(agent, body.email, 'Wrong12345')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it('deleted (deleted_at set) -> treated exactly like an unknown user', async () => {
      const agent = api()
      const { body, user } = await register(agent, 'customer')
      await pool.query('UPDATE users SET deleted_at = now() WHERE user_id = $1', [user.id])
      const res = await login(agent, body.email, PASSWORD)
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    })
  })
})
