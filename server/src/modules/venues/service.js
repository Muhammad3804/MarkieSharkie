import { pool } from '../../db/pool.js'
import { notFoundError } from '../../lib/AppError.js'
import * as repo from './repository.js'
import { toCard, toPublicReview, toVenueDetail } from './mappers.js'
import { CAPACITY_BUCKETS, PUBLIC_PAGE_SIZE } from './schemas.js'

// Public venues (REQ-12, REQ-13): only approved + active venues, everything else is 404.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROW_SIZE = 6
const NEW_DAYS = 21
const DAY_MS = 86_400_000
const notPublic = () => notFoundError('This venue isn’t available. It may have been removed or not approved yet.')

// Recommended: rating with a small boost for venues many customers reviewed (no personalisation yet, REQ-15).
const score = (c) => (c.reviewCount > 0 ? c.avgRating : 0) + Math.log10(c.reviewCount + 1) / 4
const byScore = (a, b) => score(b) - score(a) || a.name.localeCompare(b.name)

// D6 landing rows, computed from live data. Each row prefers venues not shown in an earlier row.
const LANDING_ROWS = [
  {
    id: 'new',
    title: 'New on MarkieSharkie',
    match: (c, now) => c.approvedAt && now - Date.parse(c.approvedAt) <= NEW_DAYS * DAY_MS,
    sort: (a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt),
    exclusive: false,
  },
  { id: 'featured', title: 'Featured', match: () => true },
  { id: 'virtual-tour', title: '360 Virtual Tour Available', match: (c) => c.hasWalkthrough },
  { id: 'top-food', title: 'Highly Rated in Good Food', match: (c) => c.facilities.includes('catering') },
  { id: 'popular-islamabad', title: 'Popular in Islamabad', match: (c) => c.city === 'Islamabad' },
  { id: 'popular-faisalabad', title: 'Popular in Faisalabad', match: (c) => c.city === 'Faisalabad' },
  { id: 'popular-lahore', title: 'Popular in Lahore', match: (c) => c.city === 'Lahore' },
]

function landingRows(cards, now = Date.now()) {
  const used = new Set()
  const rows = []
  for (const row of LANDING_ROWS) {
    const matching = cards.filter((c) => row.match(c, now)).sort(row.sort ?? byScore)
    const fresh = matching.filter((c) => !used.has(c.id))
    const picked = [...fresh, ...matching.filter((c) => used.has(c.id))].slice(0, ROW_SIZE)
    if (!picked.length) continue
    if (row.exclusive !== false) picked.forEach((c) => used.add(c.id))
    rows.push({ id: row.id, title: row.title, cards: picked })
  }
  return rows
}

export async function getLanding({ origin }) {
  const rows = landingRows(await repo.listPublicCards(pool))
  return rows.map((row) => ({ id: row.id, title: row.title, venues: row.cards.map((c) => toCard(c, origin)) }))
}

// REQ-12 search. Same result shape as the client's searchVenues(): { venues, total, page, pageCount, pageSize,
// priceRange (rupees, all live venues), sectionTitle }. A logged-in customer's search is saved (REQ-4 history).
export async function search(query, { origin, user }) {
  let venueIds = null
  let sectionTitle = ''
  if (query.section) {
    const rows = landingRows(await repo.listPublicCards(pool))
    const row = rows.find((r) => r.id === query.section)
    venueIds = row ? row.cards.map((c) => c.id) : []
    sectionTitle = row?.title ?? ''
  }
  const bucket = CAPACITY_BUCKETS[query.capacity]
  const priceMin = query.priceMin ?? null
  const priceMax = query.priceMax ?? null
  const filters = {
    city: query.city || query.location || '',
    date: query.date ?? null,
    guests: query.guests || null,
    eventType: query.eventType ?? null,
    priceMin: priceMin !== null && priceMax !== null ? Math.min(priceMin, priceMax) : priceMin,
    priceMax: priceMin !== null && priceMax !== null ? Math.max(priceMin, priceMax) : priceMax,
    capacityMin: bucket.min,
    capacityMax: bucket.max,
    minRating: query.rating ? Number(query.rating) : 0,
    settings: query.setting,
    amenities: [...query.amenities, ...(query.catering ? ['catering'] : [])],
    venueIds,
    sort: query.sort,
  }

  const first = await repo.searchPublic(pool, {
    ...filters,
    limit: PUBLIC_PAGE_SIZE,
    offset: (query.page - 1) * PUBLIC_PAGE_SIZE,
  })
  const pageCount = Math.max(1, Math.ceil(first.total / PUBLIC_PAGE_SIZE))
  const page = Math.min(query.page, pageCount)
  // Past the last page (e.g. filters narrowed): answer with the last page, like the client did.
  const result =
    page === query.page
      ? first
      : await repo.searchPublic(pool, { ...filters, limit: PUBLIC_PAGE_SIZE, offset: (page - 1) * PUBLIC_PAGE_SIZE })
  const range = await repo.publicPriceRange(pool)

  if (user?.role === 'customer') {
    await repo.insertSearch(pool, {
      customerId: user.id,
      queryText: filters.city || null,
      filters: { ...query, page: undefined },
      resultsCount: result.total,
    })
  }

  return {
    venues: result.rows.map((c) => toCard(c, origin)),
    total: result.total,
    page,
    pageCount,
    pageSize: PUBLIC_PAGE_SIZE,
    priceRange: {
      min: range.min === null ? 0 : Math.floor(Number(range.min)),
      max: range.max === null ? 0 : Math.ceil(Number(range.max)),
    },
    sectionTitle,
  }
}

