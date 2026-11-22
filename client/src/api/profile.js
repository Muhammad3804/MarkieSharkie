import { updateSessionUser } from './auth.js'
import { apiFetch } from './http.js'

// Profile API (EUC-03, REQ-4, server/openapi.yaml "Profile"):
//   GET   /api/me            -> { user } for every role
//   PATCH /api/me            -> { user }; customer, venue_owner and decorator only (an admin gets 403, srs-alignment #24)
//   GET   /api/me/searches   -> { data, page, pageSize, total } (customers)
//   GET   /api/me/bookings   -> { data, page, pageSize, total } (customers)
// Not on the server yet: changing the password while logged in (only the emailed-code reset exists).

export async function getProfile() {
  const { user } = await apiFetch('/me')
  return user
}

// `changes` holds only the fields that changed; the server rejects unknown keys and an empty body.
export async function updateProfile(changes) {
  const { user } = await apiFetch('/me', { method: 'PATCH', body: changes })
  updateSessionUser(user)
  return user
}

const pageQuery = ({ page = 1, pageSize = 10 } = {}) => `?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`

export function listMySearches(options) {
  return apiFetch(`/me/searches${pageQuery(options)}`)
}

export function listMyServerBookings(options) {
  return apiFetch(`/me/bookings${pageQuery(options)}`)
}
