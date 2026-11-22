import { beforeEach, describe, expect, it } from 'vitest'
import { api, cookie } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { PASSWORD, login, register, signedIn } from './helpers/factories.js'
import { testOutbox } from '../src/integrations/mailer.js'
import { RESET_REQUESTED_MESSAGE } from '../src/modules/auth/service.js'
import { generateResetCode, hashResetCode, resetCodeMatches } from '../src/modules/auth/tokens.js'

beforeEach(async () => {
  await resetDb()
  testOutbox.length = 0
})

const NEW_PASSWORD = 'Naya2026pass'

async function forgot(agent, email) {
  return agent.post('/api/auth/forgot-password').send({ email })
}
const codeFor = (email) => testOutbox.filter((m) => m.to === email).at(-1)?.code
const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
const latestRow = (userId) =>
  one('SELECT * FROM password_reset_codes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId])
// Lets the next request skip the 30 s resend cooldown.
const ageCodes = (userId) =>
  pool.query(`UPDATE password_reset_codes SET created_at = created_at - interval '1 minute' WHERE user_id = $1`, [
    userId,
  ])

describe('reset code generation and hashing', () => {
  it('codes are 6 digits from a CSPRNG and spread over the range', () => {
    const codes = Array.from({ length: 2000 }, generateResetCode)
    for (const code of codes) expect(code).toMatch(/^\d{6}$/)
    expect(new Set(codes).size).toBeGreaterThan(1990)
  })

  it('only a keyed hash is stored; it depends on the user and verifies in constant time', () => {
    const a = hashResetCode('11111111-1111-4111-8111-111111111111', '123456')
    const b = hashResetCode('22222222-2222-4222-8222-222222222222', '123456')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(resetCodeMatches('11111111-1111-4111-8111-111111111111', '123456', a)).toBe(true)
    expect(resetCodeMatches('11111111-1111-4111-8111-111111111111', '123457', a)).toBe(false)
    expect(resetCodeMatches('11111111-1111-4111-8111-111111111111', '123456', 'zz')).toBe(false)
  })
})

describe('POST /api/auth/forgot-password', () => {
  it('emails a code, stores only its hash with a 10-minute expiry', async () => {
    const agent = api()
    const { body, user } = await register(agent)
    const res = await forgot(agent, body.email)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: RESET_REQUESTED_MESSAGE, expiresInMinutes: 10, resendAfterSeconds: 30 })

    const mail = testOutbox.at(-1)
    expect(mail.to).toBe(body.email)
    expect(mail.subject).toBe('Your MarkieSharkie password reset code')
    expect(mail.text).toContain(mail.code)
    expect(mail.text).toMatch(/expires in 10 minutes/)
    expect(mail.text).toMatch(/ignore this email/)

    const row = await latestRow(user.id)
    expect(row.code_hash).not.toContain(mail.code)
    expect(row.code_hash).toBe(hashResetCode(user.id, mail.code))
    expect(row.used_at).toBeNull()
    expect(row.attempts).toBe(0)
    const minutes = (row.expires_at - row.created_at) / 60000
    expect(minutes).toBeCloseTo(10, 1)
  })

  it('answers the same for an unknown email and sends nothing', async () => {
    const agent = api()
    const res = await forgot(agent, 'nobody@example.pk')
    expect(res.status).toBe(200)
    expect(res.body.message).toBe(RESET_REQUESTED_MESSAGE)
    expect(testOutbox).toHaveLength(0)
    expect(await count('SELECT count(*) FROM password_reset_codes')).toBe(0)
  })

  it('suspended accounts get the same answer and no code', async () => {
    const agent = api()
    const { body, user } = await register(agent)
    await pool.query('UPDATE users SET is_active = false WHERE user_id = $1', [user.id])
    const res = await forgot(agent, body.email)
    expect(res.status).toBe(200)
    expect(testOutbox).toHaveLength(0)
  })

  it('a second request within 30 s sends nothing new; after that a new code replaces the old one', async () => {
    const agent = api()
    const { body, user } = await register(agent)
    await forgot(agent, body.email)
    const firstCode = codeFor(body.email)
    await forgot(agent, body.email)
    expect(testOutbox).toHaveLength(1)

    await ageCodes(user.id)
    await forgot(agent, body.email)
    const secondCode = codeFor(body.email)
    expect(testOutbox).toHaveLength(2)
    expect(
      await count('SELECT count(*) FROM password_reset_codes WHERE user_id = $1 AND used_at IS NULL', [user.id]),
    ).toBe(1)

    if (firstCode !== secondCode) {
      const old = await agent.post('/api/auth/verify-reset-code').send({ email: body.email, code: firstCode })
      expect(old.status).toBe(400)
      expect(old.body.error.code).toBe('RESET_CODE_INVALID')
    }
    const current = await agent.post('/api/auth/verify-reset-code').send({ email: body.email, code: secondCode })
    expect(current.status).toBe(200)
  })

  it('rejects a bad email with a field error', async () => {
    const res = await forgot(api(), 'not-an-email')
    expect(res.status).toBe(400)
    expect(res.body.error.details[0].field).toBe('email')
  })
})

