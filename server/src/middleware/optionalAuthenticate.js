import { asyncHandler } from '../lib/asyncHandler.js'
import { pool } from '../db/pool.js'
import { verifyAccessToken } from '../modules/auth/tokens.js'
import { findAuthState } from '../modules/users/repository.js'

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*)$/

// For public routes that do a little more for a logged-in user (REQ-12: a customer's search is saved to history).
// Sets req.user = { id, role } when a valid token of an active account is sent; otherwise leaves it unset. Never
// rejects the request: a missing, expired or forged token is the same as no token here.
export const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const match = BEARER.exec(req.get('authorization') ?? '')
  if (match) {
    try {
      const claims = verifyAccessToken(match[1])
      const user = await findAuthState(pool, claims.sub)
      if (user && !user.deletedAt && user.isActive) req.user = { id: user.id, role: user.role }
    } catch {
      // treat as anonymous
    }
  }
  next()
})
