import { beforeEach, describe, expect, it } from 'vitest'
import { one, pool, resetDb } from './helpers/db.js'
import { api } from './helpers/app.js'
import { register } from './helpers/factories.js'

beforeEach(resetDb)

// Migration 002 (srs-alignment #19): slots belong to a hall; halls of one venue are booked independently, and the
// REQ-20 / NFR-2 double-booking guards still hold per hall.
async function venueWithHalls() {
  const { user: owner } = await register(api(), 'venue_owner')
  const venue = await one(
    `INSERT INTO venues (owner_id, name, address, city, venue_type, capacity, base_price)
     VALUES ($1, 'Per Hall Marquee', 'Canal Road', 'Faisalabad', 'indoor', 500, 3500.00) RETURNING venue_id`,
    [owner.id],
  )
  const halls = []
  for (const name of ['Hall A', 'Hall B']) {
    halls.push(
      (
        await one('INSERT INTO halls (venue_id, name, capacity) VALUES ($1, $2, 300) RETURNING hall_id', [
          venue.venue_id,
          name,
        ])
      ).hall_id,
    )
  }
  return { venueId: venue.venue_id, halls }
}

const slot = (venueId, hallId, start = '19:00', end = '23:00') =>
  pool.query(
    `INSERT INTO time_slots (venue_id, hall_id, date, start_time, end_time) VALUES ($1, $2, '2026-12-20', $3, $4) RETURNING slot_id`,
    [venueId, hallId, start, end],
  )

describe('per-hall time slots (srs-alignment #19)', () => {
  it('two halls of one venue can have overlapping slots', async () => {
    const { venueId, halls } = await venueWithHalls()
    await slot(venueId, halls[0])
    await expect(slot(venueId, halls[1])).resolves.toBeTruthy()
  })

  it('one hall can not have overlapping slots (time_slots_no_overlap)', async () => {
    const { venueId, halls } = await venueWithHalls()
    await slot(venueId, halls[0], '18:00', '22:00')
    await expect(slot(venueId, halls[0], '21:00', '23:30')).rejects.toMatchObject({
      constraint: 'time_slots_no_overlap',
    })
    await expect(slot(venueId, halls[0], '12:00', '16:00')).resolves.toBeTruthy()
  })

  it('a slot needs a hall, and the hall must belong to the same venue', async () => {
    const a = await venueWithHalls()
    const b = await venueWithHalls()
    await expect(slot(a.venueId, null)).rejects.toMatchObject({ code: '23502' })
    await expect(slot(a.venueId, b.halls[0])).rejects.toMatchObject({ constraint: 'time_slots_hall_same_venue' })
  })

  it('still allows only one active booking per slot (bookings_one_active_per_slot)', async () => {
    const { venueId, halls } = await venueWithHalls()
    const { rows } = await slot(venueId, halls[0])
    const book = () =>
      pool.query(
        `INSERT INTO bookings (slot_id, venue_id, event_type, guest_count, source, client_name, client_phone, status)
         VALUES ($1, $2, 'wedding', 200, 'offline', 'Walk-in', '+923001234567', 'confirmed')`,
        [rows[0].slot_id, venueId],
      )
    await book()
    await expect(book()).rejects.toMatchObject({ constraint: 'bookings_one_active_per_slot' })
  })
})
