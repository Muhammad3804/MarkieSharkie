import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { one, pool, resetDb } from './helpers/db.js'
import { register, signedIn } from './helpers/factories.js'
import { insertVenue, submission, uploadIds, useTempStorage } from './helpers/venues.js'
import { setImageDetector } from '../src/integrations/imageDetection.js'
import { settleVerifications } from '../src/modules/venues/imageVerification.js'

// EUC-30 / REQ-43 (srs-alignment #37): the only Google feature is the owner's Google Maps link. No Google API, no
// Google reviews or ratings. Validation, ownership, where it appears, the DB CHECK, and GET /venues/:id/reviews.

let storage
beforeAll(() => {
  storage = useTempStorage()
})
afterAll(() => storage.cleanup())
beforeEach(async () => {
  await resetDb()
  setImageDetector(async () => ({ score: 0.05 }))
})
afterEach(async () => {
  await settleVerifications()
  setImageDetector(null)
})

const auth = (s) => ['Authorization', bearer(s.accessToken)]

async function submitWith(googleMapsUrl) {
  const agent = api()
  const owner = await signedIn(agent, 'venue_owner')
  const body = submission(await uploadIds(agent, owner.accessToken, 5))
  body.venue.googleMapsUrl = googleMapsUrl
  const res = await agent
    .post('/api/owner/venues')
    .set(...auth(owner))
    .send(body)
  return { res, agent, owner }
}

const stored = async (id) => (await one('SELECT google_maps_url FROM venues WHERE venue_id = $1', [id])).google_maps_url

describe('googleMapsUrl validation (venue create and update)', () => {
  it.each([
    'https://www.google.com/maps/place/Royal+Palm/@31.45,73.13,17z',
    'https://maps.app.goo.gl/AbCdEf123',
    'https://goo.gl/maps/xyz',
    'https://g.page/royal-palm',
    'https://maps.google.com/?cid=123',
  ])('accepts %s', async (url) => {
    const { res } = await submitWith(`  ${url}  `)
    expect(res.status).toBe(201)
    expect(await stored(res.body.venue.id)).toBe(url) // trimmed
  })

  it.each([
    ['http://www.google.com/maps/place/x', 'http'],
    ['javascript:alert(1)', 'javascript'],
    ['data:text/html,<script>alert(1)</script>', 'data'],
    ['https://evil.example.com/maps', 'another host'],
    ['https://google.com.evil.io/maps', 'a look-alike host'],
    ['https://maps.google.com.pk/maps', 'a host not on the list'],
    ['https://user:pass@www.google.com/maps', 'credentials in the link'],
    ['not a url', 'not a URL'],
  ])('rejects %s (%s) with a clear 400', async (url) => {
    const { res } = await submitWith(url)
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'venue.googleMapsUrl', message: expect.stringMatching(/Google Maps link/) }),
      ]),
    )
  })

  it('rejects a link over 500 characters', async () => {
    const { res } = await submitWith(`https://www.google.com/maps/search/?q=${'a'.repeat(480)}`)
    expect(res.status).toBe(400)
    expect(res.body.error.details[0].field).toBe('venue.googleMapsUrl')
  })

  it('stores an empty string, null or a missing field as NULL', async () => {
    for (const value of ['', '   ', null, undefined]) {
      const { res } = await submitWith(value)
      expect(res.status).toBe(201)
      expect(await stored(res.body.venue.id)).toBeNull()
    }
  })
})

describe('setting it on a live venue (owner only)', () => {
  async function liveVenue() {
    const agent = api()
    const owner = await signedIn(agent, 'venue_owner')
    const admin = await signedIn(agent, 'admin')
    const body = submission(await uploadIds(agent, owner.accessToken, 5))
    const { body: created } = await agent
      .post('/api/owner/venues')
      .set(...auth(owner))
      .send(body)
    await settleVerifications()
    await agent
      .post(`/api/admin/venues/${created.venue.id}/approve`)
      .set(...auth(admin))
      .send({})
    const { listing } = (await agent.get(`/api/owner/venues/${created.venue.id}`).set(...auth(owner))).body
    // The live listing as an edit body (kept photos by id, nothing else changed).
    const edit = {
      ...body,
      venue: { ...body.venue, googleMapsUrl: 'https://maps.app.goo.gl/NewLink1' },
      halls: body.halls.map((h, i) => ({ ...h, hallId: listing.halls[i].hallId })),
      venueImages: listing.images.map((i) => ({
        imageId: i.imageId,
        hallId: i.hallId,
        category: i.category,
        isCover: i.isCover,
      })),
      menuPackages: body.menuPackages.map((m, i) => ({ ...m, menuId: listing.menuPackages[i].menuId })),
      addOns: body.addOns.map((a, i) => ({ ...a, addOnId: listing.addOns[i].addOnId })),
    }
    return { agent, owner, id: created.venue.id, edit }
  }

  it('goes live at once for the owner and appears in the venue detail and in search', async () => {
    const { agent, owner, id, edit } = await liveVenue()
    const res = await agent
      .put(`/api/owner/venues/${id}/edit`)
      .set(...auth(owner))
      .send(edit)
    expect(res.status).toBe(200)
    expect(res.body.applied).toContain('Google Maps link')
    expect(res.body.needsApproval).toEqual([])
    const detail = (await api().get(`/api/venues/${id}`)).body.venue
    expect(detail.googleMapsUrl).toBe('https://maps.app.goo.gl/NewLink1')
    const card = (await api().get('/api/venues?city=Faisalabad')).body.venues.find((v) => v.id === id)
    expect(card.googleMapsUrl).toBe('https://maps.app.goo.gl/NewLink1')
    const mine = (await agent.get(`/api/owner/venues/${id}`).set(...auth(owner))).body.listing
    expect(mine.venue.googleMapsUrl).toBe('https://maps.app.goo.gl/NewLink1')

    // A bad link on edit is a 400 and changes nothing.
    const bad = await agent
      .put(`/api/owner/venues/${id}/edit`)
      .set(...auth(owner))
      .send({ ...edit, venue: { ...edit.venue, googleMapsUrl: 'http://maps.app.goo.gl/x' } })
    expect(bad.status).toBe(400)
    expect(await stored(id)).toBe('https://maps.app.goo.gl/NewLink1')
  })

  it('customers get 403 and another owner gets 404 (ids can’t be probed); the link is unchanged', async () => {
    const { agent, id, edit } = await liveVenue()
    const customer = await signedIn(agent, 'customer')
    const other = await signedIn(agent, 'venue_owner')
    expect(
      (
        await agent
          .put(`/api/owner/venues/${id}/edit`)
          .set(...auth(customer))
          .send(edit)
      ).status,
    ).toBe(403)
    expect(
      (
        await agent
          .put(`/api/owner/venues/${id}/edit`)
          .set(...auth(other))
          .send(edit)
      ).status,
    ).toBe(404)
    expect(await stored(id)).toBeNull()
  })

  it('is null in the detail when the venue has no link', async () => {
    const { user } = await register(api(), 'venue_owner')
    const { id } = await insertVenue({ ownerId: user.id, name: 'No Link Hall' })
    expect((await api().get(`/api/venues/${id}`)).body.venue.googleMapsUrl).toBeNull()
  })
})

