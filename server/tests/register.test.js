import { beforeEach, describe, expect, it } from 'vitest'
import { api, refreshCookieHeader } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { account, normalized } from './helpers/factories.js'
import { EMAIL_TAKEN_MESSAGE, PHONE_TAKEN_MESSAGE, mapUserUniqueViolation } from '../src/lib/pgErrors.js'
import { ROLE_MESSAGE } from '../src/modules/auth/schemas.js'
import { PHONE_MESSAGE } from '../src/lib/validators.js'

beforeEach(resetDb)

const register = (body) => api().post('/api/auth/register').send(body)
const fields = (res) => res.body.error.details.map((d) => d.field)

describe('UC-01 / EUC-01 Register Account (REQ-1)', () => {
  it('EUC-01 3-7 customer: creates users + customers in one go and sends the user to /login', async () => {
    const body = account('customer', { email: '  Sara.Khan@Example.PK ', phone: '+92 300 1234567' })
    const res = await register(body)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      user: { id: expect.any(String), name: body.name, email: 'sara.khan@example.pk', role: 'customer' },
      next: '/login',
    })
    expect(refreshCookieHeader(res)).toBeUndefined() // EUC-01 step 7: no login, no tokens
    expect(res.body.accessToken).toBeUndefined()

    const user = await one('SELECT * FROM users WHERE user_id = $1', [res.body.user.id])
    expect(user).toMatchObject({
      role: 'customer',
      phone: '+923001234567',
      email: 'sara.khan@example.pk',
      city: 'Faisalabad',
    })
    expect(user.is_active).toBe(true)
    const customer = await one('SELECT * FROM customers WHERE user_id = $1', [user.user_id])
    expect(customer.preferences).toEqual({})
  })

  it('EUC-01 6 stores the password as an argon2id hash and never returns it', async () => {
    const body = account('customer')
    const res = await register(body)
    const { password_hash: hash } = await one('SELECT password_hash FROM users WHERE user_id = $1', [res.body.user.id])
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toContain(body.password)
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i)
  })

  it('customer preferences are validated and stored normalised', async () => {
    const res = await register(
      account('customer', {
        preferences: {
          preferredCity: 'Lahore',
          eventTypes: ['walima', 'walima'],
          guestCount: 300,
          budgetMax: '350000',
        },
      }),
    )
    expect(res.status).toBe(201)
    const { preferences } = await one('SELECT preferences FROM customers WHERE user_id = $1', [res.body.user.id])
    expect(preferences).toEqual({
      preferredCity: 'Lahore',
      eventTypes: ['walima'],
      guestCount: 300,
      budgetMax: '350000.00',
    })
  })

  it('venue_owner: business name + normalised contact number in venue_owners (users.role matches)', async () => {
    const body = account('venue_owner', { contactNumber: '0321 7654321' })
    const res = await register(body)
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('venue_owner')
    const row = await one(
      'SELECT u.role, vo.* FROM venue_owners vo JOIN users u USING (user_id) WHERE vo.user_id = $1',
      [res.body.user.id],
    )
    expect(row).toMatchObject({
      role: 'venue_owner',
      business_name: body.businessName,
      contact_number: '+923217654321',
    })
    expect(await count('SELECT count(*) FROM customers')).toBe(0)
  })

  it('decorator: business name, bio and service city (defaults to city)', async () => {
    const a = await register(account('decorator'))
    const b = await register(account('decorator', { serviceCity: 'Islamabad' }))
    const rowA = await one('SELECT * FROM decorators WHERE user_id = $1', [a.body.user.id])
    const rowB = await one('SELECT * FROM decorators WHERE user_id = $1', [b.body.user.id])
    expect(rowA).toMatchObject({ city: 'Faisalabad', bio: 'Stage and floral decor for weddings.' })
    expect(rowB.city).toBe('Islamabad')
  })

  it.each(['admin', 'superuser', undefined, 42])(
    'REQ-1 role %j is rejected with 400 (admins only via create-admin)',
    async (role) => {
      const res = await register({ ...account('customer'), role })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.details).toContainEqual({ field: 'role', message: ROLE_MESSAGE })
      expect(await count('SELECT count(*) FROM users')).toBe(0)
    },
  )

  it('EUC-01 5.1 every invalid field comes back as an inline error and nothing is saved', async () => {
    const res = await register({ role: 'customer', name: 'A', email: 'nope', phone: '12345', password: 'short' })
    expect(res.status).toBe(400)
    expect(new Set(fields(res))).toEqual(new Set(['name', 'email', 'phone', 'password', 'city']))
    expect(res.body.error.details).toContainEqual({ field: 'phone', message: PHONE_MESSAGE })
    expect(res.body.error.details).toContainEqual({ field: 'city', message: 'Enter your city.' })
    expect(await count('SELECT count(*) FROM users')).toBe(0)
  })

  it('EUC-01 5.1 password needs letters and digits', async () => {
    const res = await register(account('customer', { password: 'onlyletters' }))
    expect(res.body.error.details).toEqual([{ field: 'password', message: 'Include at least one digit.' }])
  })

  it('role-specific fields are required for that role and rejected for others', async () => {
    const owner = account('venue_owner')
    delete owner.businessName
    expect(fields(await register(owner))).toEqual(['businessName'])

    const decorator = account('decorator', { bio: 'x'.repeat(501) })
    expect(fields(await register(decorator))).toEqual(['bio'])

    const customerWithBusiness = account('customer', { businessName: 'Nope' })
    expect(fields(await register(customerWithBusiness))).toEqual(['businessName'])
  })

  it('unknown keys are rejected (.strict())', async () => {
    const res = await register(account('customer', { isActive: false, isAdmin: true }))
    expect(res.status).toBe(400)
    expect(new Set(fields(res))).toEqual(new Set(['isActive', 'isAdmin']))
  })

  it('EUC-01 5.1 / REQ-1 duplicate email (any case) -> 409 EMAIL_TAKEN', async () => {
    await register(account('customer', { email: 'ali@example.pk' })).expect(201)
    const res = await register(account('venue_owner', { email: 'ALI@Example.pk' }))
    expect(res.status).toBe(409)
    expect(res.body.error).toEqual({
      code: 'EMAIL_TAKEN',
      message: EMAIL_TAKEN_MESSAGE,
      details: [{ field: 'email', message: EMAIL_TAKEN_MESSAGE }],
    })
  })

  it('REQ-1 duplicate mobile in a different format -> 409 PHONE_TAKEN', async () => {
    await register(account('customer', { phone: '0300-7654321' })).expect(201)
    const res = await register(account('customer', { phone: '+92 300 7654321' }))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('PHONE_TAKEN')
    expect(res.body.error.message).toBe(PHONE_TAKEN_MESSAGE)
  })

  it('both taken -> EMAIL_TAKEN with both fields in details', async () => {
    const first = account('customer')
    await register(first).expect(201)
    const res = await register(account('customer', { email: first.email, phone: first.phone }))
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
    expect(fields(res)).toEqual(['email', 'phone'])
  })

  it('two simultaneous registrations with the same email: exactly one 201, one 409', async () => {
    const email = 'race@example.pk'
    const results = await Promise.all([
      register(account('customer', { email })),
      register(account('decorator', { email })),
      register(account('venue_owner', { email })),
    ])
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 409, 409])
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.error.code).toBe('EMAIL_TAKEN')
    expect(await count('SELECT count(*) FROM users')).toBe(1)
    // the winner has exactly one role row, matching users.role
    const roleRows =
      (await count('SELECT count(*) FROM customers')) +
      (await count('SELECT count(*) FROM venue_owners')) +
      (await count('SELECT count(*) FROM decorators'))
    expect(roleRows).toBe(1)
  })

  it('Postgres unique violations (23505) map to EMAIL_TAKEN / PHONE_TAKEN', async () => {
    const insert = (email, phone) =>
      pool.query(
        `INSERT INTO users (name, email, phone, password_hash, role, city) VALUES ('X', $1, $2, 'h', 'customer', 'Lahore')`,
        [email, phone],
      )
    await insert('dupe@example.pk', '+923001111111')
    const emailErr = await insert('DUPE@example.pk', '+923002222222').catch((e) => e)
    const phoneErr = await insert('other@example.pk', '+923001111111').catch((e) => e)
    expect(mapUserUniqueViolation(emailErr)).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' })
    expect(mapUserUniqueViolation(phoneErr)).toMatchObject({ status: 409, code: 'PHONE_TAKEN' })
    const other = new Error('x')
    expect(mapUserUniqueViolation(other)).toBe(other)
  })

  it('stores the phone exactly as users_phone_pk_format requires', async () => {
    const body = account('customer')
    const res = await register(body)
    const { phone } = await one('SELECT phone FROM users WHERE user_id = $1', [res.body.user.id])
    expect(phone).toBe(normalized(body.phone))
  })
})
