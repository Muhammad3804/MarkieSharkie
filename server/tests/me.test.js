import { beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { one, resetDb } from './helpers/db.js'
import { normalized, signedIn, userRow } from './helpers/factories.js'
import { PHONE_TAKEN_MESSAGE } from '../src/lib/pgErrors.js'
import { PHONE_MESSAGE } from '../src/lib/validators.js'

beforeEach(resetDb)

const getMe = (s) => api().get('/api/me').set('Authorization', bearer(s.accessToken))
const patchMe = (s, body) => api().patch('/api/me').set('Authorization', bearer(s.accessToken)).send(body)
const BASE_KEYS = ['id', 'name', 'email', 'phone', 'role', 'city', 'createdAt']

describe('UC-04 / EUC-03 step 2: GET /api/me shows the current profile', () => {
  it('customer: base fields + preferences', async () => {
    const s = await signedIn(api(), 'customer')
    const res = await getMe(s)
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.user).sort()).toEqual([...BASE_KEYS, 'preferences'].sort())
    expect(res.body.user).toMatchObject({ ...s.user, preferences: {} })
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|isActive|failed/i)
  })

  it('venue_owner: businessName + contactNumber', async () => {
    const s = await signedIn(api(), 'venue_owner')
    const { user } = (await getMe(s)).body
    expect(Object.keys(user).sort()).toEqual([...BASE_KEYS, 'businessName', 'contactNumber'].sort())
    expect(user).toMatchObject({ businessName: s.body.businessName, contactNumber: normalized(s.body.contactNumber) })
  })

  it('decorator: businessName + bio + serviceCity', async () => {
    const s = await signedIn(api(), 'decorator', { serviceCity: 'Multan' })
    const { user } = (await getMe(s)).body
    expect(Object.keys(user).sort()).toEqual([...BASE_KEYS, 'bio', 'businessName', 'serviceCity'].sort())
    expect(user).toMatchObject({ businessName: s.body.businessName, bio: s.body.bio, serviceCity: 'Multan' })
  })

  it('admin: base fields only', async () => {
    const s = await signedIn(api(), 'admin')
    const { user } = (await getMe(s)).body
    expect(Object.keys(user).sort()).toEqual([...BASE_KEYS].sort())
    expect(user.role).toBe('admin')
  })
})

