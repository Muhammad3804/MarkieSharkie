// Admin user management SQL (REQ-47, EUC-33, srs-alignment #40). Raw pg, $n parameters only.

// status: active | suspended | deleted | all. q: name, email or phone (wildcards escaped by the caller).
export async function listUsers(db, { q, role, status, limit, offset }) {
  const { rows } = await db.query(
    `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.city, u.is_active, u.deleted_at, u.created_at,
            u.last_login_at, u.suspension_reason,
            (SELECT count(*) FROM bookings b WHERE b.customer_id = u.user_id AND b.status IN ('requested', 'held', 'confirmed'))::int AS active_bookings,
            (SELECT count(*) FROM venues v WHERE v.owner_id = u.user_id)::int AS venue_count,
            count(*) OVER ()::int AS total
       FROM users u
      WHERE ($1::text IS NULL OR u.name ILIKE '%' || $1 || '%' OR u.email::text ILIKE '%' || $1 || '%'
             OR u.phone ILIKE '%' || $1 || '%')
        AND ($2::role IS NULL OR u.role = $2::role)
        AND CASE $3::text
              WHEN 'active' THEN u.is_active AND u.deleted_at IS NULL
              WHEN 'suspended' THEN NOT u.is_active AND u.deleted_at IS NULL
              WHEN 'deleted' THEN u.deleted_at IS NOT NULL
              ELSE true
            END
      ORDER BY u.created_at DESC, u.user_id
      LIMIT $4 OFFSET $5`,
    [q ?? null, role ?? null, status, limit, offset],
  )
  return rows
}

export async function userCounts(db) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS "all",
            count(*) FILTER (WHERE deleted_at IS NULL AND role = 'customer')::int AS customer,
            count(*) FILTER (WHERE deleted_at IS NULL AND role = 'venue_owner')::int AS venue_owner,
            count(*) FILTER (WHERE deleted_at IS NULL AND role = 'decorator')::int AS decorator,
            count(*) FILTER (WHERE deleted_at IS NULL AND role = 'admin')::int AS admin,
            count(*) FILTER (WHERE deleted_at IS NULL AND NOT is_active)::int AS suspended,
            count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
       FROM users`,
  )
  return rows[0]
}

export async function findUser(db, userId) {
  const { rows } = await db.query(
    `SELECT u.user_id, u.name, u.email, u.phone, u.role, u.city, u.is_active, u.deleted_at, u.created_at,
            u.last_login_at, u.suspension_reason, u.suspended_at, u.failed_login_attempts, u.locked_until,
            vo.business_name AS owner_business_name, vo.contact_number,
            d.business_name AS decorator_business_name, d.bio, d.city AS decorator_city
       FROM users u
       LEFT JOIN venue_owners vo ON vo.user_id = u.user_id
       LEFT JOIN decorators d ON d.user_id = u.user_id
      WHERE u.user_id = $1`,
    [userId],
  )
  return rows[0] ?? null
}

export async function lockUser(db, userId) {
  const { rows } = await db.query(
    'SELECT user_id, role, is_active, deleted_at, name FROM users WHERE user_id = $1 FOR UPDATE',
    [userId],
  )
  return rows[0] ?? null
}

// Every active admin, locked: two admins can't each remove the other at the same time (the last-admin rule).
export async function lockActiveAdmins(db) {
  const { rows } = await db.query(
    `SELECT user_id FROM users WHERE role = 'admin' AND is_active AND deleted_at IS NULL ORDER BY user_id FOR UPDATE`,
  )
  return rows.map((r) => r.user_id)
}

// REQ-47 "warn if the user has active bookings": as the customer, and on the venues they own.
export async function activity(db, userId) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*) FROM bookings b WHERE b.customer_id = $1 AND b.status IN ('requested', 'held', 'confirmed'))::int AS active_bookings,
       (SELECT count(*) FROM bookings b WHERE b.customer_id = $1)::int AS all_bookings,
       (SELECT count(*) FROM venues v WHERE v.owner_id = $1)::int AS venue_count,
       (SELECT count(*) FROM venues v WHERE v.owner_id = $1 AND v.approval_status = 'approved' AND v.is_active)::int
         AS live_venues,
       (SELECT count(*) FROM bookings b JOIN venues v ON v.venue_id = b.venue_id
         WHERE v.owner_id = $1 AND b.status IN ('requested', 'held', 'confirmed'))::int AS active_venue_bookings`,
    [userId],
  )
  return rows[0]
}

export async function userHistory(db, userId, limit = 20) {
  const { rows } = await db.query(
    `SELECT l.action, l.details, l.created_at, a.name AS admin_name
       FROM admin_audit_log l JOIN users a ON a.user_id = l.admin_id
      WHERE l.target_table = 'users' AND l.target_id = $1
      ORDER BY l.created_at DESC LIMIT $2`,
    [userId, limit],
  )
  return rows
}

export async function setSuspended(db, { userId, suspended, reason = null }) {
  await db.query(
    `UPDATE users SET is_active = NOT $2, suspension_reason = CASE WHEN $2 THEN $3 END,
            suspended_at = CASE WHEN $2 THEN now() END
      WHERE user_id = $1`,
    [userId, suspended, reason],
  )
}

export async function setRole(db, { userId, role }) {
  await db.query('UPDATE users SET role = $2::role WHERE user_id = $1', [userId, role])
}

export async function ensureCustomer(db, userId) {
  await db.query(`INSERT INTO customers (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId])
}

export async function upsertVenueOwner(db, { userId, businessName, contactNumber }) {
  await db.query(
    `INSERT INTO venue_owners (user_id, business_name, contact_number) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET business_name = EXCLUDED.business_name, contact_number = EXCLUDED.contact_number`,
    [userId, businessName, contactNumber],
  )
}

export async function upsertDecorator(db, { userId, businessName, bio, city }) {
  await db.query(
    `INSERT INTO decorators (user_id, business_name, bio, city) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET business_name = EXCLUDED.business_name, bio = EXCLUDED.bio, city = EXCLUDED.city`,
    [userId, businessName, bio, city],
  )
}

// NFR-8 / REQ-47 "remove": the row stays (bookings, reviews and the audit log point at it) but every personal
// field is replaced, sign-in becomes impossible and role details are cleared.
export async function anonymise(db, userId) {
  await db.query(
    `UPDATE users
        SET name = 'Deleted user', email = 'deleted+' || user_id || '@deleted.invalid', phone = 'deleted:' || user_id,
            password_hash = '!deleted', is_active = false, deleted_at = now(), suspension_reason = NULL,
            suspended_at = NULL, failed_login_attempts = 0, locked_until = NULL
      WHERE user_id = $1`,
    [userId],
  )
  await db.query(`UPDATE customers SET preferences = '{}'::jsonb, preference_embedding = NULL WHERE user_id = $1`, [
    userId,
  ])
  await db.query(`UPDATE venue_owners SET contact_number = 'deleted' WHERE user_id = $1`, [userId])
  await db.query(`UPDATE decorators SET bio = '', business_name = 'Deleted decorator' WHERE user_id = $1`, [userId])
  await db.query(`DELETE FROM search_history WHERE customer_id = $1`, [userId])
  await db.query(`UPDATE password_reset_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId])
}

export async function revokeSessions(db, userId) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId])
}
