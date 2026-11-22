// SQL only (docs/architecture.md "Layers"). Every function takes `db` (the pool or a transaction client) first and
// returns camelCase objects. Values always go through $n placeholders.

function toLoginUser(row) {
  if (!row) return null
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    city: row.city,
    passwordHash: row.password_hash,
    isActive: row.is_active,
    deletedAt: row.deleted_at,
    isLocked: row.is_locked,
    lockMinutesLeft: row.lock_minutes_left,
    lastLoginAt: row.last_login_at,
  }
}

function toPublicUser(row) {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    city: row.city,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------- registration (EUC-01)

export async function findEmailOrPhoneTaken(db, { email, phone }) {
  const { rows } = await db.query(
    `SELECT coalesce(bool_or(email = $1::citext), false) AS email_taken,
            coalesce(bool_or(phone = $2), false)         AS phone_taken
       FROM users
      WHERE email = $1::citext OR phone = $2`,
    [email, phone],
  )
  return { emailTaken: rows[0].email_taken, phoneTaken: rows[0].phone_taken }
}

export async function insertUser(db, { name, email, phone, passwordHash, role, city }) {
  const { rows } = await db.query(
    `INSERT INTO users (name, email, phone, password_hash, role, city)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING user_id, name, email, phone, role, city, created_at`,
    [name, email, phone, passwordHash, role, city],
  )
  return toPublicUser(rows[0])
}

// docs/database.md "Role tables": the role row shares users.user_id and is inserted in the same transaction.
export async function insertCustomer(db, { userId, preferences }) {
  await db.query('INSERT INTO customers (user_id, preferences) VALUES ($1, $2::jsonb)', [
    userId,
    JSON.stringify(preferences ?? {}),
  ])
}

export async function insertVenueOwner(db, { userId, businessName, contactNumber }) {
  await db.query('INSERT INTO venue_owners (user_id, business_name, contact_number) VALUES ($1, $2, $3)', [
    userId,
    businessName,
    contactNumber,
  ])
}

export async function insertDecorator(db, { userId, businessName, bio, city }) {
  await db.query('INSERT INTO decorators (user_id, business_name, bio, city) VALUES ($1, $2, $3, $4)', [
    userId,
    businessName,
    bio,
    city,
  ])
}

export async function insertAdmin(db, { userId }) {
  await db.query('INSERT INTO admins (user_id) VALUES ($1)', [userId])
}

// ---------------------------------------------------------------- login (EUC-02, REQ-2)

// Lock state is computed by the database clock so app/DB clock skew can't shorten or extend a lock.
export async function findLoginUserByEmail(db, email) {
  const { rows } = await db.query(
    `SELECT user_id, name, email, phone, role, city, password_hash, is_active, deleted_at, last_login_at,
            (locked_until IS NOT NULL AND locked_until > now()) AS is_locked,
            CASE WHEN locked_until > now()
                 THEN ceil(extract(epoch FROM locked_until - now()) / 60)::int ELSE 0 END AS lock_minutes_left
       FROM users
      WHERE email = $1::citext`,
    [email],
  )
  return toLoginUser(rows[0])
}

export async function findLoginUserByPhone(db, phone) {
  const { rows } = await db.query(
    `SELECT user_id, name, email, phone, role, city, password_hash, is_active, deleted_at, last_login_at,
            (locked_until IS NOT NULL AND locked_until > now()) AS is_locked,
            CASE WHEN locked_until > now()
                 THEN ceil(extract(epoch FROM locked_until - now()) / 60)::int ELSE 0 END AS lock_minutes_left
       FROM users
      WHERE phone = $1`,
    [phone],
  )
  return toLoginUser(rows[0])
}

// REQ-2 lockout in ONE atomic UPDATE (no read-modify-write race between parallel guesses):
//   - an expired lock resets the counter (this failure counts as the first),
//   - reaching maxAttempts sets locked_until = now() + lockMinutes.
// Inside UPDATE, column references on the right-hand side are the OLD values.
export async function recordFailedLogin(db, { userId, maxAttempts, lockMinutes }) {
  const { rows } = await db.query(
    `UPDATE users
        SET failed_login_attempts =
              CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
                   ELSE failed_login_attempts + 1 END,
            locked_until =
              CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
                              ELSE failed_login_attempts + 1 END) >= $2::int
                     THEN now() + make_interval(mins => $3::int)
                   WHEN locked_until IS NOT NULL AND locked_until <= now() THEN NULL
                   ELSE locked_until END
      WHERE user_id = $1
  RETURNING failed_login_attempts,
            (locked_until IS NOT NULL AND locked_until > now()) AS is_locked,
            CASE WHEN locked_until > now()
                 THEN ceil(extract(epoch FROM locked_until - now()) / 60)::int ELSE 0 END AS lock_minutes_left`,
    [userId, maxAttempts, lockMinutes],
  )
  const row = rows[0]
  return { failedAttempts: row.failed_login_attempts, isLocked: row.is_locked, lockMinutesLeft: row.lock_minutes_left }
}

export async function recordSuccessfulLogin(db, userId) {
  await db.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE user_id = $1`,
    [userId],
  )
}

// ---------------------------------------------------------------- refresh tokens (REQ-2 session, NFR-4)

// expiresAt given (rotation) keeps the session's original absolute expiry; otherwise now() + ttlDays (new login).
export async function insertRefreshToken(db, { userId, tokenHash, userAgent, expiresAt = null, ttlDays }) {
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, coalesce($3::timestamptz, now() + make_interval(days => $4::int)), $5)
     RETURNING token_id, expires_at`,
    [userId, tokenHash, expiresAt, ttlDays, userAgent],
  )
  return { id: rows[0].token_id, expiresAt: rows[0].expires_at }
}

