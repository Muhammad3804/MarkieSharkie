import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer, testApp } from './helpers/app.js'
import { count, resetDb } from './helpers/db.js'
import { register, signedIn } from './helpers/factories.js'
import { insertVenue, useTempStorage } from './helpers/venues.js'

let storage
beforeAll(() => {
  storage = useTempStorage()
})
afterAll(() => storage.cleanup())
beforeEach(resetDb)

const day = (offset) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
  return new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10)
}

async function catalogue() {
  const { user: owner } = await register(api(), 'venue_owner')
  const ownerId = owner.id
  const v = {
    lahore: await insertVenue({
      ownerId,
      name: 'Lahore Grand',
      city: 'Lahore',
      capacity: 800,
      price: '4500.00',
      facilities: ['catering', 'valet'],
      rating: 4.9,
      slotDates: [day(3)],
      bookedDates: [day(3)],
    }),
    garden: await insertVenue({
      ownerId,
      name: 'Garden Lawn',
      city: 'Lahore',
      area: 'DHA',
      capacity: 400,
      price: '2500.00',
      venueType: 'outdoor',
      events: ['mehndi'],
      slotDates: [day(3)],
    }),
    fsd: await insertVenue({
      ownerId,
      name: 'Chenab Hall',
      city: 'Faisalabad',
      capacity: 600,
      price: '3000.00',
      facilities: ['catering'],
    }),
    pending: await insertVenue({ ownerId, name: 'Pending Place', status: 'pending' }),
    rejected: await insertVenue({ ownerId, name: 'Rejected Place', status: 'rejected' }),
    changes: await insertVenue({ ownerId, name: 'Changes Place', status: 'changes_requested' }),
    suspended: await insertVenue({ ownerId, name: 'Suspended Place', status: 'suspended' }),
    inactive: await insertVenue({ ownerId, name: 'Inactive Place', isActive: false }),
  }
  return v
}

const names = (res) => res.body.venues.map((v) => v.name).sort()

