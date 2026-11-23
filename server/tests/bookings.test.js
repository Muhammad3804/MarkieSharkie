import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { submitListing, useTempStorage } from './helpers/venues.js'
import { setImageDetector } from '../src/integrations/imageDetection.js'
import { settleVerifications } from '../src/modules/venues/imageVerification.js'
import { runBookingJobs } from '../src/modules/bookings/service.js'
import { setBookingEmailSender, testOutbox } from '../src/integrations/mailer.js'

// The booking engine (EUC-14, 15, 16, 24, SYS-01; docs/booking-engine.md, srs-alignment #38).

let storage
beforeAll(() => {
  storage = useTempStorage()
})
afterAll(() => storage.cleanup())
beforeEach(async () => {
  await resetDb()
  testOutbox.length = 0
  setImageDetector(async () => ({ score: 0.05 }))
})
afterEach(async () => {
  setBookingEmailSender(null)
  await settleVerifications()
  setImageDetector(null)
})

const auth = (s) => ['Authorization', bearer(s.accessToken)]

// An approved venue from the standard submission: "Main hall" (400 seated) and "Lawn" (250), Silver (Rs 2,500, min
// 100) and Gold menus, a Rs 45,000 DJ add-on, 25% advance, custom policy (30+ days: 100%, 7-30 days: 50%).
async function liveVenue() {
  const agent = api()
  const owner = await signedIn(agent, 'venue_owner')
  const admin = await signedIn(agent, 'admin')
  const { id } = await submitListing(agent, owner.accessToken)
  await settleVerifications()
  expect(
    (
      await agent
        .post(`/api/admin/venues/${id}/approve`)
        .set(...auth(admin))
        .send({})
    ).status,
  ).toBe(204)
  const silver = await one(`SELECT menu_id FROM menu_packages WHERE venue_id = $1 AND name = 'Silver'`, [id])
  const dj = await one(`SELECT add_on_id FROM add_ons WHERE venue_id = $1`, [id])
  return { agent, owner, admin, venueId: id, menuId: silver.menu_id, addOnId: dj.add_on_id }
}

// The dinner slot of a hall `days` from today.
async function slotIn(venueId, days, hall = 'Main hall') {
  const row = await one(
    `SELECT t.slot_id FROM time_slots t JOIN halls h ON h.hall_id = t.hall_id
      WHERE t.venue_id = $1 AND h.name = $2 AND t.start_time = '19:00'
        AND t.date = (now() AT TIME ZONE 'Asia/Karachi')::date + $3::int`,
    [venueId, hall, days],
  )
  return row.slot_id
}

const bookingBody = (v, slotId, overrides = {}) => ({
  slotId,
  eventType: 'walima',
  guestCount: 150,
  menuPackageId: v.menuId,
  addOns: [{ addOnId: v.addOnId, quantity: 2 }],
  eventName: 'Ali & Sara’s Walima',
  hostName: 'Ali Khan',
  hostPhone: '0300-1234567',
  specialRequests: 'Stage on the left please',
  ...overrides,
})

async function book(v, customer, days = 45) {
  const slotId = await slotIn(v.venueId, days)
  expect(
    (
      await v.agent
        .post(`/api/slots/${slotId}/hold`)
        .set(...auth(customer))
        .send({})
    ).status,
  ).toBe(201)
  const res = await v.agent
    .post('/api/bookings')
    .set(...auth(customer))
    .send(bookingBody(v, slotId))
  expect(res.status).toBe(201)
  return { slotId, booking: res.body.booking }
}

