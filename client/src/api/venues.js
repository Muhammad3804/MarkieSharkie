import { getAllMockVenues, getMockVenue, landingSections } from '../features/venues/mockVenues.js'
import { CAPACITY_OPTIONS, PAGE_SIZE } from '../features/explore/filters.js'
import { toPaisa } from '../lib/money.js'
import { getListingVenue, getPublicListingVenues, isVenueSuspended } from './listings.js'

// Venues API. Backed by the mock catalogue (mockVenues.js) plus host listings an admin approved (api/listings.js),
// until the server exists. Suspended venues (admin, REQ-47/48) and listings that aren't approved never show here;
// the server does the same with `approval_status = 'approved' AND is_active`.

// The full mock catalogue, suspended ones included (admin "All venues" reads this through api/admin.js).
export function listMockCatalog() {
  return getAllMockVenues()
}

const visibleMockVenues = () => getAllMockVenues().filter((venue) => !isVenueSuspended(venue.id))
async function allPublicVenues() {
  return [...visibleMockVenues(), ...(await getPublicListingVenues())]
}

// Replace the body with GET /api/venues/:id (404 -> null) and keep the same return shape.
export async function getVenueById(id) {
  if (isVenueSuspended(id)) return null
  return getMockVenue(id) ?? getListingVenue(id, { publicOnly: true })
}

// Landing page rows ({ id, title, venues: card[] }[]). Newly approved listings get their own first row.
// Replace the body with GET /api/venues/landing later.
export async function getLandingSections() {
  const fresh = await getPublicListingVenues()
  const rows = landingSections
    .map((section) => ({ ...section, venues: section.venues.filter((venue) => !isVenueSuspended(venue.id)) }))
    .filter((section) => section.venues.length > 0)
  return fresh.length ? [{ id: 'new', title: 'New on MarkieSharkie', venues: fresh.map(toResult) }, ...rows] : rows
}

// Headline numbers for the About page: { venueCount, cityCount, hallCount, averageRating } (rating to one
// decimal, null when nothing is rated). Replace the body with GET /api/stats later (approved venues only).
export async function getPlatformStats() {
  const all = await allPublicVenues()
  const rated = all.filter((venue) => venue.reviewCount > 0)
  const ratingTotal = rated.reduce((sum, venue) => sum + venue.rating, 0)
  return {
    venueCount: all.length,
    cityCount: new Set(all.map((venue) => venue.city)).size,
    hallCount: all.reduce((sum, venue) => sum + venue.halls.length, 0),
    averageRating: rated.length ? Math.round((ratingTotal / rated.length) * 10) / 10 : null,
  }
}

const lower = (text) => text.toLocaleLowerCase('en')
const sectionVenueIds = new Map(landingSections.map((s) => [s.id, new Set(s.venues.map((v) => v.id))]))

// Recommended: rating first, with a small boost for venues many customers have reviewed. (REQ-15 personalisation
// needs search history and embeddings on the server; this is the "no history -> popular venues" fallback.)
const recommendedScore = (venue) => venue.rating + Math.log10(venue.reviewCount + 1) / 4

const SORTERS = {
  recommended: (a, b) => recommendedScore(b) - recommendedScore(a),
  'price-asc': (a, b) => toPaisa(a.priceFrom) - toPaisa(b.priceFrom),
  'price-desc': (a, b) => toPaisa(b.priceFrom) - toPaisa(a.priceFrom),
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  capacity: (a, b) => b.capacity - a.capacity,
}

// What a search result card needs (VenueCard fields plus map and filter fields).
function toResult(venue) {
  const { id, name, area, city, highlights, availableDates, rating, reviewCount, priceFrom, priceUnit, image, lat, lng, capacity, venueType } = venue
  return { id, name, area, city, highlights, availableDates, rating, reviewCount, priceFrom, priceUnit, image, lat, lng, capacity, venueType }
}

// Venue search (REQ-12) for the Explore page. Takes parsed filters (features/explore/filters.js) and returns
// { venues, total, page, pageCount, pageSize, priceRange: { min, max } (rupees, all venues), sectionTitle }.
// Replace the body with GET /api/venues?<toSearchParams(filters)> later; the server does the same filtering in SQL.
export async function searchVenues(filters) {
  const fresh = await getPublicListingVenues()
  const all = [...visibleMockVenues(), ...fresh]
  const city = lower(filters.city)
  const capacity = CAPACITY_OPTIONS.find((c) => c.value === filters.capacity) ?? CAPACITY_OPTIONS[0]
  const minPaisa = filters.priceMin === null ? null : filters.priceMin * 100
  const maxPaisa = filters.priceMax === null ? null : filters.priceMax * 100
  const minRating = filters.rating ? Number(filters.rating) : 0
  const inSection = filters.section === 'new' ? new Set(fresh.map((venue) => venue.id)) : filters.section ? sectionVenueIds.get(filters.section) : null

  const matches = all.filter((venue) => {
    const price = toPaisa(venue.priceFrom)
    return (
      (!city || lower(venue.city).includes(city) || lower(venue.area).includes(city) || lower(venue.name).includes(city)) &&
      // REQ-12: only venues free on that date.
      (!filters.date || !venue.bookedDates.includes(filters.date)) &&
      (!filters.guests || venue.capacity >= filters.guests) &&
      (!filters.eventType || venue.supportedEvents.includes(filters.eventType)) &&
      (minPaisa === null || price >= minPaisa) &&
      (maxPaisa === null || price <= maxPaisa) &&
      venue.capacity >= capacity.min &&
      venue.capacity <= capacity.max &&
      venue.rating >= minRating &&
      (filters.settings.length === 0 || filters.settings.includes(venue.venueType)) &&
      filters.amenities.every((key) => venue.facilities.includes(key)) &&
      (!filters.catering || venue.facilities.includes('catering')) &&
      (!inSection || inSection.has(venue.id))
    )
  })

  matches.sort(SORTERS[filters.sort] ?? SORTERS.recommended)
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const page = Math.min(filters.page, pageCount)
  const prices = all.map((venue) => toPaisa(venue.priceFrom))

  return {
    venues: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toResult),
    total: matches.length,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
    priceRange: { min: Math.floor(Math.min(...prices) / 100), max: Math.ceil(Math.max(...prices) / 100) },
    sectionTitle: filters.section === 'new' ? 'New on MarkieSharkie' : (landingSections.find((s) => s.id === filters.section)?.title ?? ''),
  }
}