describe('POST /api/auth/verify-reset-code and /reset-password', () => {
  async function withCode(role = 'customer') {
    const agent = api()
    const session = await signedIn(agent, role)
    await forgot(agent, session.body.email)
    return { agent, ...session, email: session.body.email, code: codeFor(session.body.email) }
  }

  it('verify accepts the right code without using it up', async () => {
    const { agent, email, code, user } = await withCode()
    const res = await agent.post('/api/auth/verify-reset-code').send({ email, code })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ valid: true })
    expect((await latestRow(user.id)).used_at).toBeNull()
  })

  it('reset: new password works, old fails, code is spent, sessions end', async () => {
    const { agent, email, code, user, refreshToken } = await withCode()
    const res = await agent.post('/api/auth/reset-password').send({ email, code, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('ms_refresh=;'))).toBe(true)

    expect((await login(agent, email, PASSWORD)).status).toBe(401)
    expect((await login(agent, email, NEW_PASSWORD)).status).toBe(200)

    expect((await latestRow(user.id)).used_at).not.toBeNull()
    const refresh = await agent.post('/api/auth/refresh').set('Cookie', cookie(refreshToken)).send({})
    expect(refresh.status).toBe(401)

    const stored = await one('SELECT password_hash FROM users WHERE user_id = $1', [user.id])
    expect(stored.password_hash).toMatch(/^\$argon2id\$/)
    expect(stored.password_hash).not.toContain(NEW_PASSWORD)
  })

  it('a used code is refused the second time', async () => {
    const { agent, email, code } = await withCode()
    await agent.post('/api/auth/reset-password').send({ email, code, newPassword: NEW_PASSWORD })
    const again = await agent.post('/api/auth/reset-password').send({ email, code, newPassword: 'Another2027' })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('RESET_CODE_EXPIRED')
  })

  it('an expired code is refused', async () => {
    const { agent, email, code, user } = await withCode()
    await pool.query(`UPDATE password_reset_codes SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [
      user.id,
    ])
    const res = await agent.post('/api/auth/verify-reset-code').send({ email, code })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('RESET_CODE_EXPIRED')
  })

  it('wrong codes count down and the 5th locks the code (even the right one is refused after)', async () => {
    const { agent, email, code, user } = await withCode()
    const bad = wrongCode(code)
    for (let left = 4; left >= 1; left--) {
      const res = await agent.post('/api/auth/verify-reset-code').send({ email, code: bad })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'RESET_CODE_INVALID', details: { attemptsLeft: left } })
    }
    const fifth = await agent.post('/api/auth/reset-password').send({ email, code: bad, newPassword: NEW_PASSWORD })
    expect(fifth.status).toBe(423)
    expect(fifth.body.error.code).toBe('RESET_CODE_LOCKED')

    const right = await agent.post('/api/auth/reset-password').send({ email, code, newPassword: NEW_PASSWORD })
    expect(right.status).toBe(423)
    const row = await latestRow(user.id)
    expect(row.attempts).toBe(5)
    expect(row.used_at).not.toBeNull()
    expect((await login(agent, email, PASSWORD)).status).toBe(200)
  })

  it('parallel wrong guesses are all counted (row lock)', async () => {
    const { agent, email, code, user } = await withCode()
    const bad = wrongCode(code)
    await Promise.all(
      Array.from({ length: 5 }, () => agent.post('/api/auth/verify-reset-code').send({ email, code: bad })),
    )
    expect((await latestRow(user.id)).attempts).toBe(5)
  })

  it('unknown email gets the same "wrong code" answer', async () => {
    const res = await api().post('/api/auth/verify-reset-code').send({ email: 'nobody@example.pk', code: '123456' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('RESET_CODE_INVALID')
    expect(res.body.error.details).toBeUndefined()
  })

  it('a weak new password fails validation and keeps the code', async () => {
    const { agent, email, code, user } = await withCode()
    const res = await agent.post('/api/auth/reset-password').send({ email, code, newPassword: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.details.map((d) => d.field)).toContain('newPassword')
    expect((await latestRow(user.id)).used_at).toBeNull()
  })

  it('a reset clears the REQ-2 login lock', async () => {
    const { agent, email, code, user } = await withCode()
    await pool.query(
      `UPDATE users SET failed_login_attempts = 5, locked_until = now() + interval '15 minutes' WHERE user_id = $1`,
      [user.id],
    )
    await agent.post('/api/auth/reset-password').send({ email, code, newPassword: NEW_PASSWORD })
    expect((await login(agent, email, NEW_PASSWORD)).status).toBe(200)
  })
})

describe('rate limits on /forgot-password', () => {
  it('per email: the 4th request for one address in the window is refused', async () => {
    const { testApp } = await import('./helpers/app.js')
    const app = testApp({
      rateLimits: { forgotPasswordPerEmail: { windowMs: 60_000, limit: 3, by: 'email' } },
    })
    const agent = api(app)
    for (let i = 0; i < 3; i++) expect((await forgot(agent, 'Same@Example.pk')).status).toBe(200)
    const blocked = await forgot(agent, 'same@example.pk')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('RATE_LIMITED')
    expect((await forgot(agent, 'other@example.pk')).status).toBe(200)
  })

  it('per IP: every address counts towards one limit', async () => {
    const { testApp } = await import('./helpers/app.js')
    const agent = api(testApp({ rateLimits: { forgotPassword: { windowMs: 60_000, limit: 2 } } }))
    expect((await forgot(agent, 'a@example.pk')).status).toBe(200)
    expect((await forgot(agent, 'b@example.pk')).status).toBe(200)
    expect((await forgot(agent, 'c@example.pk')).status).toBe(429)
  })
})
