import { createAdmin } from '../../src/modules/auth/service.js'
import { one, pool } from './db.js'

let seq = 0
const next = () => ++seq

export const PASSWORD = 'Shadi2025'

// A valid registration body. Every call gets a unique email and mobile.
export function account(role = 'customer', overrides = {}) {
  const n = next()
  const base = {
    role,
    name: `Test User ${n}`,
    email: `user${n}@example.pk`,
    phone: `0300-${String(1000000 + n).slice(-7)}`,
    password: PASSWORD,
    city: 'Faisalabad',
  }
  if (role === 'venue_owner')
    Object.assign(base, { businessName: `Marquee ${n}`, contactNumber: `0321-${String(2000000 + n).slice(-7)}` })
  if (role === 'decorator')
    Object.assign(base, { businessName: `Decor ${n}`, bio: 'Stage and floral decor for weddings.' })
  return { ...base, ...overrides }
}

// Expected stored form of a 0300-1234567 style number.
export const normalized = (phone) => `+92${phone.replace(/[\s-]/g, '').slice(1)}`

export async function register(agent, role = 'customer', overrides = {}) {
  const body = account(role, overrides)
  const res = await agent.post('/api/auth/register').send(body)
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`)
  return { body, user: res.body.user }
}

export async function login(agent, identifier, password = PASSWORD) {
  return agent.post('/api/auth/login').send({ identifier, password })
}

// Registers (or creates an admin) and logs in. Returns the access token, refresh token and user.
export async function signedIn(agent, role = 'customer', overrides = {}) {
  let body
  if (role === 'admin') {
    const n = next()
    body = {
      name: `Admin ${n}`,
      email: `admin${n}@example.pk`,
      phone: `0333-${String(3000000 + n).slice(-7)}`,
      password: PASSWORD,
      city: 'Lahore',
      ...overrides,
    }
    await createAdmin({ ...body, phone: normalized(body.phone) })
  } else {
    ;({ body } = await register(agent, role, overrides))
  }
  const res = await login(agent, body.email, body.password)
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`)
  const setCookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('ms_refresh='))
  return {
    body,
    user: res.body.user,
    accessToken: res.body.accessToken,
    refreshToken: decodeURIComponent(setCookie.split(';')[0].slice('ms_refresh='.length)),
  }
}

export const userRow = (id) => one('SELECT * FROM users WHERE user_id = $1', [id])

// A venue (owned by a fresh venue owner), a slot and a booking for `customerId`. Used by GET /me/bookings tests.
export async function seedBooking({
  customerId,
  ownerId,
  date,
  venueName = 'Royal Palm Marquee',
  total = '250000.00',
  hall = null,
}) {
  const venue = await one(
    `INSERT INTO venues (owner_id, name, address, city, venue_type, capacity, base_price)
     VALUES ($1, $2, 'Canal Road', 'Faisalabad', 'indoor', 500, 3500.00) RETURNING venue_id`,
    [ownerId, venueName],
  )
  // Slots belong to a hall since migration 002 (srs-alignment #19). The booking's own hall_id stays NULL unless a
  // hall name is given, like a whole-venue booking.
  const h = await one('INSERT INTO halls (venue_id, name, capacity) VALUES ($1, $2, 300) RETURNING hall_id', [
    venue.venue_id,
    hall ?? 'Main hall',
  ])
  const hallId = hall ? h.hall_id : null
  const slot = await one(
    `INSERT INTO time_slots (venue_id, hall_id, date, start_time, end_time, status)
     VALUES ($1, $2, $3, '19:00', '23:00', 'booked') RETURNING slot_id`,
    [venue.venue_id, h.hall_id, date],
  )
  const booking = await one(
    `INSERT INTO bookings (slot_id, customer_id, venue_id, hall_id, event_type, guest_count, total_amount, advance_amount)
     VALUES ($1, $2, $3, $4, 'walima', 300, $5, '50000.00') RETURNING booking_id`,
    [slot.slot_id, customerId, venue.venue_id, hallId, total],
  )
  return { venueId: venue.venue_id, slotId: slot.slot_id, bookingId: booking.booking_id, hallId }
}

export async function seedSearch({ customerId, queryText, searchedAt }) {
  await pool.query(
    `INSERT INTO search_history (customer_id, query_text, filters, results_count, searched_at)
     VALUES ($1, $2, $3::jsonb, 4, $4)`,
    [customerId, queryText, JSON.stringify({ city: 'Lahore', guests: 300 }), searchedAt],
  )
}
