import * as argon2 from 'argon2'
import { env } from '../../config/env.js'
import { HOME_PATHS } from '../../config/constants.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { AppError, accountSuspended } from '../../lib/AppError.js'
import { mapUserUniqueViolation, takenError } from '../../lib/pgErrors.js'
import * as repo from './repository.js'
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js'

// NFR-4 "hashed passwords": argon2id (docs/api-and-security.md "Authentication").
const HASH_OPTIONS = { type: argon2.argon2id }

export const hashPassword = (password) => argon2.hash(password, HASH_OPTIONS)

// Unknown users still pay for one argon2 verify against this hash, so response time doesn't reveal which
// emails / phones have accounts. Created lazily with the same parameters as real hashes.
let dummyHash = null
const getDummyHash = () => (dummyHash ??= argon2.hash('not-a-real-password-0', HASH_OPTIONS))

export const INVALID_CREDENTIALS_MESSAGE = 'Email/phone or password is incorrect. Try again.'

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)

const sessionExpired = () => new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Log in again.')

function accountLocked(minutes) {
  const unit = minutes === 1 ? 'minute' : 'minutes'
  return new AppError(
    423,
    'ACCOUNT_LOCKED',
    `Too many wrong attempts. Your account is locked for ${minutes} more ${unit}. Try again after that.`,
    { minutesRemaining: minutes },
  )
}

// ---------------------------------------------------------------- UC-01 Register Account (EUC-01, REQ-1)

async function insertRoleRow(client, userId, input) {
  switch (input.role) {
    case 'customer':
      return repo.insertCustomer(client, { userId, preferences: input.preferences })
    case 'venue_owner':
      return repo.insertVenueOwner(client, {
        userId,
        businessName: input.businessName,
        contactNumber: input.contactNumber,
      })
    case 'decorator':
      return repo.insertDecorator(client, {
        userId,
        businessName: input.businessName,
        bio: input.bio,
        city: input.serviceCity ?? input.city,
      })
    case 'admin':
      return repo.insertAdmin(client, { userId })
    default:
      throw new Error(`unknown role ${input.role}`)
  }
}

// users + the matching role row in ONE transaction (docs/database.md "Role tables"), so users.role always matches
// the role table. EUC-01 step 5: email AND phone must be unused (REQ-1); a concurrent duplicate is caught by the
// UNIQUE constraints and mapped to the same 409.
async function createAccount(input) {
  const taken = await repo.findEmailOrPhoneTaken(pool, { email: input.email, phone: input.phone })
  if (taken.emailTaken || taken.phoneTaken) throw takenError(taken)

  const passwordHash = await hashPassword(input.password) // EUC-01 step 6 "stores the password securely"

  try {
    return await withTransaction(async (client) => {
      const user = await repo.insertUser(client, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: input.role,
        city: input.city,
      })
      await insertRoleRow(client, user.id, input)
      return user
    })
  } catch (err) {
    throw mapUserUniqueViolation(err)
  }
}

// Public registration: the schema already limits role to customer / venue_owner / decorator.
// EUC-01 step 7: no tokens; the client goes to the login page.
export async function register(input) {
  const user = await createAccount(input)
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, next: '/login' }
}

// REQ-1 "admins are created only by an existing admin": the very first admin comes from `npm run create-admin`,
// which calls this. No HTTP route reaches it.
export async function createAdmin(input) {
  const user = await createAccount({ ...input, role: 'admin' })
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
}

// ---------------------------------------------------------------- sessions

function sessionUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, city: user.city }
}

async function issueSession(db, user, { userAgent, expiresAt = null }) {
  const refreshToken = generateRefreshToken()
  const stored = await repo.insertRefreshToken(db, {
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    userAgent,
    expiresAt,
    ttlDays: env.auth.refreshTokenTtlDays,
  })
  return {
    accessToken: signAccessToken({ userId: user.id, role: user.role }),
    refreshToken,
    refreshExpiresAt: stored.expiresAt,
    user: sessionUser(user),
    homePath: HOME_PATHS[user.role], // EUC-02 step 6
  }
}

