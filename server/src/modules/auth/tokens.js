import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { JWT_AUDIENCE, JWT_ISSUER } from '../../config/constants.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// docs/api-and-security.md "Authentication": access token = JWT HS256, short-lived, payload { sub, role },
// sent as Authorization: Bearer. The client keeps it in memory only.
export function signAccessToken({ userId, role }) {
  return jwt.sign({ role }, env.auth.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: env.auth.accessTokenTtlMinutes * 60,
  })
}

// Algorithm pinned to HS256 (rejects alg:none and any other alg), iss + aud + exp checked. Throws on anything wrong.
export function verifyAccessToken(token) {
  const claims = jwt.verify(token, env.auth.jwtSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
  if (typeof claims !== 'object' || typeof claims.sub !== 'string' || !UUID.test(claims.sub)) {
    throw new Error('access token has no valid subject')
  }
  return claims
}

// Refresh token: 256 random bits, base64url. Only its SHA-256 hash is stored (refresh_tokens.token_hash), so a DB
// leak does not leak usable sessions. SHA-256 (not argon2) is right here: the input is random, not a password.
export const generateRefreshToken = () => crypto.randomBytes(32).toString('base64url')

export const hashRefreshToken = (token) => crypto.createHash('sha256').update(token, 'utf8').digest('hex')