// Locks the token row so two refreshes with the same token are serialised (the second sees it revoked).
export async function findRefreshTokenForUpdate(db, { tokenHash, inactivityMinutes }) {
  const { rows } = await db.query(
    `SELECT rt.token_id, rt.user_id, rt.expires_at, rt.revoked_at,
            rt.expires_at <= now()                                        AS is_expired,
            rt.last_used_at < now() - make_interval(mins => $2::int)      AS is_idle,
            u.name, u.email, u.phone, u.role, u.city, u.is_active, u.deleted_at
       FROM refresh_tokens rt
       JOIN users u ON u.user_id = rt.user_id
      WHERE rt.token_hash = $1
        FOR UPDATE OF rt`,
    [tokenHash, inactivityMinutes],
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: row.token_id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    isExpired: row.is_expired,
    isIdle: row.is_idle,
    user: {
      id: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      city: row.city,
      isActive: row.is_active,
      deletedAt: row.deleted_at,
    },
  }
}

export async function revokeRefreshToken(db, tokenId) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_id = $1 AND revoked_at IS NULL', [tokenId])
}

export async function revokeRefreshTokenByHash(db, tokenHash) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    tokenHash,
  ])
}

export async function revokeAllRefreshTokens(db, userId) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId])
}

// ---------------------------------------------------------------- password reset codes (REQ-2)

// A new code replaces every earlier unused one (used_at marks it spent).
export async function invalidateResetCodes(db, userId) {
  await db.query('UPDATE password_reset_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId])
}

export async function insertResetCode(db, { userId, codeHash, minutes }) {
  const { rows } = await db.query(
    `INSERT INTO password_reset_codes (user_id, code_hash, channel, expires_at)
     VALUES ($1, $2, 'email', now() + make_interval(mins => $3::int))
     RETURNING reset_id, expires_at`,
    [userId, codeHash, minutes],
  )
  return { id: rows[0].reset_id, expiresAt: rows[0].expires_at }
}

// Seconds since the newest code for this user was issued (null if none): the resend cooldown.
export async function secondsSinceLastResetCode(db, userId) {
  const { rows } = await db.query(
    `SELECT extract(epoch FROM now() - max(created_at))::float AS seconds FROM password_reset_codes WHERE user_id = $1`,
    [userId],
  )
  return rows[0].seconds === null ? null : Number(rows[0].seconds)
}

// The newest code, row-locked so parallel guesses are counted one after another. Expiry uses the DB clock.
export async function findLatestResetCodeForUpdate(db, userId) {
  const { rows } = await db.query(
    `SELECT reset_id, code_hash, attempts, used_at, (expires_at <= now()) AS is_expired
       FROM password_reset_codes
      WHERE user_id = $1
      ORDER BY created_at DESC, reset_id DESC
      LIMIT 1
        FOR UPDATE`,
    [userId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: row.reset_id,
    codeHash: row.code_hash,
    attempts: row.attempts,
    usedAt: row.used_at,
    isExpired: row.is_expired,
  }
}

// One wrong guess. Reaching maxAttempts also spends the code (used_at), so it can never be guessed again.
export async function recordWrongResetCode(db, { resetId, maxAttempts }) {
  const { rows } = await db.query(
    `UPDATE password_reset_codes
        SET attempts = attempts + 1,
            used_at = CASE WHEN attempts + 1 >= $2::int THEN now() ELSE used_at END
      WHERE reset_id = $1
  RETURNING attempts`,
    [resetId, maxAttempts],
  )
  return rows[0].attempts
}

export async function markResetCodeUsed(db, resetId) {
  await db.query('UPDATE password_reset_codes SET used_at = now() WHERE reset_id = $1', [resetId])
}

// New password; also clears the REQ-2 login lock, since the person just proved they own the email.
export async function updatePassword(db, { userId, passwordHash }) {
  await db.query(
    `UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`,
    [userId, passwordHash],
  )
}

export async function findUserRoleByEmail(db, email) {
  const { rows } = await db.query('SELECT user_id, role FROM users WHERE email = $1::citext', [email])
  return rows[0] ? { id: rows[0].user_id, role: rows[0].role } : null
}