// ---------------------------------------------------------------- UC-02 Log In (EUC-02 steps 1-6, REQ-2, REQ-3)

// Order: find user -> lock check (423) -> verify password -> suspended check (403).
// Suspension is checked only after the password verifies, so a stranger can't probe whether an account is suspended.
export async function login({ identifier, password }, { userAgent = null } = {}) {
  const user =
    identifier.type === 'email'
      ? await repo.findLoginUserByEmail(pool, identifier.value)
      : await repo.findLoginUserByPhone(pool, identifier.value)

  // Unknown or deleted (deleted_at set) -> same answer and roughly the same time as a wrong password (EUC-02 4.1).
  if (!user || user.deletedAt) {
    await argon2.verify(await getDummyHash(), password)
    throw invalidCredentials()
  }

  if (user.isLocked) throw accountLocked(user.lockMinutesLeft) // REQ-2: a correct password is refused while locked

  const passwordOk = await argon2.verify(user.passwordHash, password)
  if (!passwordOk) {
    const result = await repo.recordFailedLogin(pool, {
      userId: user.id,
      maxAttempts: env.auth.loginMaxAttempts,
      lockMinutes: env.auth.loginLockMinutes,
    })
    if (result.isLocked) throw accountLocked(result.lockMinutesLeft) // the attempt that reaches the limit gets 423
    throw invalidCredentials() // EUC-02 4.1: show an error and allow another attempt
  }

  if (!user.isActive) throw accountSuspended() // EUC-02 4.2: blocked by an admin

  // EUC-02 step 5: reset the counter and create the session in one transaction.
  return withTransaction(async (client) => {
    await repo.recordSuccessfulLogin(client, user.id)
    return issueSession(client, user, { userAgent })
  })
}

// ---------------------------------------------------------------- refresh (REQ-2 session + 30-min inactivity)

// Rotation: lock the row, revoke it, insert a new one (same absolute expiry). Rejections that must change state
// (reuse -> revoke everything) are COMMITTED first and thrown afterwards, so the revocation isn't rolled back.
export async function refresh(refreshToken, { userAgent = null } = {}) {
  if (!refreshToken) throw sessionExpired()

  const outcome = await withTransaction(async (client) => {
    const row = await repo.findRefreshTokenForUpdate(client, {
      tokenHash: hashRefreshToken(refreshToken),
      inactivityMinutes: env.auth.sessionInactivityMinutes,
    })
    if (!row) return { error: sessionExpired() }

    if (row.revokedAt) {
      // Reuse of a rotated / logged-out token: assume it was stolen and end every session of this user.
      await repo.revokeAllRefreshTokens(client, row.userId)
      return { error: sessionExpired() }
    }

    if (row.user.deletedAt) {
      await repo.revokeAllRefreshTokens(client, row.userId)
      return { error: sessionExpired() }
    }

    if (!row.user.isActive) {
      await repo.revokeAllRefreshTokens(client, row.userId)
      return { error: accountSuspended() }
    }

    if (row.isExpired || row.isIdle) {
      await repo.revokeRefreshToken(client, row.id)
      return { error: sessionExpired() }
    }

    await repo.revokeRefreshToken(client, row.id)
    return { session: await issueSession(client, row.user, { userAgent, expiresAt: row.expiresAt }) }
  })

  if (outcome.error) throw outcome.error
  return outcome.session
}

// ---------------------------------------------------------------- UC-03 Log Out (EUC-02 step 7)

// Idempotent: no cookie or an unknown / already revoked token is fine.
export async function logout(refreshToken) {
  if (!refreshToken) return
  await repo.revokeRefreshTokenByHash(pool, hashRefreshToken(refreshToken))
}
