import { beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { count, one, resetDb } from './helpers/db.js'
import { register, signedIn } from './helpers/factories.js'
import { insertVenue } from './helpers/venues.js'

// REQ-44 / EUC-34 (srs-alignment #36): reporting reviews and the admin's hide / restore / keep / delete, with the
// venue's average rating recomputed from visible reviews only (REQ-42) and every decision audited (NFR-4).

beforeEach(resetDb)

const auth = (s) => ['Authorization', bearer(s.accessToken)]

// A public venue with a 5-star and a 1-star review from two customers (completed bookings, REQ-42).
async function reviewedVenue() {
  const { user: owner } = await register(api(), 'venue_owner')
  const { id: venueId, hallId } = await insertVenue({ ownerId: owner.id, name: 'Rated Marquee', rating: 3 })
  const agent = api()
  const happy = await signedIn(agent, 'customer')
  const angry = await signedIn(agent, 'customer')
  const reviews = {}
  for (const [key, who, rating, comment, day] of [
    ['good', happy, 5, 'Lovely staff and great food.', 40],
    ['bad', angry, 1, 'Call 0300-1234567 for a 100% better deal!!', 30],
  ]) {
    const slot = await one(
      `INSERT INTO time_slots (venue_id, hall_id, date, start_time, end_time, status)
       VALUES ($1, $2, current_date - $3::int, '19:00', '23:00', 'booked') RETURNING slot_id`,
      [venueId, hallId, day],
    )
    const booking = await one(
      `INSERT INTO bookings (slot_id, customer_id, venue_id, hall_id, event_type, guest_count, status)
       VALUES ($1, $2, $3, $4, 'walima', 200, 'completed') RETURNING booking_id`,
      [slot.slot_id, who.user.id, venueId, hallId],
    )
    reviews[key] = (
      await one(
        `INSERT INTO reviews (customer_id, booking_id, venue_id, rating, comment) VALUES ($1, $2, $3, $4, $5)
         RETURNING review_id`,
        [who.user.id, booking.booking_id, venueId, rating, comment],
      )
    ).review_id
  }
  return { agent, venueId, happy, angry, reviews }
}

const reportUrl = (venueId, reviewId) => `/api/venues/${venueId}/reviews/${reviewId}/report`
const publicVenue = async (id) => (await api().get(`/api/venues/${id}`)).body.venue
const rating = async (id) => Number((await one('SELECT avg_rating FROM venues WHERE venue_id = $1', [id])).avg_rating)

describe('POST /api/venues/:id/reviews/:reviewId/report (REQ-44)', () => {
  it('lets a logged-in user report a review once and flags it', async () => {
    const { agent, venueId, happy, reviews } = await reviewedVenue()
    expect((await api().post(reportUrl(venueId, reviews.bad)).send({ reason: 'spam' })).status).toBe(401)
    const res = await agent
      .post(reportUrl(venueId, reviews.bad))
      .set(...auth(happy))
      .send({ reason: 'spam' })
    expect(res.status).toBe(201)
    expect((await one('SELECT is_flagged FROM reviews WHERE review_id = $1', [reviews.bad])).is_flagged).toBe(true)
    const again = await agent
      .post(reportUrl(venueId, reviews.bad))
      .set(...auth(happy))
      .send({ reason: 'fake' })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_REPORTED')
    expect(await count('SELECT count(*) FROM review_reports')).toBe(1)
  })

  it('refuses your own review, admins, bad input and reviews that aren’t public', async () => {
    const { agent, venueId, happy, angry, reviews } = await reviewedVenue()
    expect(
      (
        await agent
          .post(reportUrl(venueId, reviews.bad))
          .set(...auth(angry))
          .send({ reason: 'spam' })
      ).status,
    ).toBe(403)
    const admin = await signedIn(agent, 'admin')
    expect(
      (
        await agent
          .post(reportUrl(venueId, reviews.bad))
          .set(...auth(admin))
          .send({ reason: 'spam' })
      ).status,
    ).toBe(403)
    const other = await agent
      .post(reportUrl(venueId, reviews.bad))
      .set(...auth(happy))
      .send({ reason: 'other' })
    expect(other.status).toBe(400)
    expect(other.body.error.details[0].field).toBe('note')
    expect(
      (
        await agent
          .post(reportUrl(venueId, reviews.bad))
          .set(...auth(happy))
          .send({ reason: 'rude' })
      ).status,
    ).toBe(400)
    // Wrong venue in the path, or the venue isn't public.
    const { user: owner2 } = await register(api(), 'venue_owner')
    const { id: otherVenue } = await insertVenue({ ownerId: owner2.id, name: 'Other' })
    expect(
      (
        await agent
          .post(reportUrl(otherVenue, reviews.bad))
          .set(...auth(happy))
          .send({ reason: 'spam' })
      ).status,
    ).toBe(404)
    await one(`UPDATE venues SET is_active = false WHERE venue_id = $1 RETURNING 1`, [venueId])
    expect(
      (
        await agent
          .post(reportUrl(venueId, reviews.bad))
          .set(...auth(happy))
          .send({ reason: 'spam' })
      ).status,
    ).toBe(404)
    expect(await count('SELECT count(*) FROM review_reports')).toBe(0)
  })
})

describe('admin moderation (EUC-34)', () => {
  async function reported() {
    const ctx = await reviewedVenue()
    await ctx.agent
      .post(reportUrl(ctx.venueId, ctx.reviews.bad))
      .set(...auth(ctx.happy))
      .send({ reason: 'personal_info', note: 'Phone number' })
    const admin = await signedIn(ctx.agent, 'admin')
    return { ...ctx, admin }
  }

  it('lists reported reviews with their reasons and counts', async () => {
    const { agent, admin, reviews } = await reported()
    const res = await agent.get('/api/admin/reviews').set(...auth(admin))
    expect(res.status).toBe(200)
    expect(res.body.rows).toHaveLength(1)
    expect(res.body.rows[0]).toMatchObject({
      id: reviews.bad,
      status: 'reported',
      openReports: 1,
      reports: [{ reason: 'personal_info', note: 'Phone number' }],
    })
    expect(res.body.counts).toEqual({ reported: 1, hidden: 0, all: 2 })
    // Search, with SQL wildcards taken literally.
    expect(
      (await agent.get('/api/admin/reviews?status=all&q=100%25').set(...auth(admin))).body.rows.map((r) => r.id),
    ).toEqual([reviews.bad])
    expect((await agent.get('/api/admin/reviews?status=all&q=%25').set(...auth(admin))).body.rows).toHaveLength(1)
    expect(
      (await agent.get('/api/admin/reviews?status=all&q=lovely').set(...auth(admin))).body.rows.map((r) => r.id),
    ).toEqual([reviews.good])
  })

  it('hide removes it from the public page and the rating; restore brings both back; both audited', async () => {
    const { agent, admin, venueId, reviews } = await reported()
    let pub = await publicVenue(venueId)
    expect(pub.reviewCount).toBe(2)
    expect(
      (
        await agent
          .post(`/api/admin/reviews/${reviews.bad}/hide`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(400)

    const hide = await agent
      .post(`/api/admin/reviews/${reviews.bad}/hide`)
      .set(...auth(admin))
      .send({ reason: 'Shares a phone number' })
    expect(hide.status).toBe(200)
    expect(hide.body.avgRating).toBe(5)
    pub = await publicVenue(venueId)
    expect(pub.reviews.map((r) => r.reviewId)).toEqual([reviews.good])
    expect(pub.reviewCount).toBe(1)
    expect(pub.rating).toBe(5)
    expect(await rating(venueId)).toBe(5)
    expect(await count('SELECT count(*) FROM review_reports WHERE resolved_at IS NULL')).toBe(0)
    const row = await one('SELECT removed_by, removal_reason, is_flagged FROM reviews WHERE review_id = $1', [
      reviews.bad,
    ])
    expect(row).toEqual({ removed_by: admin.user.id, removal_reason: 'Shares a phone number', is_flagged: false })
    expect(
      (
        await agent
          .post(`/api/admin/reviews/${reviews.bad}/hide`)
          .set(...auth(admin))
          .send({ reason: 'Again please' })
      ).status,
    ).toBe(409)
    expect((await agent.get('/api/admin/reviews?status=hidden').set(...auth(admin))).body.rows).toHaveLength(1)

    const restore = await agent
      .post(`/api/admin/reviews/${reviews.bad}/restore`)
      .set(...auth(admin))
      .send({ reason: 'Owner asked, number removed' })
    expect(restore.body.avgRating).toBe(3)
    expect((await publicVenue(venueId)).reviewCount).toBe(2)
    const audit = await one(`SELECT details FROM admin_audit_log WHERE action = 'review.hide'`)
    expect(audit.details).toMatchObject({ reason: 'Shares a phone number', from: 'reported', reportsResolved: 1 })
    expect(await count(`SELECT count(*) FROM admin_audit_log WHERE action = 'review.restore'`)).toBe(1)
  })

  it('dismiss keeps a reported review and closes its reports', async () => {
    const { agent, admin, venueId, reviews } = await reported()
    const res = await agent
      .post(`/api/admin/reviews/${reviews.bad}/dismiss`)
      .set(...auth(admin))
      .send({ reason: 'Not a real phone number' })
    expect(res.status).toBe(200)
    expect(await one('SELECT is_flagged, removed_at FROM reviews WHERE review_id = $1', [reviews.bad])).toEqual({
      is_flagged: false,
      removed_at: null,
    })
    expect((await publicVenue(venueId)).reviewCount).toBe(2)
    // Only reported reviews can be dismissed.
    expect(
      (
        await agent
          .post(`/api/admin/reviews/${reviews.good}/dismiss`)
          .set(...auth(admin))
          .send({ reason: 'Nothing to do' })
      ).status,
    ).toBe(409)
  })

  it('delete removes it for good, recomputes the rating and keeps its text in the audit log', async () => {
    const { agent, admin, venueId, reviews } = await reported()
    const res = await agent
      .delete(`/api/admin/reviews/${reviews.bad}`)
      .set(...auth(admin))
      .send({ reason: 'Spam with a phone number' })
    expect(res.status).toBe(200)
    expect(await count('SELECT count(*) FROM reviews WHERE review_id = $1', [reviews.bad])).toBe(0)
    expect(await count('SELECT count(*) FROM review_reports')).toBe(0)
    expect(await rating(venueId)).toBe(5)
    const audit = await one(`SELECT target_table, details FROM admin_audit_log WHERE action = 'review.delete'`)
    expect(audit.target_table).toBe('reviews')
    expect(audit.details).toMatchObject({ comment: 'Call 0300-1234567 for a 100% better deal!!', rating: 1 })
    expect(
      (
        await agent
          .delete(`/api/admin/reviews/${reviews.bad}`)
          .set(...auth(admin))
          .send({ reason: 'Already gone' })
      ).status,
    ).toBe(404)
  })

  it('a venue with every review hidden has a rating of 0', async () => {
    const { agent, admin, venueId, reviews } = await reported()
    for (const id of [reviews.good, reviews.bad])
      await agent
        .post(`/api/admin/reviews/${id}/hide`)
        .set(...auth(admin))
        .send({ reason: 'Testing the empty case' })
    expect(await rating(venueId)).toBe(0)
    expect((await publicVenue(venueId)).reviewCount).toBe(0)
  })

  it('admin routes are admin only', async () => {
    const { agent, happy, reviews } = await reported()
    const owner = await signedIn(agent, 'venue_owner')
    for (const s of [happy, owner]) {
      expect((await agent.get('/api/admin/reviews').set(...auth(s))).status).toBe(403)
      expect(
        (
          await agent
            .post(`/api/admin/reviews/${reviews.bad}/hide`)
            .set(...auth(s))
            .send({ reason: 'Not allowed' })
        ).status,
      ).toBe(403)
    }
    expect((await api().get('/api/admin/reviews')).status).toBe(401)
    expect((await one('SELECT removed_at FROM reviews WHERE review_id = $1', [reviews.bad])).removed_at).toBeNull()
  })
})
