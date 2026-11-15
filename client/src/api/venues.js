import { getMockVenue, landingSections } from '../features/venues/mockVenues.js'

// Venues API. Backed by mock data until the server exists; replace the body with
// GET /api/venues/:id (404 -> null) and keep the same return shape.
export async function getVenueById(id) {
  return getMockVenue(id)
}

// Landing page rows ({ id, title, venues: card[] }[]). Replace the body with GET /api/venues/landing later.
export async function getLandingSections() {
  return landingSections
}