describe('holds (REQ-18) and double booking (REQ-20, SYS-01)', () => {
  it('two customers racing for the same slot: exactly one gets it, the other gets 409 with alternatives', async () => {
    const v = await liveVenue()
    const [a, b] = [await signedIn(v.agent, 'customer'), await signedIn(v.agent, 'customer')]
    const slotId = await slotIn(v.venueId, 20)
    const results = await Promise.all(
      [a, b].map((c) =>
        api()
          .post(`/api/slots/${slotId}/hold`)
          .set(...auth(c))
          .send({}),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    const loser = results.find((r) => r.status === 409)
    expect(loser.body.error.code).toBe('SLOT_UNAVAILABLE')
    expect(loser.body.error.details.alternatives.dates.length).toBeGreaterThan(0)
    expect(loser.body.error.details.alternatives.halls.map((h) => h.name)).toContain('Lawn')
    // Racing to book: only the holder can, once.
    const winner = results[0].status === 201 ? a : b
    const other = winner === a ? b : a
    const posts = await Promise.all(
      [winner, winner, other].map((c) =>
        api()
          .post('/api/bookings')
          .set(...auth(c))
          .send(bookingBody(v, slotId)),
      ),
    )
    expect(posts.filter((r) => r.status === 201)).toHaveLength(1)
    expect(posts.filter((r) => r.status === 409)).toHaveLength(2)
    expect(await count(`SELECT count(*) FROM bookings WHERE slot_id = $1 AND status <> 'cancelled'`, [slotId])).toBe(1)
  })

  it('the database still refuses a second active booking for a slot (last line of defence)', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { slotId } = await book(v, c)
    await expect(
      pool.query(
        `INSERT INTO bookings (slot_id, customer_id, venue_id, event_type, guest_count) SELECT $1, $2, venue_id, 'mehndi', 100 FROM time_slots WHERE slot_id = $1`,
        [slotId, c.user.id],
      ),
    ).rejects.toThrow(/bookings_one_active_per_slot/)
  })

  it('an expired hold is free for others; the original holder can no longer book; the job releases it', async () => {
    const v = await liveVenue()
    const [a, b] = [await signedIn(v.agent, 'customer'), await signedIn(v.agent, 'customer')]
    const slotId = await slotIn(v.venueId, 21)
    const held = await v.agent
      .post(`/api/slots/${slotId}/hold`)
      .set(...auth(a))
      .send({})
    expect(Date.parse(held.body.hold.heldUntil) - Date.now()).toBeGreaterThan(9 * 60_000) // default 10 minutes
    // Others see it held; the holder sees heldByMe.
    const date = (await one('SELECT to_char(date, $2) AS d FROM time_slots WHERE slot_id = $1', [slotId, 'YYYY-MM-DD']))
      .d
    const seen = async (s) =>
      (
        await api()
          .get(`/api/venues/${v.venueId}/availability?from=${date}&to=${date}`)
          .set(...(s ? auth(s) : ['x-n', '1']))
      ).body.halls
        .flatMap((h) => h.slots)
        .find((x) => x.slotId === slotId)
    expect(await seen(b)).toMatchObject({ status: 'held' })
    expect((await seen(b)).heldByMe).toBeUndefined()
    expect(await seen(a)).toMatchObject({ status: 'held', heldByMe: true })

    await pool.query(`UPDATE time_slots SET held_until = now() - interval '1 second' WHERE slot_id = $1`, [slotId])
    expect(await seen(null)).toMatchObject({ status: 'available' })
    const late = await v.agent
      .post('/api/bookings')
      .set(...auth(a))
      .send(bookingBody(v, slotId))
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('HOLD_EXPIRED')
    expect(
      (
        await v.agent
          .post(`/api/slots/${slotId}/hold`)
          .set(...auth(b))
          .send({})
      ).status,
    ).toBe(201)

    await pool.query(`UPDATE time_slots SET held_until = now() - interval '1 second' WHERE slot_id = $1`, [slotId])
    const result = await runBookingJobs()
    expect(result.released).toBeGreaterThanOrEqual(1)
    expect((await one('SELECT status, held_by FROM time_slots WHERE slot_id = $1', [slotId])).status).toBe('available')
  })

  it('a new hold at the same venue gives the customer’s previous hold back', async () => {
    const v = await liveVenue()
    const a = await signedIn(v.agent, 'customer')
    const first = await slotIn(v.venueId, 22)
    const second = await slotIn(v.venueId, 23)
    await v.agent
      .post(`/api/slots/${first}/hold`)
      .set(...auth(a))
      .send({})
    await v.agent
      .post(`/api/slots/${second}/hold`)
      .set(...auth(a))
      .send({})
    expect((await one('SELECT status FROM time_slots WHERE slot_id = $1', [first])).status).toBe('available')
    expect((await one('SELECT status FROM time_slots WHERE slot_id = $1', [second])).status).toBe('held')
  })
})

describe('POST /api/bookings (EUC-14, EUC-24)', () => {
  it('stores the request with a price snapshot in paisa-exact amounts and books the slot', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { slotId, booking } = await book(v, c)
    // 150 guests × Rs 2,500 + 2 × Rs 45,000 = Rs 465,000; 25% advance = Rs 116,250.
    expect(booking).toMatchObject({
      status: 'requested',
      guestCount: 150,
      billableGuests: 150,
      menuPricePerHead: '2500.00',
      totalAmount: '465000.00',
      advancePercent: 25,
      advanceDue: '116250.00',
      hallName: 'Main hall',
      eventName: 'Ali & Sara’s Walima',
      hostPhone: '+923001234567',
      specialRequests: 'Stage on the left please',
      addOns: [expect.objectContaining({ name: 'DJ and sound', quantity: 2, unitPrice: '45000.00' })],
      policy: {
        policy: 'custom',
        tiers: [
          { fromDays: 30, toDays: null, percent: 100 },
          { fromDays: 7, toDays: 30, percent: 50 },
        ],
      },
    })
    expect(booking.events).toEqual([expect.objectContaining({ from: null, to: 'requested', by: 'customer' })])
    expect((await one('SELECT status FROM time_slots WHERE slot_id = $1', [slotId])).status).toBe('booked')
  })

  it('emails the customer a receipt once the request is in', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking } = await book(v, c)
    const mail = testOutbox.filter((m) => m.kind === 'booking_request')
    expect(mail).toHaveLength(1)
    expect(mail[0].to).toBe(c.body.email)
    expect(mail[0].subject).toMatch(/Booking request sent: Ali & Sara’s Walima \(MS-[0-9A-F]{6}\)/)
    expect(mail[0].text).toMatch(/Total: Rs\. 465,000/)
    expect(mail[0].text).toMatch(/Main hall/)
    expect(mail[0].reference).toBe(`MS-${booking.bookingId.replace(/-/g, '').slice(0, 6).toUpperCase()}`)
  })

  it('a mail failure never affects the booking', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    setBookingEmailSender(async () => {
      throw new Error('SMTP down')
    })
    const { booking } = await book(v, c)
    expect(booking.status).toBe('requested')
    expect(await count('SELECT count(*) FROM bookings WHERE booking_id = $1', [booking.bookingId])).toBe(1)
  })

  it('bills the menu minimum when fewer guests come', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const slotId = await slotIn(v.venueId, 46)
    await v.agent
      .post(`/api/slots/${slotId}/hold`)
      .set(...auth(c))
      .send({})
    const res = await v.agent
      .post('/api/bookings')
      .set(...auth(c))
      .send(bookingBody(v, slotId, { guestCount: 60, addOns: [] }))
    expect(res.body.booking).toMatchObject({ guestCount: 60, billableGuests: 100, totalAmount: '250000.00' })
  })

  it('refuses too many guests, too few, a missing menu and an add-on that isn’t offered', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const slotId = await slotIn(v.venueId, 47)
    await v.agent
      .post(`/api/slots/${slotId}/hold`)
      .set(...auth(c))
      .send({})
    const post = (o) =>
      v.agent
        .post('/api/bookings')
        .set(...auth(c))
        .send(bookingBody(v, slotId, o))
    expect((await post({ guestCount: 500 })).body.error.details[0]).toMatchObject({
      field: 'guestCount',
      message: expect.stringMatching(/holds up to 400/),
    })
    expect((await post({ guestCount: 10 })).body.error.details[0].message).toMatch(/start at 25/)
    expect((await post({ menuPackageId: null })).body.error.details[0]).toMatchObject({ field: 'menuPackageId' })
    await pool.query('UPDATE add_ons SET is_available = false WHERE add_on_id = $1', [v.addOnId])
    expect((await post({})).body.error.details[0].field).toBe('addOns.0')
    expect((await post({ hostPhone: '12345' })).status).toBe(400)
    expect(await count('SELECT count(*) FROM bookings WHERE customer_id = $1', [c.user.id])).toBe(0)
  })

  it('a later menu or add-on price edit never changes an existing booking (price snapshot)', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking } = await book(v, c)
    const menuEdit = {
      name: 'Silver',
      description: 'Starter, two mains, dessert.',
      pricePerHead: '9999',
      minGuests: '100',
      isCustomizable: false,
      sections: [{ name: 'Main course', items: [{ name: 'Chicken karahi' }] }],
    }
    expect(
      (
        await v.agent
          .put(`/api/owner/venues/${v.venueId}/menus/${v.menuId}`)
          .set(...auth(v.owner))
          .send(menuEdit)
      ).status,
    ).toBe(200)
    expect(
      (
        await v.agent
          .put(`/api/owner/venues/${v.venueId}/add-ons/${v.addOnId}`)
          .set(...auth(v.owner))
          .send({ type: 'sound_system', name: 'DJ', description: '', price: '99999' })
      ).status,
    ).toBe(200)
    const after = (await v.agent.get(`/api/bookings/${booking.bookingId}`).set(...auth(c))).body.booking
    expect(after).toMatchObject({
      totalAmount: '465000.00',
      menuPricePerHead: '2500.00',
      advanceDue: '116250.00',
      menuName: 'Silver',
    })
    expect(after.addOns[0]).toMatchObject({ unitPrice: '45000.00', quantity: 2 })
  })
})

