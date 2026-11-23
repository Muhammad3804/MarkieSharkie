import { expect } from 'vitest'
import { api, bearer } from './app.js'
import { one } from './db.js'
import { signedIn } from './factories.js'
import { submitListing } from './venues.js'
import { settleVerifications } from '../../src/modules/venues/imageVerification.js'

const auth = (s) => ['Authorization', bearer(s.accessToken)]

// An approved venue from the standard submission (helpers/venues.js) with its 60 days of slots.
export async function liveVenue() {
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
  return { agent, owner, admin, venueId: id, menuId: silver.menu_id }
}

// The dinner slot of the main hall `days` from today.
export async function slotIn(venueId, days, hall = 'Main hall') {
  const row = await one(
    `SELECT t.slot_id FROM time_slots t JOIN halls h ON h.hall_id = t.hall_id
      WHERE t.venue_id = $1 AND h.name = $2 AND t.start_time = '19:00'
        AND t.date = (now() AT TIME ZONE 'Asia/Karachi')::date + $3::int`,
    [venueId, hall, days],
  )
  return row.slot_id
}

// A customer's booking, confirmed by the owner unless { confirm: false }.
export async function bookingFor(v, customer, { days = 40, confirm = true } = {}) {
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
    .send({
      slotId,
      eventType: 'walima',
      guestCount: 150,
      menuPackageId: v.menuId,
      addOns: [],
      eventName: 'Sara & Ali’s Walima',
      hostName: 'Sara Khan',
      hostPhone: '0300-1112223',
    })
  expect(res.status).toBe(201)
  const id = res.body.booking.bookingId
  if (confirm) {
    expect(
      (
        await v.agent
          .post(`/api/owner/bookings/${id}/confirm`)
          .set(...auth(v.owner))
          .send({})
      ).status,
    ).toBe(200)
  }
  return { bookingId: id, slotId }
}
