import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/config/constants.js'

beforeEach(resetDb)

const SECRET = process.env.JWT_ACCESS_SECRET
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const sign = (payload, options = {}) =>
  jwt.sign(payload, options.secret ?? SECRET, {
    algorithm: options.algorithm ?? 'HS256',
    issuer: options.issuer ?? JWT_ISSUER,
    audience: options.audience ?? JWT_AUDIENCE,
    ...(options.subject !== null ? { subject: options.subject } : {}),
    ...(options.expiresIn !== undefined ? { expiresIn: options.expiresIn } : {}),
  })

const me = (authorization) => {
  const req = api().get('/api/me')
  return authorization === undefined ? req : req.set('Authorization', authorization)
}

const expectUnauthenticated = (res) => {
  expect(res.status).toBe(401)
  expect(res.body.error.code).toBe('UNAUTHENTICATED')
}

describe('authenticate middleware (REQ-3, SYS-04, NFR-4)', () => {
  it('accepts a valid access token and loads the user from the DB', async () => {
    const s = await signedIn(api())
    const res = await me(bearer(s.accessToken))
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(s.user.id)
  })

  it.each([
    ['no header', undefined],
    ['empty bearer', 'Bearer '],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['garbage', 'Bearer not.a.jwt'],
  ])('%s -> 401 UNAUTHENTICATED', async (_label, header) => {
    expectUnauthenticated(await me(header))
  })

  it('rejects a token signed with another secret', async () => {
    const s = await signedIn(api())
    expectUnauthenticated(
      await me(
        bearer(sign({ role: 'customer' }, { subject: s.user.id, secret: crypto.randomBytes(32).toString('hex') })),
      ),
    )
  })

  it('alg is pinned to HS256: alg "none" and HS512 are rejected', async () => {
    const s = await signedIn(api())
    const now = Math.floor(Date.now() / 1000)
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: s.user.id, role: 'admin', iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: now, exp: now + 600 })}.`
    expectUnauthenticated(await me(bearer(none)))
    expectUnauthenticated(await me(bearer(sign({ role: 'customer' }, { subject: s.user.id, algorithm: 'HS512' }))))
  })

  it('checks iss, aud and exp', async () => {
    const s = await signedIn(api())
    expectUnauthenticated(await me(bearer(sign({ role: 'customer' }, { subject: s.user.id, issuer: 'someone-else' }))))
    expectUnauthenticated(await me(bearer(sign({ role: 'customer' }, { subject: s.user.id, audience: 'other-app' }))))
    const expired = sign({ role: 'customer', exp: Math.floor(Date.now() / 1000) - 5 }, { subject: s.user.id })
    expectUnauthenticated(await me(bearer(expired)))
  })

  it('rejects a token for a user that does not exist or has a bad subject', async () => {
    expectUnauthenticated(await me(bearer(sign({ role: 'customer' }, { subject: crypto.randomUUID() }))))
    expectUnauthenticated(await me(bearer(sign({ role: 'customer' }, { subject: "1' OR '1'='1" }))))
    expectUnauthenticated(await me(bearer(sign({ role: 'customer' }, { subject: null }))))
  })

  it('REQ-3 a user suspended mid-session is blocked on the very next request (403 ACCOUNT_SUSPENDED)', async () => {
    const s = await signedIn(api(), 'venue_owner')
    await pool.query('UPDATE users SET is_active = false WHERE user_id = $1', [s.user.id])
    const res = await me(bearer(s.accessToken))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED')
  })

  it('a deleted user is blocked (401)', async () => {
    const s = await signedIn(api())
    await pool.query('UPDATE users SET deleted_at = now() WHERE user_id = $1', [s.user.id])
    expectUnauthenticated(await me(bearer(s.accessToken)))
  })

  it('the role comes from the database, not the token: a forged role claim gains nothing', async () => {
    const s = await signedIn(api(), 'customer')
    // Even a validly signed token claiming admin still resolves to the DB role.
    const forged = sign({ role: 'admin' }, { subject: s.user.id })
    const res = await me(bearer(forged))
    expect(res.body.user.role).toBe('customer')
  })
})

describe('requireRole (REQ-3, SYS-04)', () => {
  it.each(['venue_owner', 'decorator', 'admin'])(
    '%s cannot read customer-only /me/searches and /me/bookings',
    async (role) => {
      const s = await signedIn(api(), role)
      for (const path of ['/api/me/searches', '/api/me/bookings']) {
        const res = await api().get(path).set('Authorization', bearer(s.accessToken))
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
      }
    },
  )

  it('srs-alignment #24: admins can GET /me but not PATCH it (EUC-03 actors only)', async () => {
    const s = await signedIn(api(), 'admin')
    expect((await me(bearer(s.accessToken))).status).toBe(200)
    const res = await api().patch('/api/me').set('Authorization', bearer(s.accessToken)).send({ city: 'Karachi' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('no admin can be created through the API (REQ-1)', async () => {
    const app = (await import('./helpers/app.js')).testApp()
    const paths = app.locals.routes.map((r) => r.path)
    expect(paths.some((p) => /admin/.test(p))).toBe(false)
  })
})
