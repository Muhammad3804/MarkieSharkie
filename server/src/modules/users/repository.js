// SQL only. `db` is the pool or a transaction client. snake_case rows -> camelCase objects here.

// Used by the authenticate middleware on every request (REQ-3: suspended / deleted users are blocked immediately).
export async function findAuthState(db, userId) {
  const { rows } = await db.query('SELECT user_id, role, is_active, deleted_at FROM users WHERE user_id = $1', [userId])
  const row = rows[0]
  if (!row) return null
  return { id: row.user_id, role: row.role, isActive: row.is_active, deletedAt: row.deleted_at }
}

// EUC-03 step 2: base fields + the role part. Never selects password_hash.
export async function findProfile(db, userId) {
  const { rows } = await db.query(
    `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.city, u.created_at,
            c.preferences,
            vo.business_name AS owner_business_name, vo.contact_number,
            d.business_name  AS decorator_business_name, d.bio, d.city AS service_city
       FROM users u
       LEFT JOIN customers    c  ON c.user_id  = u.user_id
       LEFT JOIN venue_owners vo ON vo.user_id = u.user_id
       LEFT JOIN decorators   d  ON d.user_id  = u.user_id
      WHERE u.user_id = $1 AND u.deleted_at IS NULL`,
    [userId],
  )
  const row = rows[0]
  if (!row) return null

  const profile = {
    id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    city: row.city,
    createdAt: row.created_at,
  }
  if (row.role === 'customer') profile.preferences = row.preferences ?? {}
  if (row.role === 'venue_owner') {
    profile.businessName = row.owner_business_name
    profile.contactNumber = row.contact_number
  }
  if (row.role === 'decorator') {
    profile.businessName = row.decorator_business_name
    profile.bio = row.bio
    profile.serviceCity = row.service_city
  }
  return profile
}

export async function isPhoneUsedByAnotherUser(db, { phone, userId }) {
  const { rows } = await db.query('SELECT 1 FROM users WHERE phone = $1 AND user_id <> $2', [phone, userId])
  return rows.length > 0
}

// Static SQL: a NULL parameter means "leave unchanged" (all these columns are NOT NULL, so NULL is never a real value).
export async function updateUserFields(db, userId, { name = null, phone = null, city = null }) {
  const { rowCount } = await db.query(
    `UPDATE users
        SET name  = coalesce($2, name),
            phone = coalesce($3, phone),
            city  = coalesce($4, city)
      WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId, name, phone, city],
  )
  return rowCount === 1
}

export async function updateCustomerPreferences(db, userId, preferences) {
  const { rowCount } = await db.query('UPDATE customers SET preferences = $2::jsonb WHERE user_id = $1', [
    userId,
    JSON.stringify(preferences),
  ])
  return rowCount === 1
}

export async function updateVenueOwner(db, userId, { businessName = null, contactNumber = null }) {
  const { rowCount } = await db.query(
    `UPDATE venue_owners
        SET business_name  = coalesce($2, business_name),
            contact_number = coalesce($3, contact_number)
      WHERE user_id = $1`,
    [userId, businessName, contactNumber],
  )
  return rowCount === 1
}

export async function updateDecorator(db, userId, { businessName = null, bio = null, serviceCity = null }) {
  const { rowCount } = await db.query(
    `UPDATE decorators
        SET business_name = coalesce($2, business_name),
            bio           = coalesce($3, bio),
            city          = coalesce($4, city)
      WHERE user_id = $1`,
    [userId, businessName, bio, serviceCity],
  )
  return rowCount === 1
}

// ---------------------------------------------------------------- EUC-03 step 2 "past searches" (customer)

export async function countSearches(db, customerId) {
  const { rows } = await db.query('SELECT count(*)::int AS total FROM search_history WHERE customer_id = $1', [
    customerId,
  ])
  return rows[0].total
}

export async function listSearches(db, customerId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT search_id, query_text, filters, results_count, searched_at
       FROM search_history
      WHERE customer_id = $1
      ORDER BY searched_at DESC, search_id DESC
      LIMIT $2 OFFSET $3`,
    [customerId, limit, offset],
  )
  return rows.map((row) => ({
    id: row.search_id,
    queryText: row.query_text,
    filters: row.filters,
    resultsCount: row.results_count,
    searchedAt: row.searched_at,
  }))
}

// ---------------------------------------------------------------- EUC-03 step 2 "bookings" (customer)

export async function countBookings(db, customerId) {
  const { rows } = await db.query('SELECT count(*)::int AS total FROM bookings WHERE customer_id = $1', [customerId])
  return rows[0].total
}

// Newest event date first. Money columns are numeric -> strings from pg (never JS floats).
export async function listBookings(db, customerId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT b.booking_id, b.status, b.source, b.event_type, b.guest_count,
            b.total_amount, b.advance_amount, b.created_at,
            v.venue_id, v.name AS venue_name, v.city AS venue_city,
            h.hall_id, h.name AS hall_name,
            s.slot_id, s.date AS event_date, s.start_time, s.end_time
       FROM bookings b
       JOIN venues     v ON v.venue_id = b.venue_id
       JOIN time_slots s ON s.slot_id  = b.slot_id
       LEFT JOIN halls h ON h.hall_id  = b.hall_id
      WHERE b.customer_id = $1
      ORDER BY s.date DESC, s.start_time DESC, b.created_at DESC, b.booking_id DESC
      LIMIT $2 OFFSET $3`,
    [customerId, limit, offset],
  )
  return rows.map((row) => ({
    id: row.booking_id,
    status: row.status,
    source: row.source,
    eventType: row.event_type,
    guestCount: row.guest_count,
    totalAmount: row.total_amount,
    advanceAmount: row.advance_amount,
    createdAt: row.created_at,
    venue: { id: row.venue_id, name: row.venue_name, city: row.venue_city },
    hall: row.hall_id ? { id: row.hall_id, name: row.hall_name } : null,
    slot: { id: row.slot_id, date: row.event_date, startTime: row.start_time, endTime: row.end_time },
  }))
}
