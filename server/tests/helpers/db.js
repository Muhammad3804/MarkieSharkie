import { pool } from '../../src/db/pool.js'

export { pool }

// The tables these tests write to. CASCADE also clears anything referencing them, so no test leaks rows into the next.
export async function resetDb() {
  await pool.query(
    `TRUNCATE users, customers, venue_owners, decorators, admins, refresh_tokens, password_reset_codes,
              search_history, venues, halls, time_slots, bookings
     RESTART IDENTITY CASCADE`,
  )
}

export async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params)
  return rows[0] ?? null
}

export async function count(sql, params = []) {
  const { rows } = await pool.query(sql, params)
  return Number(rows[0].count)
}
