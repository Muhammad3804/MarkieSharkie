import { beforeEach, describe, expect, it } from 'vitest'
import { api, bearer, cookie } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { login, signedIn, userRow } from './helpers/factories.js'
import { bookingFor, liveVenue } from './helpers/bookings.js'
import * as usersService from '../src/modules/admin/usersService.js'

// REQ-47 / EUC-33 (srs-alignment #40): admin user management. Search and filters, suspend (signed out everywhere,
// login refused, an owner's venues hidden, bookings kept), reactivate, role change with its live-work rules,
// delete = anonymise, the self / last-admin safeguards, RBAC and the audit log (NFR-4).

beforeEach(resetDb)

const auth = (s) => ['Authorization', bearer(s.accessToken)]
const REASON = { reason: 'Repeated fake booking requests.' }
const auditRows = (targetId) =>
  pool
    .query(`SELECT action, details FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [targetId])
    .then((r) => r.rows)

describe('GET /api/admin/users', () => {
  it('lists users with search, role and status filters and counts', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const cust = await signedIn(agent, 'customer', { name: 'Zainab Rafiq' })
    await signedIn(agent, 'venue_owner')
    await pool.query('UPDATE users SET is_active = false WHERE user_id = $1', [cust.user.id])

    const all = await agent.get('/api/admin/users').set(...auth(admin))
    expect(all.status).toBe(200)
    expect(all.body.total).toBe(3)
    expect(all.body.counts).toMatchObject({ all: 3, customer: 1, venue_owner: 1, admin: 1, suspended: 1 })
    expect(all.body.rows[0]).not.toHaveProperty('passwordHash')

    const search = await agent.get('/api/admin/users?q=zainab').set(...auth(admin))
    expect(search.body.rows.map((r) => r.id)).toEqual([cust.user.id])
    expect(search.body.rows[0].status).toBe('suspended')

    const owners = await agent.get('/api/admin/users?role=venue_owner').set(...auth(admin))
    expect(owners.body.rows.map((r) => r.role)).toEqual(['venue_owner'])

    const suspended = await agent.get('/api/admin/users?status=suspended').set(...auth(admin))
    expect(suspended.body.rows.map((r) => r.id)).toEqual([cust.user.id])

    // LIKE wildcards are literal, not "match everything".
    expect((await agent.get('/api/admin/users?q=%25').set(...auth(admin))).body.total).toBe(0)
    expect((await agent.get('/api/admin/users?role=root').set(...auth(admin))).status).toBe(400)
  })

  it('is admin only: 401 signed out, 403 for every other role', async () => {
    const agent = api()
    expect((await agent.get('/api/admin/users')).status).toBe(401)
    for (const role of ['customer', 'venue_owner', 'decorator']) {
      const s = await signedIn(agent, role)
      expect((await agent.get('/api/admin/users').set(...auth(s))).status).toBe(403)
      expect(
        (
          await agent
            .post(`/api/admin/users/${s.user.id}/suspend`)
            .set(...auth(s))
            .send(REASON)
        ).status,
      ).toBe(403)
    }
  })

  it('shows one user with activity and their audit history; 404 for an unknown id', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const cust = await signedIn(agent, 'customer')
    const res = await agent.get(`/api/admin/users/${cust.user.id}`).set(...auth(admin))
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: cust.user.id, role: 'customer', status: 'active' })
    expect(res.body.user.activity).toMatchObject({ activeBookings: 0, venueCount: 0 })
    expect((await agent.get('/api/admin/users/00000000-0000-4000-8000-000000000000').set(...auth(admin))).status).toBe(
      404,
    )
  })
})

describe('suspend and reactivate', () => {
  it('suspends: login refused, old refresh token fails, access token stops working, audited', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const cust = await signedIn(agent, 'customer')

    expect(
      (
        await agent
          .post(`/api/admin/users/${cust.user.id}/suspend`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(400) // reason required
    const res = await agent
      .post(`/api/admin/users/${cust.user.id}/suspend`)
      .set(...auth(admin))
      .send(REASON)
    expect(res.status).toBe(200)

    const row = await userRow(cust.user.id)
    expect(row.is_active).toBe(false)
    expect(row.suspension_reason).toBe(REASON.reason)
    expect(
      await count('SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [cust.user.id]),
    ).toBe(0)

    const again = await login(agent, cust.body.email)
    expect(again.status).toBe(403)
    expect(again.body.error.code).toBe('ACCOUNT_SUSPENDED')
    const refreshed = await agent.post('/api/auth/refresh').set('Cookie', cookie(cust.refreshToken)).send({})
    expect(refreshed.status).toBe(401)
    expect((await agent.get('/api/me').set(...auth(cust))).body.error.code).toBe('ACCOUNT_SUSPENDED')

    const dup = await agent
      .post(`/api/admin/users/${cust.user.id}/suspend`)
      .set(...auth(admin))
      .send(REASON)
    expect(dup.status).toBe(409)

    const back = await agent
      .post(`/api/admin/users/${cust.user.id}/reactivate`)
      .set(...auth(admin))
      .send({ reason: 'Explained on the phone.' })
    expect(back.status).toBe(200)
    expect((await login(agent, cust.body.email)).status).toBe(200)
    expect((await userRow(cust.user.id)).suspension_reason).toBeNull()

    expect((await auditRows(cust.user.id)).map((r) => r.action)).toEqual(['user.suspend', 'user.reactivate'])
    expect((await auditRows(cust.user.id))[0].details).toMatchObject({ reason: REASON.reason, role: 'customer' })
  })

  it('hides a suspended owner’s venue from search, its page, availability and reviews; bookings stay', async () => {
    const v = await liveVenue()
    const cust = await signedIn(v.agent, 'customer')
    const { bookingId } = await bookingFor(v, cust)
    const ownerId = v.owner.user.id

    const detail = await v.agent.get(`/api/admin/users/${ownerId}`).set(...auth(v.admin))
    expect(detail.body.user.activity).toMatchObject({ venueCount: 1, liveVenues: 1, activeVenueBookings: 1 })

    expect((await v.agent.get('/api/venues')).body.venues.map((c) => c.id)).toContain(v.venueId)
    await v.agent
      .post(`/api/admin/users/${ownerId}/suspend`)
      .set(...auth(v.admin))
      .send(REASON)

    expect((await v.agent.get('/api/venues')).body.venues.map((c) => c.id)).not.toContain(v.venueId)
    expect((await v.agent.get(`/api/venues/${v.venueId}`)).status).toBe(404)
    expect((await v.agent.get(`/api/venues/${v.venueId}/availability`)).status).toBe(404)
    expect((await v.agent.get(`/api/venues/${v.venueId}/reviews`)).status).toBe(404)

    // The customer's confirmed booking is untouched and still visible to them.
    expect((await one('SELECT status FROM bookings WHERE booking_id = $1', [bookingId])).status).toBe('confirmed')
    expect((await v.agent.get(`/api/bookings/${bookingId}`).set(...auth(cust))).status).toBe(200)
    expect((await auditRows(ownerId))[0].details).toMatchObject({ activeBookings: 0, liveVenues: 1 })

    await v.agent
      .post(`/api/admin/users/${ownerId}/reactivate`)
      .set(...auth(v.admin))
      .send(REASON)
    expect((await v.agent.get(`/api/venues/${v.venueId}`)).status).toBe(200)
  })
})

describe('role change', () => {
  it('moves a customer to venue owner (business name required), revokes sessions, applies at once', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const cust = await signedIn(agent, 'customer')
    const url = `/api/admin/users/${cust.user.id}/role`

    const missing = await agent
      .post(url)
      .set(...auth(admin))
      .send({ role: 'venue_owner', ...REASON })
    expect(missing.status).toBe(400)
    expect(missing.body.error.details.map((d) => d.field)).toContain('businessName')

    const res = await agent
      .post(url)
      .set(...auth(admin))
      .send({ role: 'venue_owner', businessName: 'Noor Marquee', ...REASON })
    expect(res.status).toBe(200)
    expect((await userRow(cust.user.id)).role).toBe('venue_owner')
    const vo = await one('SELECT business_name, contact_number FROM venue_owners WHERE user_id = $1', [cust.user.id])
    expect(vo.business_name).toBe('Noor Marquee')
    expect(vo.contact_number).toBe((await userRow(cust.user.id)).phone) // defaults to their mobile
    expect(
      await count('SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [cust.user.id]),
    ).toBe(0)
    // Role is read from the DB per request, so the old customer token now acts as an owner.
    expect((await agent.get('/api/bookings').set(...auth(cust))).status).toBe(403)

    expect(
      (
        await agent
          .post(url)
          .set(...auth(admin))
          .send({ role: 'venue_owner', businessName: 'Noor Marquee', ...REASON })
      ).status,
    ).toBe(409)
    expect((await auditRows(cust.user.id))[0].details).toMatchObject({ from: 'customer', to: 'venue_owner' })
  })

  it('refuses HAS_VENUES for an owner with venues and HAS_ACTIVE_BOOKINGS for a customer with bookings', async () => {
    const v = await liveVenue()
    const cust = await signedIn(v.agent, 'customer')
    await bookingFor(v, cust, { confirm: false })

    const owner = await v.agent
      .post(`/api/admin/users/${v.owner.user.id}/role`)
      .set(...auth(v.admin))
      .send({ role: 'customer', ...REASON })
    expect(owner.status).toBe(409)
    expect(owner.body.error.code).toBe('HAS_VENUES')

    const customer = await v.agent
      .post(`/api/admin/users/${cust.user.id}/role`)
      .set(...auth(v.admin))
      .send({ role: 'decorator', businessName: 'Gul Decor', bio: 'Floral stages.', ...REASON })
    expect(customer.status).toBe(409)
    expect(customer.body.error.code).toBe('HAS_ACTIVE_BOOKINGS')
    expect(await auditRows(cust.user.id)).toEqual([])
  })

  it('cannot make anyone an admin through the API (REQ-1)', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const cust = await signedIn(agent, 'customer')
    const res = await agent
      .post(`/api/admin/users/${cust.user.id}/role`)
      .set(...auth(admin))
      .send({ role: 'admin', ...REASON })
    expect(res.status).toBe(400)
  })
})

describe('delete (anonymise)', () => {
  it('replaces personal data, blocks sign-in, keeps bookings and the audit log', async () => {
    const v = await liveVenue()
    const cust = await signedIn(v.agent, 'customer')
    const { bookingId } = await bookingFor(v, cust)

    const res = await v.agent
      .delete(`/api/admin/users/${cust.user.id}`)
      .set(...auth(v.admin))
      .send(REASON)
    expect(res.status).toBe(200)

    const row = await userRow(cust.user.id)
    expect(row).toMatchObject({ name: 'Deleted user', is_active: false })
    expect(row.deleted_at).not.toBeNull()
    expect(row.email).not.toBe(cust.body.email)
    expect(row.phone).toMatch(/^deleted:/)
    expect((await login(v.agent, cust.body.email)).status).toBe(401)
    expect((await v.agent.post('/api/auth/refresh').set('Cookie', cookie(cust.refreshToken)).send({})).status).toBe(401)
    expect(await one('SELECT booking_id FROM bookings WHERE booking_id = $1', [bookingId])).not.toBeNull()

    const [entry] = await auditRows(cust.user.id)
    expect(entry.action).toBe('user.delete')
    expect(entry.details).toMatchObject({ reason: REASON.reason, activeBookings: 1, name: cust.body.name })

    const list = await v.agent.get('/api/admin/users?status=deleted').set(...auth(v.admin))
    expect(list.body.rows.map((r) => r.id)).toEqual([cust.user.id])
    const again = await v.agent
      .post(`/api/admin/users/${cust.user.id}/suspend`)
      .set(...auth(v.admin))
      .send(REASON)
    expect(again.status).toBe(409)
    // The email and mobile are free to register again.
    expect((await v.agent.post('/api/auth/register').send({ ...cust.body, role: 'customer' })).status).toBe(201)
  })
})

describe('safeguards', () => {
  it('no admin acts on their own account', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    await signedIn(agent, 'admin')
    for (const [method, path, body] of [
      ['post', 'suspend', REASON],
      ['post', 'role', { role: 'customer', ...REASON }],
      ['delete', '', REASON],
    ]) {
      const res = await agent[method](`/api/admin/users/${admin.user.id}${path ? `/${path}` : ''}`)
        .set(...auth(admin))
        .send(body)
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('SELF_ACTION')
    }
  })

  it('two admins removing each other at once: the second is refused LAST_ADMIN', async () => {
    const agent = api()
    const a = await signedIn(agent, 'admin')
    const b = await signedIn(agent, 'admin')
    // a and b fire "suspend the other" together. Both pass authentication; whichever commits first wins.
    const results = await Promise.allSettled([
      usersService.suspendUser(a.user.id, b.user.id, REASON),
      usersService.suspendUser(b.user.id, a.user.id, REASON),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refused = results.find((r) => r.status === 'rejected')
    expect(refused.reason.code).toBe('LAST_ADMIN')
    expect(await count(`SELECT count(*) FROM users WHERE role = 'admin' AND is_active`)).toBe(1)

    // Same for demote and delete when the target is the only active admin left.
    const [last] = (await pool.query(`SELECT user_id FROM users WHERE role = 'admin' AND is_active`)).rows
    const other = last.user_id === a.user.id ? b : a
    await expect(
      usersService.changeRole(other.user.id, last.user_id, { role: 'customer', ...REASON }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' })
    await expect(usersService.deleteUser(other.user.id, last.user_id, REASON)).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    })
  })
})