// REQ-13 venue page. 404 for an unknown id and for every non-public venue.
export async function getVenue(id, { origin }) {
  if (!UUID.test(id)) throw notPublic()
  const bundle = await repo.loadVenueBundle(pool, id, { publishedOnly: true })
  if (!bundle || bundle.base.approval_status !== 'approved' || !bundle.base.is_active || !bundle.base.owner_active)
    throw notPublic()
  const [reviews, ratingRows, bookedDates] = await Promise.all([
    repo.findReviews(pool, id),
    repo.ratingCounts(pool, id),
    repo.fullyBookedDates(pool, id),
  ])
  return toVenueDetail(bundle, { origin, reviews, ratingRows, bookedDates })
}

// GET /venues/:id/reviews: the platform reviews and rating (REQ-42, REQ-43). Hidden reviews are left out (REQ-44).
// No Google reviews or ratings are fetched or stored; the venue page links to Google Maps instead (srs-alignment #37).
export async function listReviews(id, { page, pageSize }) {
  if (!UUID.test(id)) throw notPublic()
  const base = await repo.findVenueBase(pool, id)
  if (!base || base.approval_status !== 'approved' || !base.is_active || !base.owner_active) throw notPublic()
  const [rows, ratingRows] = await Promise.all([
    repo.findReviews(pool, id, { limit: pageSize, offset: (page - 1) * pageSize }),
    repo.ratingCounts(pool, id),
  ])
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const row of ratingRows) ratingCounts[row.rating] = row.n
  const reviewCount = Object.values(ratingCounts).reduce((a, b) => a + b, 0)
  return {
    reviews: rows.map((r) => toPublicReview(r, id)),
    rating: reviewCount > 0 ? Number(base.avg_rating) : 0,
    reviewCount,
    ratingCounts,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(reviewCount / pageSize)),
  }
}

const todayKarachi = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

// Slots per hall (REQ-16 statuses) for the availability calendar. At most 92 days per request.
// viewerId (optional login): the customer's own running hold comes back as heldByMe with its end time.
export async function getAvailability(id, { from, to }, { viewerId = null } = {}) {
  if (!UUID.test(id)) throw notPublic()
  const base = await repo.findVenueBase(pool, id)
  if (!base || base.approval_status !== 'approved' || !base.is_active || !base.owner_active) throw notPublic()
  const start = from ?? todayKarachi()
  let end = to ?? addDays(start, 30)
  if (Date.parse(end) - Date.parse(start) > 91 * DAY_MS) end = addDays(start, 91)
  const slots = await repo.findSlots(pool, id, { from: start, to: end })
  const halls = new Map()
  for (const slot of slots) {
    if (!halls.has(slot.hall_id)) halls.set(slot.hall_id, [])
    halls.get(slot.hall_id).push({
      slotId: slot.slot_id,
      date: slot.date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      slotType: slot.start_time < '17:00' ? 'lunch' : 'dinner',
      status: slot.status,
      ...(viewerId && slot.held_by === viewerId ? { heldByMe: true, heldUntil: slot.held_until.toISOString() } : {}),
    })
  }
  return { venueId: id, from: start, to: end, halls: [...halls].map(([hallId, list]) => ({ hallId, slots: list })) }
}

// About page numbers (approved + active venues only).
export async function getStats() {
  const row = await repo.platformStats(pool)
  return {
    venueCount: row.venue_count,
    cityCount: row.city_count,
    hallCount: row.hall_count,
    averageRating: row.average_rating === null ? null : Math.round(Number(row.average_rating) * 10) / 10,
  }
}
