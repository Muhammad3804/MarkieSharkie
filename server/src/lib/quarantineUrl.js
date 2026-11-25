import crypto from 'node:crypto'
import { env } from '../config/env.js'

// srs-alignment #42: AI-rejected photos live under uploads/quarantine/, which /uploads refuses to serve. The owner of
// the photo and admins still need to see them, so their API responses carry a short-lived signed link instead:
//   /api/files/quarantine?key=<storage key>&exp=<unix seconds>&sig=<HMAC-SHA256>
// The HMAC key is derived from the JWT secret (never sent anywhere). Links expire after an hour.
const TTL_SECONDS = 60 * 60
const signingKey = () => crypto.createHmac('sha256', env.auth.jwtSecret).update('markie:quarantine-files:v1').digest()
const signature = (key, exp) => crypto.createHmac('sha256', signingKey()).update(`${key}\n${exp}`).digest('base64url')

export const isQuarantineKey = (key) => typeof key === 'string' && key.startsWith('quarantine/')

export function signedQuarantineUrl(origin, key, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SECONDS
  const query = new URLSearchParams({ key, exp: String(exp), sig: signature(key, exp) })
  return `${origin}/api/files/quarantine?${query}`
}

// -> true when the link is genuine and not expired.
export function verifyQuarantineLink({ key, exp, sig }, now = Date.now()) {
  if (!isQuarantineKey(key) || !/^\d{1,12}$/.test(String(exp)) || typeof sig !== 'string') return false
  if (Number(exp) * 1000 < now) return false
  const expected = Buffer.from(signature(key, Number(exp)))
  const given = Buffer.from(sig)
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}
