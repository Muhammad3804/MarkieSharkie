import { accountSuspended, unauthenticated } from '../lib/AppError.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { pool } from '../db/pool.js'
import { verifyAccessToken } from '../modules/auth/tokens.js'
import { findAuthState } from '../modules/users/repository.js'

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/

// REQ-3 / SYS-04 / NFR-4. Verifies the access token (HS256 only, iss + aud checked), then loads the user on EVERY
// request so a suspension or deletion takes effect immediately, not when the 15-minute token expires.
// req.user = { id, role } with the role read from the database, never from the request body or params.
export const authenticate = asyncHandler(async (req, _res, next) => {
  const match = BEARER.exec(req.get('authorization') ?? '')
  if (!match) throw unauthenticated()

  let claims
  try {
    claims = verifyAccessToken(match[1])
  } catch {
    throw unauthenticated()
  }

  const user = await findAuthState(pool, claims.sub)
  if (!user || user.deletedAt) throw unauthenticated()
  if (!user.isActive) throw accountSuspended() // EUC-02 4.2

  req.user = { id: user.id, role: user.role }
  next()
})
