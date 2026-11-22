import { env } from '../config/env.js'

// The API's public origin, for absolute file URLs (/uploads/...). PUBLIC_API_ORIGIN when set (behind a proxy or
// CDN), else the address the request came in on (TRUST_PROXY makes req.protocol right behind one proxy).
export function requestOrigin(req) {
  return env.publicApiOrigin ?? `${req.protocol}://${req.get('host')}`
}