describe('UC-04 / EUC-03 steps 3-7: PATCH /api/me', () => {
  it('customer edits name, city and preferences; the updated profile comes back (step 7)', async () => {
    const s = await signedIn(api(), 'customer')
    const res = await patchMe(s, {
      name: '  Ayesha Khan ',
      city: 'Lahore',
      preferences: { preferredCity: 'Lahore', eventTypes: ['mehndi', 'walima'], guestCount: 450, budgetMax: '500000' },
    })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({
      id: s.user.id,
      name: 'Ayesha Khan',
      city: 'Lahore',
      preferences: {
        preferredCity: 'Lahore',
        eventTypes: ['mehndi', 'walima'],
        guestCount: 450,
        budgetMax: '500000.00',
      },
    })
    expect((await getMe(s)).body.user).toEqual(res.body.user) // step 6: stored
  })

  it('phone is validated and normalised like registration', async () => {
    const s = await signedIn(api(), 'customer')
    const res = await patchMe(s, { phone: '+92 345 1112223' })
    expect(res.status).toBe(200)
    expect(res.body.user.phone).toBe('+923451112223')

    const bad = await patchMe(s, { phone: '0300-12' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.details).toEqual([{ field: 'phone', message: PHONE_MESSAGE }])
  })

  it('REQ-1 a phone used by another account -> 409 PHONE_TAKEN; your own number is fine', async () => {
    const a = await signedIn(api(), 'customer')
    const b = await signedIn(api(), 'customer')
    const res = await patchMe(b, { phone: a.body.phone })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatchObject({ code: 'PHONE_TAKEN', message: PHONE_TAKEN_MESSAGE })
    expect((await patchMe(b, { phone: b.body.phone })).status).toBe(200)
  })

  it('two users racing for the same new phone: one wins, the other gets 409', async () => {
    const a = await signedIn(api(), 'customer')
    const b = await signedIn(api(), 'decorator')
    const results = await Promise.all([patchMe(a, { phone: '0311-5556667' }), patchMe(b, { phone: '0311-5556667' })])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it('venue_owner edits business name and contact number in one transaction', async () => {
    const s = await signedIn(api(), 'venue_owner')
    const res = await patchMe(s, { businessName: 'Shalimar Gardens', contactNumber: '0333-4445556', city: 'Lahore' })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({
      businessName: 'Shalimar Gardens',
      contactNumber: '+923334445556',
      city: 'Lahore',
    })
    const row = await one('SELECT * FROM venue_owners WHERE user_id = $1', [s.user.id])
    expect(row).toMatchObject({ business_name: 'Shalimar Gardens', contact_number: '+923334445556' })
  })

  it('decorator edits bio and service city (decorators.city), users.city unchanged', async () => {
    const s = await signedIn(api(), 'decorator')
    const res = await patchMe(s, { bio: 'Mehndi stages and lighting.', serviceCity: 'Sialkot' })
    expect(res.body.user).toMatchObject({
      bio: 'Mehndi stages and lighting.',
      serviceCity: 'Sialkot',
      city: 'Faisalabad',
    })
  })

  it.each([
    ['email', { email: 'new@example.pk' }],
    ['role', { role: 'admin' }],
    ['password', { password: 'NewPass123' }],
    ['isActive', { isActive: true }],
    ['id', { id: '00000000-0000-0000-0000-000000000000' }],
    ['unknown', { favouriteColour: 'maroon' }],
  ])('%s cannot be changed here -> 400, nothing saved', async (field, body) => {
    const s = await signedIn(api(), 'customer')
    const before = await userRow(s.user.id)
    const res = await patchMe(s, { name: 'Changed Name', ...body })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.map((d) => d.field)).toContain(Object.keys(body)[0])
    expect(await userRow(s.user.id)).toEqual(before)
  })

  it("fields of another role are rejected (a customer can't set businessName)", async () => {
    const s = await signedIn(api(), 'customer')
    const res = await patchMe(s, { businessName: 'Nope' })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual([{ field: 'businessName', message: "This field can't be set here." }])
  })

  it('at least one field is required', async () => {
    const s = await signedIn(api(), 'customer')
    const res = await patchMe(s, {})
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual([{ field: 'body', message: 'Change at least one field before saving.' }])
  })

  it('EUC-03 5.1 one invalid field means nothing is saved, and every bad field is reported', async () => {
    const s = await signedIn(api(), 'customer')
    const before = await one(
      'SELECT u.*, c.preferences FROM users u JOIN customers c USING (user_id) WHERE user_id = $1',
      [s.user.id],
    )
    const res = await patchMe(s, {
      name: 'Valid Name',
      city: 'X',
      preferences: { eventTypes: ['rave'], guestCount: 0, budgetMax: 'lots' },
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(
      ['city', 'preferences.budgetMax', 'preferences.eventTypes.0', 'preferences.guestCount'].sort(),
    )
    const after = await one(
      'SELECT u.*, c.preferences FROM users u JOIN customers c USING (user_id) WHERE user_id = $1',
      [s.user.id],
    )
    expect(after).toEqual(before)
  })

  it('only ever changes the logged-in user', async () => {
    const a = await signedIn(api(), 'customer')
    const b = await signedIn(api(), 'customer')
    const bBefore = await userRow(b.user.id)
    await patchMe(a, { name: 'Only A Changes' }).expect(200)
    expect(await userRow(b.user.id)).toEqual(bBefore)
  })

  it('requires authentication', async () => {
    const res = await api().patch('/api/me').send({ name: 'Nobody' })
    expect(res.status).toBe(401)
  })
})
