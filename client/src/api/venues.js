import { toSearchParams } from '../features/explore/filters.js'
import { ApiError, apiFetch } from './http.js'

// Venues API (server/openapi.yaml "Venues"). The server returns only approved, active venues; suspended, pending
// and rejected ones are 404 here. Same function names and return shapes as the mock this replaced, so pages and
// components didn't change. The mock catalogue (features/venues/mockVenues.js) is only used by the seed now.

// GET /api/venues/:id -> the venue page shape, or null when it doesn't exist or isn't public.
export async function getVenueById(id) {
  try {
    const { venue } = await apiFetch(`/venues/${encodeURIComponent(id)}`)
    return venue
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

// GET /api/venues/landing -> landing rows ({ id, title, venues: card[] }[]).
export async function getLandingSections() {
  const { sections } = await apiFetch('/venues/landing')
  return sections
}

// GET /api/stats -> { venueCount, cityCount, hallCount, averageRating } for the About page.
export function getPlatformStats() {
  return apiFetch('/stats')
}

// GET /api/venues?<filters> (REQ-12) -> { venues, total, page, pageCount, pageSize, priceRange, sectionTitle }.
// Takes the Explore page's parsed filters (features/explore/filters.js). A logged-in customer's search is saved to
// their history on the server.
export function searchVenues(filters) {
  const params = toSearchParams(filters)
  const query = params.toString()
  return apiFetch(`/venues${query ? `?${query}` : ''}`)
}

// GET /api/venues/:id/availability?from&to -> { halls: [{ hallId, slots: [{ slotId, date, slotType, status }] }] }.
export function getVenueAvailability(id, { from, to } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const query = params.toString()
  return apiFetch(`/venues/${encodeURIComponent(id)}/availability${query ? `?${query}` : ''}`)
}