describe('database CHECK (migration 008)', () => {
  it('refuses a non-https or over-long link even without the API', async () => {
    const { user } = await register(api(), 'venue_owner')
    const { id } = await insertVenue({ ownerId: user.id, name: 'Direct SQL' })
    for (const url of ['http://www.google.com/maps', `https://www.google.com/${'a'.repeat(500)}`]) {
      await expect(pool.query('UPDATE venues SET google_maps_url = $2 WHERE venue_id = $1', [id, url])).rejects.toThrow(
        /venues_google_maps_url_check/,
      )
    }
  })
})

describe('GET /api/venues/:id/reviews (REQ-42, REQ-43)', () => {
  async function venueWithReviews() {
    const { user: owner } = await register(api(), 'venue_owner')
    const { id: venueId, hallId } = await insertVenue({ ownerId: owner.id, name: 'Reviewed Hall' })
    const ids = []
    for (const [n, rating] of [5, 4, 2].entries()) {
      const customer = await signedIn(api(), 'customer')
      const slot = await one(
        `INSERT INTO time_slots (venue_id, hall_id, date, start_time, end_time, status)
         VALUES ($1, $2, current_date - $3::int, '19:00', '23:00', 'booked') RETURNING slot_id`,
        [venueId, hallId, 10 + n],
      )
      const booking = await one(
        `INSERT INTO bookings (slot_id, customer_id, venue_id, hall_id, event_type, guest_count, status)
         VALUES ($1, $2, $3, $4, 'mehndi', 150, 'completed') RETURNING booking_id`,
        [slot.slot_id, customer.user.id, venueId, hallId],
      )
      const review = await one(
        `INSERT INTO reviews (customer_id, booking_id, venue_id, rating, comment, created_at)
         VALUES ($1, $2, $3, $4, $5, now() - make_interval(days => $6)) RETURNING review_id`,
        [customer.user.id, booking.booking_id, venueId, rating, `Review ${n}`, n],
      )
      ids.push(review.review_id)
    }
    await pool.query(
      `UPDATE venues SET avg_rating = (SELECT round(avg(rating)::numeric, 2) FROM reviews WHERE venue_id = $1) WHERE venue_id = $1`,
      [venueId],
    )
    return { venueId, ids }
  }

  it('returns platform reviews, newest first, with the platform rating and pages', async () => {
    const { venueId, ids } = await venueWithReviews()
    const res = await api().get(`/api/venues/${venueId}/reviews?pageSize=2`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ reviewCount: 3, rating: 3.67, page: 1, pageSize: 2, pageCount: 2 })
    expect(res.body.reviews.map((r) => r.reviewId)).toEqual([ids[0], ids[1]])
    expect(res.body.ratingCounts).toMatchObject({ 5: 1, 4: 1, 2: 1 })
    const page2 = await api().get(`/api/venues/${venueId}/reviews?page=2&pageSize=2`)
    expect(page2.body.reviews.map((r) => r.reviewId)).toEqual([ids[2]])
    // No Google data anywhere in the response.
    expect(JSON.stringify(res.body)).not.toMatch(/google/i)
  })

  it('leaves hidden reviews out of the list and the rating', async () => {
    const { venueId, ids } = await venueWithReviews()
    const admin = await signedIn(api(), 'admin')
    await api()
      .post(`/api/admin/reviews/${ids[2]}/hide`)
      .set(...auth(admin))
      .send({ reason: 'Breaks the rules' })
    const res = await api().get(`/api/venues/${venueId}/reviews`)
    expect(res.body.reviewCount).toBe(2)
    expect(res.body.rating).toBe(4.5)
    expect(res.body.reviews.map((r) => r.reviewId)).not.toContain(ids[2])
  })

  it('is 404 for a venue that isn’t public', async () => {
    const { venueId } = await venueWithReviews()
    await pool.query('UPDATE venues SET is_active = false WHERE venue_id = $1', [venueId])
    expect((await api().get(`/api/venues/${venueId}/reviews`)).status).toBe(404)
    expect((await api().get('/api/venues/not-a-uuid/reviews')).status).toBe(404)
  })
})