describe('owner decisions and cancellation (EUC-15, EUC-16)', () => {
  it('owner confirms; the customer cancels later with the refund recorded from the snapshot', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking, slotId } = await book(v, c, 45)
    const inbox = await v.agent.get('/api/owner/bookings').set(...auth(v.owner))
    expect(inbox.body.counts).toMatchObject({ requested: 1 })
    expect(inbox.body.data[0].customer).toMatchObject({ phone: c.user.phone ?? expect.any(String) })
    const confirmed = await v.agent
      .post(`/api/owner/bookings/${booking.bookingId}/confirm`)
      .set(...auth(v.owner))
      .send({})
    expect(confirmed.body.booking.status).toBe('confirmed')

    // The owner changes the policy later: the booking keeps its own (45 days before: 100% of the advance).
    await pool.query(`UPDATE venues SET cancellation_policy = 'strict' WHERE venue_id = $1`, [v.venueId])
    expect(
      (
        await v.agent
          .post(`/api/bookings/${booking.bookingId}/cancel`)
          .set(...auth(c))
          .send({ reason: 'x' })
      ).status,
    ).toBe(400)
    const cancelled = await v.agent
      .post(`/api/bookings/${booking.bookingId}/cancel`)
      .set(...auth(c))
      .send({ reason: 'Family emergency' })
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.booking).toMatchObject({
      status: 'cancelled',
      closedAs: 'cancelled',
      refundPercent: 100,
      refundAmount: '116250.00',
    })
    expect((await one('SELECT status FROM time_slots WHERE slot_id = $1', [slotId])).status).toBe('available')
    const events = (await v.agent.get(`/api/bookings/${booking.bookingId}`).set(...auth(c))).body.booking.events
    expect(events.map((e) => `${e.from}->${e.to}:${e.by}`)).toEqual([
      'null->requested:customer',
      'requested->confirmed:venue_owner',
      'confirmed->cancelled:customer',
    ])
  })

  it('cancelling a request that was never confirmed records no refund; 10 days out is 50% of nothing', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking } = await book(v, c, 10)
    const res = await v.agent
      .post(`/api/bookings/${booking.bookingId}/cancel`)
      .set(...auth(c))
      .send({ reason: 'Changed our plans' })
    expect(res.body.booking).toMatchObject({ refundPercent: 50, refundAmount: '0.00' })
  })

  it('owner rejects with a required reason; the slot is free again', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking, slotId } = await book(v, c)
    expect(
      (
        await v.agent
          .post(`/api/owner/bookings/${booking.bookingId}/reject`)
          .set(...auth(v.owner))
          .send({})
      ).status,
    ).toBe(400)
    const res = await v.agent
      .post(`/api/owner/bookings/${booking.bookingId}/reject`)
      .set(...auth(v.owner))
      .send({ reason: 'Hall under renovation that week' })
    expect(res.body.booking).toMatchObject({
      status: 'cancelled',
      closedAs: 'rejected',
      cancellationReason: 'Rejected by the venue: Hall under renovation that week',
    })
    expect((await one('SELECT status FROM time_slots WHERE slot_id = $1', [slotId])).status).toBe('available')
  })

  it('illegal transitions are 409', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking } = await book(v, c)
    await v.agent
      .post(`/api/owner/bookings/${booking.bookingId}/reject`)
      .set(...auth(v.owner))
      .send({ reason: 'Not available sorry' })
    const confirm = await v.agent
      .post(`/api/owner/bookings/${booking.bookingId}/confirm`)
      .set(...auth(v.owner))
      .send({})
    expect(confirm.status).toBe(409)
    expect(confirm.body.error.code).toBe('INVALID_TRANSITION')
    expect(
      (
        await v.agent
          .post(`/api/bookings/${booking.bookingId}/cancel`)
          .set(...auth(c))
          .send({ reason: 'Too late now' })
      ).status,
    ).toBe(409)

    // Confirmed bookings can't be rejected; completed ones can't be cancelled.
    const second = await book(v, c, 50)
    await v.agent
      .post(`/api/owner/bookings/${second.booking.bookingId}/confirm`)
      .set(...auth(v.owner))
      .send({})
    expect(
      (
        await v.agent
          .post(`/api/owner/bookings/${second.booking.bookingId}/reject`)
          .set(...auth(v.owner))
          .send({ reason: 'Changed my mind' })
      ).status,
    ).toBe(409)
    await pool.query(`UPDATE time_slots SET date = current_date - 3 WHERE slot_id = $1`, [second.slotId])
    expect(
      (
        await v.agent
          .post(`/api/bookings/${second.booking.bookingId}/cancel`)
          .set(...auth(c))
          .send({ reason: 'After the event' })
      ).status,
    ).toBe(409)
    // The refused change rolled back; the next read settles it (the nightly job, run lazily).
    expect((await v.agent.get(`/api/bookings/${second.booking.bookingId}`).set(...auth(c))).body.booking.status).toBe(
      'completed',
    )
  })

  it('a request the venue never answered expires after the event date', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking, slotId } = await book(v, c, 30)
    await pool.query(`UPDATE time_slots SET date = current_date - 1 WHERE slot_id = $1`, [slotId])
    const list = await v.agent.get('/api/bookings').set(...auth(c))
    expect(list.body.data[0]).toMatchObject({ bookingId: booking.bookingId, status: 'cancelled', closedAs: 'expired' })
    expect(
      (
        await v.agent
          .post(`/api/owner/bookings/${booking.bookingId}/confirm`)
          .set(...auth(v.owner))
          .send({})
      ).status,
    ).toBe(409)
  })
})

