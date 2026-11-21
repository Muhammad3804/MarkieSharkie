import { beforeEach, describe, expect, it } from 'vitest'
import { api } from './helpers/app.js'
import { count, one, resetDb } from './helpers/db.js'
import { createAdmin } from '../src/modules/auth/service.js'
import { adminAccountSchema } from '../src/modules/auth/schemas.js'

beforeEach(resetDb)

const valid = {
  name: 'Platform Admin',
  email: 'Admin@MarkieSharkie.pk',
  phone: '0333-1234567',
  password: 'Admin2025',
  city: 'Lahore',
}

describe('First admin via npm run create-admin (REQ-1 "admins are created only by an existing admin")', () => {
  it('validates with the registration rules and inserts users(role=admin) + admins in one transaction', async () => {
    const input = adminAccountSchema.parse(valid)
    const admin = await createAdmin(input)
    expect(admin).toMatchObject({
      name: 'Platform Admin',
      email: 'admin@markiesharkie.pk',
      phone: '+923331234567',
      role: 'admin',
    })

    const row = await one(
      'SELECT u.role, a.permissions FROM users u JOIN admins a USING (user_id) WHERE u.user_id = $1',
      [admin.id],
    )
    expect(row).toEqual({ role: 'admin', permissions: [] })
    expect(await count('SELECT count(*) FROM customers')).toBe(0)
  })

  it('the new admin can log in and lands on /admin', async () => {
    await createAdmin(adminAccountSchema.parse(valid))
    const res = await api().post('/api/auth/login').send({ identifier: valid.email, password: valid.password })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ homePath: '/admin', user: { role: 'admin' } })
  })

  it('rejects invalid input with the same rules as registration', () => {
    const result = adminAccountSchema.safeParse({ ...valid, phone: '12345', password: 'short', role: 'admin' })
    expect(result.success).toBe(false)
    const paths = result.error.issues.map((i) => i.path.join('.') || i.code)
    expect(paths).toEqual(expect.arrayContaining(['phone', 'password', 'unrecognized_keys']))
  })

  it('a duplicate email -> 409 EMAIL_TAKEN and nothing inserted', async () => {
    await createAdmin(adminAccountSchema.parse(valid))
    await expect(createAdmin(adminAccountSchema.parse({ ...valid, phone: '0333-7654321' }))).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    })
    expect(await count('SELECT count(*) FROM admins')).toBe(1)
  })
})
