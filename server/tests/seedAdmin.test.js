import { beforeEach, describe, expect, it } from 'vitest'
import { api, cookie } from './helpers/app.js'
import { count, one, resetDb } from './helpers/db.js'
import { account, login, register, signedIn } from './helpers/factories.js'
import { ensureAdmin } from '../src/modules/auth/service.js'

beforeEach(resetDb)

const ADMIN = {
  name: 'Seed Admin',
  email: 'seed.admin@example.pk',
  password: 'Admin2026pass',
  phone: '+923330001111',
  city: 'Lahore',
}

describe('npm run seed:admin (ensureAdmin)', () => {
  it('creates one admin (users + admins rows, argon2id hash) and logs in to /admin', async () => {
    const result = await ensureAdmin(ADMIN)
    expect(result.status).toBe('created')
    const row = await one('SELECT role, password_hash FROM users WHERE email = $1', [ADMIN.email])
    expect(row.role).toBe('admin')
    expect(row.password_hash).toMatch(/^\$argon2id\$/)
    expect(await count('SELECT count(*) FROM admins')).toBe(1)

    const res = await login(api(), ADMIN.email, ADMIN.password)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      homePath: '/admin',
      firstLogin: true,
      user: { role: 'admin', name: 'Seed Admin' },
    })
  })

  it('is idempotent: a second run changes nothing, even with a different password', async () => {
    await ensureAdmin(ADMIN)
    const before = await one('SELECT password_hash FROM users WHERE email = $1', [ADMIN.email])
    const again = await ensureAdmin({ ...ADMIN, password: 'Other2026pass' })
    expect(again.status).toBe('exists')
    expect(await count('SELECT count(*) FROM users WHERE role = $1', ['admin'])).toBe(1)
    expect((await one('SELECT password_hash FROM users WHERE email = $1', [ADMIN.email])).password_hash).toBe(
      before.password_hash,
    )
    expect((await login(api(), ADMIN.email, ADMIN.password)).status).toBe(200)
  })

  it('--reset-password changes only the password and ends the admin sessions', async () => {
    const agent = api()
    await ensureAdmin(ADMIN)
    const first = await login(agent, ADMIN.email, ADMIN.password)
    const refresh = decodeURIComponent(first.headers['set-cookie'][0].split(';')[0].slice('ms_refresh='.length))

    const result = await ensureAdmin({ ...ADMIN, password: 'Other2026pass' }, { resetPassword: true })
    expect(result.status).toBe('password_reset')
    expect((await login(agent, ADMIN.email, ADMIN.password)).status).toBe(401)
    expect((await login(agent, ADMIN.email, 'Other2026pass')).status).toBe(200)
    expect((await agent.post('/api/auth/refresh').set('Cookie', cookie(refresh)).send({})).status).toBe(401)
  })

  it('refuses an email that belongs to a non-admin account', async () => {
    const { body } = await register(api(), 'customer')
    await expect(ensureAdmin({ ...ADMIN, email: body.email })).rejects.toMatchObject({ status: 409 })
    expect((await one('SELECT role FROM users WHERE email = $1', [body.email])).role).toBe('customer')
  })

  it('public signup cannot create an admin', async () => {
    const res = await api().post('/api/auth/register').send(account('admin'))
    expect(res.status).toBe(400)
    expect(await count('SELECT count(*) FROM users')).toBe(0)
  })

  it('a non-admin login is sent to its own home page, not /admin', async () => {
    const { body } = await signedIn(api(), 'customer')
    const res = await login(api(), body.email, body.password)
    expect(res.body.homePath).toBe('/app')
  })
})