describe('roles and ownership', () => {
  it('nobody can read or change another user’s booking', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const { booking } = await book(v, c)
    const stranger = await signedIn(v.agent, 'customer')
    const otherOwner = await signedIn(v.agent, 'venue_owner')
    const id = booking.bookingId
    expect((await v.agent.get(`/api/bookings/${id}`).set(...auth(stranger))).status).toBe(404)
    expect(
      (
        await v.agent
          .post(`/api/bookings/${id}/cancel`)
          .set(...auth(stranger))
          .send({ reason: 'Not mine at all' })
      ).status,
    ).toBe(404)
    expect((await v.agent.get(`/api/bookings/${id}`).set(...auth(otherOwner))).status).toBe(404)
    expect(
      (
        await v.agent
          .post(`/api/owner/bookings/${id}/confirm`)
          .set(...auth(otherOwner))
          .send({})
      ).status,
    ).toBe(404)
    expect((await v.agent.get('/api/owner/bookings').set(...auth(otherOwner))).body.data).toEqual([])
    expect((await v.agent.get('/api/bookings').set(...auth(stranger))).body.data).toEqual([])
    // Owners see their own venue's booking, with the customer's contact; customers can't use owner routes.
    expect((await v.agent.get(`/api/bookings/${id}`).set(...auth(v.owner))).body.booking.customer).toBeDefined()
    expect((await v.agent.get(`/api/bookings/${id}`).set(...auth(c))).body.booking.customer).toBeUndefined()
    expect((await v.agent.get('/api/owner/bookings').set(...auth(c))).status).toBe(403)
    expect(
      (
        await v.agent
          .post(`/api/slots/${booking.slotId}/hold`)
          .set(...auth(v.owner))
          .send({})
      ).status,
    ).toBe(403)
    expect((await api().post('/api/bookings').send({})).status).toBe(401)
    expect((await one('SELECT status FROM bookings WHERE booking_id = $1', [id])).status).toBe('requested')
  })

  it('a venue that isn’t live can’t be held', async () => {
    const v = await liveVenue()
    const c = await signedIn(v.agent, 'customer')
    const slotId = await slotIn(v.venueId, 25)
    await pool.query('UPDATE venues SET is_active = false WHERE venue_id = $1', [v.venueId])
    expect(
      (
        await v.agent
          .post(`/api/slots/${slotId}/hold`)
          .set(...auth(c))
          .send({})
      ).status,
    ).toBe(404)
  })
})
