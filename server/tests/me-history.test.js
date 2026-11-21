import { beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { resetDb } from './helpers/db.js'
import { seedBooking, seedSearch, signedIn } from './helpers/factories.js'

beforeEach(resetDb)

const get = (s, path) => api().get(path).set('Authorization', bearer(s.accessToken))

describe('UC-04 / EUC-03 step 2: GET /api/me/searches (customer past searches, REQ-4)', () => {
  it('returns only my searches, newest first, paginated', async () => {
    const me = await signedIn(api(), 'customer')
    const other = await signedIn(api(), 'customer')
    await seedSearch({ customerId: me.user.id, queryText: 'oldest', searchedAt: '2026-10-01T10:00:00Z' })
    await seedSearch({ customerId: me.user.id, queryText: 'newest', searchedAt: '2026-11-20T10:00:00Z' })
    await seedSearch({ customerId: me.user.id, queryText: 'middle', searchedAt: '2026-11-01T10:00:00Z' })
    await seedSearch({ customerId: other.user.id, queryText: 'not mine', searchedAt: '2026-11-21T10:00:00Z' })

    const all = await get(me, '/api/me/searches')
    expect(all.status).toBe(200)
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, total: 3 })
    expect(all.body.data.map((s) => s.queryText)).toEqual(['newest', 'middle', 'oldest'])
    expect(all.body.data[0]).toEqual({
      id: expect.any(String),
      queryText: 'newest',
      filters: { city: 'Lahore', guests: 300 },
      resultsCount: 4,
      searchedAt: '2026-11-20T10:00:00.000Z',
    })

    const page2 = await get(me, '/api/me/searches?page=2&pageSize=2')
    expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 3 })
    expect(page2.body.data.map((s) => s.queryText)).toEqual(['oldest'])
  })

  it('empty history is an empty page, not an error', async () => {
    const me = await signedIn(api(), 'customer')
    expect((await get(me, '/api/me/searches')).body).toEqual({ data: [], page: 1, pageSize: 20, total: 0 })
  })
})

describe('UC-04 / EUC-03 step 2: GET /api/me/bookings (customer bookings, REQ-4)', () => {
  it('returns only my bookings with the venue name, newest event date first, money as strings', async () => {
    const me = await signedIn(api(), 'customer')
    const other = await signedIn(api(), 'customer')
    const owner = await signedIn(api(), 'venue_owner')
    await seedBooking({
      customerId: me.user.id,
      ownerId: owner.user.id,
      date: '2026-12-05',
      venueName: 'Earlier Marquee',
    })
    await seedBooking({
      customerId: me.user.id,
      ownerId: owner.user.id,
      date: '2027-01-15',
      venueName: 'Later Marquee',
      total: '387500.50',
      hall: 'Crystal Hall',
    })
    await seedBooking({ customerId: other.user.id, ownerId: owner.user.id, date: '2027-02-01', venueName: 'Not Mine' })

    const res = await get(me, '/api/me/bookings')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.data.map((b) => b.venue.name)).toEqual(['Later Marquee', 'Earlier Marquee'])

    const [later, earlier] = res.body.data
    expect(later).toMatchObject({
      status: 'requested',
      source: 'online',
      eventType: 'walima',
      guestCount: 300,
      totalAmount: '387500.50',
      advanceAmount: '50000.00',
      venue: { name: 'Later Marquee', city: 'Faisalabad' },
      hall: { name: 'Crystal Hall' },
      slot: { date: '2027-01-15', startTime: '19:00:00', endTime: '23:00:00' },
    })
    expect(typeof later.totalAmount).toBe('string')
    expect(earlier.hall).toBeNull()
  })

  it('paginates', async () => {
    const me = await signedIn(api(), 'customer')
    const owner = await signedIn(api(), 'venue_owner')
    for (const [i, date] of ['2026-12-01', '2026-12-02', '2026-12-03'].entries()) {
      await seedBooking({ customerId: me.user.id, ownerId: owner.user.id, date, venueName: `Venue ${i}` })
    }
    const res = await get(me, '/api/me/bookings?page=1&pageSize=2')
    expect(res.body).toMatchObject({ page: 1, pageSize: 2, total: 3 })
    expect(res.body.data.map((b) => b.slot.date)).toEqual(['2026-12-03', '2026-12-02'])
  })
})

describe('pagination query validation', () => {
  it.each([
    ['?page=0', 'page'],
    ['?page=abc', 'page'],
    ['?pageSize=101', 'pageSize'],
    ['?pageSize=2.5', 'pageSize'],
    ['?sort=newest', 'sort'],
  ])('%s -> 400 on %s', async (query, field) => {
    const me = await signedIn(api(), 'customer')
    for (const path of ['/api/me/searches', '/api/me/bookings']) {
      const res = await get(me, `${path}${query}`)
      expect(res.status).toBe(400)
      expect(res.body.error.details.map((d) => d.field)).toContain(field)
    }
  })
})