describe('public visibility (REQ-7): only approved and active venues', () => {
  it('search, landing, detail and stats never show pending, rejected, changes requested, suspended or inactive venues', async () => {
    const v = await catalogue()
    const search = await api().get('/api/venues')
    expect(search.status).toBe(200)
    expect(names(search)).toEqual(['Chenab Hall', 'Garden Lawn', 'Lahore Grand'])

    const landing = await api().get('/api/venues/landing')
    const shown = new Set(landing.body.sections.flatMap((s) => s.venues.map((x) => x.name)))
    expect([...shown].sort()).toEqual(['Chenab Hall', 'Garden Lawn', 'Lahore Grand'])

    for (const hidden of [v.pending, v.rejected, v.changes, v.suspended, v.inactive]) {
      const res = await api().get(`/api/venues/${hidden.id}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect((await api().get(`/api/venues/${hidden.id}/availability`)).status).toBe(404)
    }
    expect((await api().get('/api/stats')).body).toMatchObject({ venueCount: 3, cityCount: 2, hallCount: 3 })
  })

  it('an unknown id or an old slug is 404', async () => {
    expect((await api().get('/api/venues/qasar-e-noor')).status).toBe(404)
    expect((await api().get('/api/venues/6b1e4c52-a0d9-4f3e-8c7a-2f61d93b0e47')).status).toBe(404)
  })
})

describe('GET /api/venues search filters (REQ-12)', () => {
  it('filters by city, guests, event type, price, capacity bucket, setting, amenities, catering and rating', async () => {
    await catalogue()
    const get = (query) => api().get(`/api/venues?${query}`)
    expect(names(await get('city=faisal'))).toEqual(['Chenab Hall'])
    expect(names(await get('city=DHA'))).toEqual(['Garden Lawn']) // area matches too
    expect(names(await get('guests=500'))).toEqual(['Chenab Hall', 'Lahore Grand'])
    expect(names(await get('eventType=mehndi'))).toEqual(['Garden Lawn'])
    expect(names(await get('priceMin=2800&priceMax=4000'))).toEqual(['Chenab Hall'])
    expect(names(await get('priceMin=4000&priceMax=2800'))).toEqual(['Chenab Hall']) // reversed range
    expect(names(await get('capacity=750-plus'))).toEqual(['Lahore Grand'])
    expect(names(await get('capacity=up-to-500'))).toEqual(['Garden Lawn'])
    expect(names(await get('setting=outdoor,semi_outdoor'))).toEqual(['Garden Lawn'])
    expect(names(await get('amenities=valet'))).toEqual(['Lahore Grand'])
    expect(names(await get('catering=1'))).toEqual(['Chenab Hall', 'Lahore Grand'])
  })

  it('date keeps only venues with a free hall slot that day', async () => {
    await catalogue()
    const res = await api().get(`/api/venues?date=${day(3)}`)
    expect(names(res)).toEqual(['Garden Lawn']) // Lahore Grand's only slot is booked; Chenab has no slots
  })

  it('sorts by price and paginates (12 per page, a page past the end gives the last page)', async () => {
    await catalogue()
    const asc = await api().get('/api/venues?sort=price-asc')
    expect(asc.body.venues.map((v) => v.priceFrom)).toEqual(['2500.00', '3000.00', '4500.00'])
    const desc = await api().get('/api/venues?sort=price-desc')
    expect(desc.body.venues[0].name).toBe('Lahore Grand')
    const far = await api().get('/api/venues?page=9')
    expect(far.body).toMatchObject({
      page: 1,
      pageCount: 1,
      pageSize: 12,
      total: 3,
      priceRange: { min: 2500, max: 4500 },
    })
  })

  it('cards have the shape the client renders, with money as strings and absolute image urls', async () => {
    await catalogue()
    const card = (await api().get('/api/venues?city=Faisalabad')).body.venues[0]
    expect(card).toEqual({
      id: expect.any(String),
      name: 'Chenab Hall',
      area: 'Gulberg',
      city: 'Faisalabad',
      highlights: '600 Guests',
      availableDates: 'Fully booked for now',
      rating: 0,
      reviewCount: 0,
      priceFrom: '3000.00',
      priceUnit: 'per_person',
      image: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/uploads\/seed\/x\.webp$/),
      lat: 31.5,
      lng: 74.3,
      capacity: 600,
      venueType: 'indoor',
    })
  })

  it('rejects unknown filters and bad values with field errors', async () => {
    const res = await api().get('/api/venues?sort=cheapest&date=tomorrow&hack=1')
    expect(res.status).toBe(400)
    expect([...new Set(res.body.error.details.map((d) => d.field))].sort()).toEqual(['date', 'hack', 'sort'])
  })

  it('saves a logged-in customer’s search to their history (REQ-12), not an owner’s or a guest’s', async () => {
    await catalogue()
    const agent = api()
    const customer = await signedIn(agent, 'customer')
    await agent.get('/api/venues?city=Lahore&guests=300').set('Authorization', bearer(customer.accessToken))
    await api().get('/api/venues?city=Lahore')
    const owner = await signedIn(agent, 'venue_owner')
    await agent.get('/api/venues?city=Lahore').set('Authorization', bearer(owner.accessToken))
    await api().get('/api/venues?city=Lahore').set('Authorization', 'Bearer not.a.token')
    expect(await count('SELECT count(*) FROM search_history')).toBe(1)
    expect(
      await count(`SELECT count(*) FROM search_history WHERE customer_id = $1 AND results_count = 2`, [
        customer.user.id,
      ]),
    ).toBe(1)
  })
})

describe('GET /api/venues/:id and availability (REQ-13, srs-alignment #19)', () => {
  it('returns the venue page shape and slots grouped by hall', async () => {
    const v = await catalogue()
    const res = await api().get(`/api/venues/${v.lahore.id}`)
    expect(res.status).toBe(200)
    expect(res.body.venue).toMatchObject({
      id: v.lahore.id,
      name: 'Lahore Grand',
      approvalStatus: 'approved',
      halls: [{ hallId: v.lahore.hallId, capacity: 800, hallCharge: '0.00' }],
      bookedDates: [day(3)],
      facilities: ['catering', 'valet'],
      supportedEvents: ['wedding'], // a real array (enum arrays need a ::text[] cast in SQL)
      ratingCounts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    })
    expect(res.body.venue.gallery[0].sections.map((s) => s.key)).toEqual([
      'tour',
      'hall',
      'stage',
      'bridal',
      'bathroom',
      'parking',
      'entrance',
      'hallway',
    ])

    const slots = await api().get(`/api/venues/${v.lahore.id}/availability?from=${day(0)}&to=${day(10)}`)
    expect(slots.body.halls).toEqual([
      {
        hallId: v.lahore.hallId,
        slots: [expect.objectContaining({ date: day(3), slotType: 'dinner', status: 'booked' })],
      },
    ])
  })
})

describe('/uploads static files', () => {
  it('serves files with nosniff and cross-origin resource policy, and 404s for missing ones', async () => {
    const app = testApp()
    const fs = await import('node:fs')
    fs.mkdirSync(`${storage.dir}/seed`, { recursive: true })
    fs.writeFileSync(`${storage.dir}/seed/a.webp`, 'RIFF....WEBP')
    const res = await api(app).get('/uploads/seed/a.webp')
    expect(res.status).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect((await api(app).get('/uploads/seed/missing.webp')).status).toBe(404)
    expect((await api(app).get('/uploads/../package.json')).status).toBe(404)
  })
})
