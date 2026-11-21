import crypto from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, cookie, refreshCookieHeader, refreshCookieValue } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'

beforeEach(resetDb)

const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex')
const refresh = (agent, token) => {
  const req = agent.post('/api/auth/refresh')
  return token ? req.set('Cookie', cookie(token)) : req
}
const tokenRow = (token) => one('SELECT * FROM refresh_tokens WHERE token_hash = $1', [sha256(token)])
const activeTokens = (userId) =>
  count('SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [userId])

const expectSessionExpired = (res) => {
  expect(res.status).toBe(401)
  expect(res.body.error.code).toBe('SESSION_EXPIRED')
  expect(refreshCookieHeader(res)).toMatch(/^ms_refresh=;.*Expires=Thu, 01 Jan 1970/) // cookie cleared
}

describe('POST /api/auth/refresh (REQ-2 session, NFR-4)', () => {
  it('rotates: old token revoked, new token + new access token returned, same absolute expiry', async () => {
    const agent = api()
    const s = await signedIn(agent, 'customer')
    const before = await tokenRow(s.refreshToken)

    const res = await refresh(agent, s.refreshToken)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ accessToken: expect.any(String), user: s.user, homePath: '/app' })

    const newToken = refreshCookieValue(res)
    expect(newToken).toBeTruthy()
    expect(newToken).not.toBe(s.refreshToken)
    expect((await tokenRow(s.refreshToken)).revoked_at).not.toBeNull()
    const after = await tokenRow(newToken)
    expect(after.revoked_at).toBeNull()
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime())

    expect((await refresh(agent, newToken)).status).toBe(200) // the new one works
  })

  it('no cookie -> 401 SESSION_EXPIRED', async () => {
    expectSessionExpired(await refresh(api()))
  })

  it('unknown token -> 401 SESSION_EXPIRED', async () => {
    expectSessionExpired(await refresh(api(), crypto.randomBytes(32).toString('base64url')))
  })

  it('expired token -> 401 and revoked', async () => {
    const agent = api()
    const s = await signedIn(agent)
    await pool.query("UPDATE refresh_tokens SET expires_at = now() - interval '1 second'")
    expectSessionExpired(await refresh(agent, s.refreshToken))
    expect((await tokenRow(s.refreshToken)).revoked_at).not.toBeNull()
  })

  it('REQ-2 30-minute inactivity: unused for 31 min -> 401; 29 min -> still fine', async () => {
    const agent = api()
    const idle = await signedIn(agent)
    await pool.query("UPDATE refresh_tokens SET last_used_at = now() - interval '31 minutes' WHERE user_id = $1", [
      idle.user.id,
    ])
    expectSessionExpired(await refresh(agent, idle.refreshToken))

    const active = await signedIn(agent)
    await pool.query("UPDATE refresh_tokens SET last_used_at = now() - interval '29 minutes' WHERE user_id = $1", [
      active.user.id,
    ])
    expect((await refresh(agent, active.refreshToken)).status).toBe(200)
  })

  it("reuse detection: presenting an already-rotated token revokes ALL of that user's sessions", async () => {
    const agent = api()
    const s = await signedIn(agent)
    const otherDevice = await agent
      .post('/api/auth/login')
      .send({ identifier: s.body.email, password: s.body.password })
    const rotated = refreshCookieValue(await refresh(agent, s.refreshToken))
    expect(await activeTokens(s.user.id)).toBe(2)

    expectSessionExpired(await refresh(agent, s.refreshToken)) // the stolen / old token
    expect(await activeTokens(s.user.id)).toBe(0)
    expectSessionExpired(await refresh(agent, rotated))
    expectSessionExpired(await refresh(agent, refreshCookieValue(otherDevice)))
  })

  it('srs-alignment #26 (strict, Q3): two refreshes racing with the same token -> one 200, then every session ends', async () => {
    const agent = api()
    const s = await signedIn(agent)
    const results = await Promise.all([refresh(agent, s.refreshToken), refresh(agent, s.refreshToken)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 401])
    expect(await activeTokens(s.user.id)).toBe(0)
  })

  it('REQ-3 suspended user -> 403 ACCOUNT_SUSPENDED, cookie cleared, all sessions revoked', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    await pool.query('UPDATE users SET is_active = false WHERE user_id = $1', [s.user.id])
    const res = await refresh(agent, s.refreshToken)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED')
    expect(refreshCookieHeader(res)).toMatch(/^ms_refresh=;/)
    expect(await activeTokens(s.user.id)).toBe(0)
  })

  it('deleted user -> 401 SESSION_EXPIRED', async () => {
    const agent = api()
    const s = await signedIn(agent)
    await pool.query('UPDATE users SET deleted_at = now() WHERE user_id = $1', [s.user.id])
    expectSessionExpired(await refresh(agent, s.refreshToken))
  })

  it('rejects a body (cookie only)', async () => {
    const res = await api().post('/api/auth/refresh').send({ refreshToken: 'x' })
    expect(res.status).toBe(400)
  })
})

describe('UC-03 / EUC-02 step 7 Log Out (REQ-2)', () => {
  it('revokes the refresh token, clears the cookie, returns 204; refresh afterwards fails', async () => {
    const agent = api()
    const s = await signedIn(agent)
    const res = await agent.post('/api/auth/logout').set('Cookie', cookie(s.refreshToken))
    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect(refreshCookieHeader(res)).toMatch(/^ms_refresh=;.*Path=\/api\/auth/)
    expect((await tokenRow(s.refreshToken)).revoked_at).not.toBeNull()
    expect((await refresh(agent, s.refreshToken)).status).toBe(401)
  })

  it('is idempotent: no cookie, an unknown token, or logging out twice all return 204', async () => {
    const agent = api()
    const s = await signedIn(agent)
    expect((await agent.post('/api/auth/logout')).status).toBe(204)
    expect((await agent.post('/api/auth/logout').set('Cookie', cookie('not-a-real-token'))).status).toBe(204)
    expect((await agent.post('/api/auth/logout').set('Cookie', cookie(s.refreshToken))).status).toBe(204)
    expect((await agent.post('/api/auth/logout').set('Cookie', cookie(s.refreshToken))).status).toBe(204)
  })

  it('logging out on one device leaves other sessions alone', async () => {
    const agent = api()
    const a = await signedIn(agent)
    const b = await agent.post('/api/auth/login').send({ identifier: a.body.email, password: a.body.password })
    await agent.post('/api/auth/logout').set('Cookie', cookie(a.refreshToken)).expect(204)
    expect((await refresh(agent, refreshCookieValue(b))).status).toBe(200)
  })
})
