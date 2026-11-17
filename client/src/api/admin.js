import { createMockStore, latency } from './mockStore.js'
import {
  getListingRecord,
  listListingRecords,
  listingToVenue,
  resetListings,
  resolveListingFiles,
  setListingStatus,
  setVenueSuspended,
  suspendedVenues,
} from './listings.js'
import { listMockCatalog } from './venues.js'
import { PAKISTAN_BOUNDS, CITIES } from '../features/host/options.js'
import { REPORT_REASONS } from '../features/admin/format.js'

export { REPORT_REASONS }

// Admin API (REQ-7, 9, 10, 47, 48, NFR-4 audit), mocked in localStorage `markiesharkie:admin` until the server
// exists. Every function maps to a route in docs/api-and-security.md ("/admin/..."); every action that changes
// something writes an admin_audit_log row (`audit` below). The server re-checks role = admin on each request.
// TODO(auth): CURRENT_ADMIN comes from the session once auth exists.
export const CURRENT_ADMIN = { id: 'admin-1', name: 'Zara Malik', email: 'zara@markiesharkie.pk' }

const STORE_VERSION = 1
const HOUR = 3600000
const DAY = 24 * HOUR
export const PAGE_SIZE = 10

// Deterministic 0..1 from a string (FNV-1a), so mock scores and dates don't change between loads.
function hash(text) {
  let h = 2166136261
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

const GALLERY_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/gallery/*.webp', { eager: true, import: 'default' })).map(([path, url]) => [path.split('/').pop().replace('.webp', ''), url]),
)

// ---------------------------------------------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------------------------------------------
const FIRST = ['Ahmed', 'Fatima', 'Hassan', 'Ayesha', 'Ali', 'Maryam', 'Omar', 'Zainab', 'Usman', 'Hira', 'Bilal', 'Sana', 'Hamza', 'Iqra', 'Saad', 'Mahnoor', 'Fahad', 'Amna', 'Danish', 'Rabia', 'Talha', 'Noor', 'Asad', 'Laiba', 'Waqas', 'Areeba', 'Junaid', 'Mehwish']
const LAST = ['Khan', 'Malik', 'Butt', 'Qureshi', 'Sheikh', 'Chaudhry', 'Raza', 'Hussain', 'Iqbal', 'Mirza', 'Abbasi', 'Siddiqui', 'Javed', 'Aslam']
const USER_CITIES = ['Lahore', 'Faisalabad', 'Islamabad', 'Karachi', 'Rawalpindi', 'Multan', 'Chiniot']
const DECOR_BUSINESSES = ['Gul Decor Studio', 'Rang Events', 'Mehfil Florals', 'Shaadi Lights', 'Noor Stage Works', 'Phool Wala Decor']

function seedUsers(now) {
  const users = []
  const add = (role, index, extra = {}) => {
    const first = FIRST[(index * 7 + role.length) % FIRST.length]
    const last = LAST[(index * 5 + role.length * 3) % LAST.length]
    const id = `user-${role}-${index + 1}`
    const r = hash(id)
    users.push({
      id,
      name: `${first} ${last}`,
      email: `${first}.${last}${index + 1}@example.pk`.toLowerCase(),
      phone: `+9230${String(10000000 + Math.floor(r * 89999999)).slice(0, 8)}${index % 10}`,
      role,
      city: USER_CITIES[Math.floor(r * USER_CITIES.length)],
      isActive: !(role === 'customer' && index === 4) && !(role === 'decorator' && index === 2),
      deletedAt: null,
      createdAt: new Date(now - (20 + Math.floor(r * 300)) * DAY).toISOString(),
      lastLoginAt: new Date(now - Math.floor(hash(`${id}:login`) * 20 * DAY)).toISOString(),
      activeBookings: role === 'customer' ? Math.floor(hash(`${id}:b`) * 3) : role === 'venue_owner' ? Math.floor(hash(`${id}:b`) * 9) : 0,
      ...extra,
    })
  }
  for (let i = 0; i < 22; i++) add('customer', i)
  for (let i = 0; i < 9; i++) add('venue_owner', i, { businessName: `${LAST[i % LAST.length]} Events (Pvt) Ltd` })
  DECOR_BUSINESSES.forEach((business, i) => add('decorator', i, { businessName: business }))
  return users
}

const DISPUTE_REASONS = [
  ['customer', 'The venue charged extra for the SMD screen even though it was in the agreed quotation.'],
  ['venue_owner', 'Customer cancelled two days before the event and is asking for the advance back, against the agreed policy.'],
  ['customer', 'Guest count was confirmed at 400 but only 300 chairs were set up; asking for a partial refund of the balance.'],
  ['customer', 'Booking was confirmed but the hall was double-booked for a corporate event at the same time.'],
  ['venue_owner', 'Balance payment recorded as received by the customer, but the owner never received it.'],
  ['customer', 'Dinner was served 90 minutes late and the menu items didn’t match Menu 2.'],
]
const DISPUTE_STATUS = ['open', 'open', 'under_review', 'open', 'resolved', 'under_review']

function seedDisputes(now, venues, users) {
  const customers = users.filter((u) => u.role === 'customer')
  return DISPUTE_REASONS.map(([role, reason], i) => {
    const venue = venues[(i * 7) % venues.length]
    const customer = customers[(i * 3) % customers.length]
    const status = DISPUTE_STATUS[i]
    const createdAt = new Date(now - (i * 2 + 1) * DAY - i * 5 * HOUR).toISOString()
    const guests = 250 + i * 50
    const perHead = Number(venue.priceFrom)
    const total = guests * perHead
    const advance = Math.round(total * 0.25)
    return {
      id: `dispute-${i + 1}`,
      bookingId: `BK-2026-${String(412 + i * 37).padStart(4, '0')}`,
      venueId: venue.id,
      venueName: venue.name,
      customerName: customer.name,
      raisedBy: role === 'customer' ? { name: customer.name, role } : { name: `${venue.name} team`, role },
      reason,
      status,
      eventDate: new Date(now - (i - 2) * 9 * DAY).toISOString().slice(0, 10),
      createdAt,
      // REQ-48: the admin reviews the booking, its quotations and its payments.
      quotation: { quotationId: `QT-${3100 + i}`, guests, pricePerHead: `${perHead}.00`, total: `${total}.00`, status: 'accepted' },
      payments: [
        { paymentId: `PM-${7000 + i * 2}`, type: 'advance', amount: `${advance}.00`, status: 'received', recordedAt: new Date(Date.parse(createdAt) - 20 * DAY).toISOString() },
        ...(i % 2 ? [{ paymentId: `PM-${7001 + i * 2}`, type: 'balance', amount: `${total - advance}.00`, status: 'recorded', recordedAt: new Date(Date.parse(createdAt) - 2 * DAY).toISOString() }] : []),
      ],
      adminName: status === 'open' ? null : CURRENT_ADMIN.name,
      resolution: status === 'resolved' ? 'Checked the payment records with both sides; the owner confirmed the balance arrived late. Marked as received, no further action.' : '',
      resolvedAt: status === 'resolved' ? new Date(Date.parse(createdAt) + DAY).toISOString() : null,
    }
  })
}


function seedReports(now, venues) {
  return [
    ['fake_photos', 'The stage photos are from a Pinterest board, I’ve seen them on two other listings.', 'open', 6],
    ['pricing', 'Called them and Menu 1 is Rs 900 more per head than shown here.', 'open', 30],
    ['inaccurate', 'Says 800 guests but the hall barely fits 500.', 'resolved', 140],
  ].map(([reason, details, status, hoursAgo], i) => {
    const venue = venues[(i * 11 + 3) % venues.length]
    return {
      id: `report-${i + 1}`,
      venueId: venue.id,
      venueName: venue.name,
      reason,
      details,
      reporter: 'Signed-out visitor',
      status,
      createdAt: new Date(now - hoursAgo * HOUR).toISOString(),
      resolution: status === 'resolved' ? 'Asked the owner to correct the capacity; updated to 550 seated.' : '',
      resolvedAt: status === 'resolved' ? new Date(now - (hoursAgo - 20) * HOUR).toISOString() : null,
    }
  })
}

// REQ-9: images the AI check flagged. The score is the detector's confidence that the photo is AI-generated or
// stock (mock). Keep = verification_status 'approved' (published), remove = 'rejected' (never published).
const FLAG_ASSETS = ['stage-2', 'hall-3', 'bridal-4', 'entrance-2', 'stage-4', 'hallway-3', 'hall-1', 'parking-2', 'bathroom-3', 'stage-1']
function seedFlaggedImages(now, venues) {
  return FLAG_ASSETS.map((asset, i) => {
    const venue = venues[(i * 5 + 1) % venues.length]
    const score = 0.61 + hash(`flag-${asset}`) * 0.37
    const status = i < 7 ? 'flagged' : i === 7 ? 'approved' : 'rejected'
    return {
      id: `flag-${i + 1}`,
      venueId: venue.id,
      venueName: venue.name,
      ownerName: `${venue.name} team`,
      asset,
      fileName: `${asset}-${1200 + i}.jpg`,
      aiScore: Math.round(score * 100) / 100,
      aiLabel: i % 3 === 0 ? 'Possibly stock photo' : 'Possibly AI-generated',
      status,
      uploadedAt: new Date(now - (i * 9 + 2) * HOUR).toISOString(),
      decidedAt: status === 'flagged' ? null : new Date(now - i * 3 * HOUR).toISOString(),
    }
  })
}

function seedAudit(now) {
  return listListingRecords()
    .filter((listing) => listing.status !== 'pending')
    .map((listing, i) => ({
      logId: `log-seed-${i + 1}`,
      adminId: CURRENT_ADMIN.id,
      adminName: CURRENT_ADMIN.name,
      action: { approved: 'venue.approve', rejected: 'venue.reject', changes_requested: 'venue.request_changes' }[listing.status],
      targetTable: 'venues',
      targetId: listing.id,
      targetLabel: listing.payload.venue.name,
      details: listing.rejectionReason ? { reason: listing.rejectionReason } : listing.changesNote ? { note: listing.changesNote } : {},
      createdAt: listing.decidedAt ?? new Date(now - DAY).toISOString(),
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

const store = createMockStore('markiesharkie:admin', {
  seed: () => {
    const now = Date.now()
    const venues = listMockCatalog()
    const users = seedUsers(now)
    return {
      version: STORE_VERSION,
      users,
      disputes: seedDisputes(now, venues, users),
      reports: seedReports(now, venues),
      flaggedImages: seedFlaggedImages(now, venues),
      audit: seedAudit(now),
      notificationsReadAt: null,
    }
  },
  isValid: (value) => value?.version === STORE_VERSION && Array.isArray(value.users) && Array.isArray(value.audit),
})

// One admin_audit_log row (NFR-4). `details` is free-form JSON (reason, note, counts...).
function audit(state, { action, targetTable, targetId, targetLabel, details = {} }) {
  const entry = {
    logId: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    adminId: CURRENT_ADMIN.id,
    adminName: CURRENT_ADMIN.name,
    action,
    targetTable,
    targetId,
    targetLabel,
    details,
    createdAt: new Date().toISOString(),
  }
  return { ...state, audit: [entry, ...state.audit] }
}

const record = (entry) => store.update((state) => audit(state, entry))

// ---------------------------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------------------------
const lower = (text) => String(text ?? '').toLocaleLowerCase('en')
const matchesQuery = (q, ...fields) => !q || fields.some((field) => lower(field).includes(lower(q)))

function paginate(rows, page) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(Math.max(1, page || 1), pageCount)
  return { rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), total: rows.length, page: current, pageCount, pageSize: PAGE_SIZE }
}

// When a mock catalogue venue was listed (UI-only, for the submissions chart and "All venues").
const catalogCreatedAt = (id, now) => new Date(now - (7 + Math.floor(hash(`${id}:created`) * 77)) * DAY).toISOString()

// ---------------------------------------------------------------------------------------------------------------
// Venue approvals (REQ-7)
// ---------------------------------------------------------------------------------------------------------------
export const APPROVAL_STATUSES = ['pending', 'changes_requested', 'approved', 'rejected']

function approvalRow(listing) {
  const { venue, halls, extras } = listing.payload
  return {
    id: listing.id,
    name: venue.name,
    city: venue.city,
    area: extras.area,
    category: extras.category,
    venueType: venue.venueType,
    capacity: venue.capacity,
    hallCount: halls.length,
    photoCount: listing.payload.venueImages.length,
    basePrice: venue.basePrice,
    owner: listing.owner,
    status: listing.status,
    submittedAt: listing.submittedAt,
    decidedAt: listing.decidedAt,
    coverId: listing.payload.venueImages.find((image) => image.isCover)?.imageId ?? listing.payload.venueImages[0]?.imageId,
  }
}

const APPROVAL_SORTS = {
  oldest: (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt),
  newest: (a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
  name: (a, b) => a.name.localeCompare(b.name),
  capacity: (a, b) => b.capacity - a.capacity,
}

export function approvalCounts() {
  const counts = Object.fromEntries(APPROVAL_STATUSES.map((status) => [status, 0]))
  for (const listing of listListingRecords()) counts[listing.status] = (counts[listing.status] ?? 0) + 1
  return counts
}

// { rows (with coverUrl), total, page, pageCount, counts, cities } for the approvals table.
// params: { status, q, city, type, from, to (yyyy-mm-dd), sort, page }
export async function listApprovals(params) {
  await latency()
  const all = listListingRecords().map(approvalRow)
  const fromTime = params.from ? Date.parse(`${params.from}T00:00:00+05:00`) : null
  const toTime = params.to ? Date.parse(`${params.to}T23:59:59+05:00`) : null
  const rows = all
    .filter(
      (row) =>
        row.status === params.status &&
        matchesQuery(params.q, row.name, row.city, row.area, row.owner.name, row.owner.email) &&
        (!params.city || row.city === params.city) &&
        (!params.type || row.venueType === params.type) &&
        (fromTime === null || Date.parse(row.submittedAt) >= fromTime) &&
        (toTime === null || Date.parse(row.submittedAt) <= toTime),
    )
    .sort(APPROVAL_SORTS[params.sort] ?? APPROVAL_SORTS.oldest)
  const result = paginate(rows, params.page)
  // Cover thumbnails for the visible page only.
  result.rows = await Promise.all(
    result.rows.map(async (row) => {
      const urls = await resolveListingFiles(getListingRecord(row.id))
      return { ...row, coverUrl: urls[row.coverId] ?? null }
    }),
  )
  return { ...result, counts: approvalCounts(), cities: [...new Set(all.map((row) => row.city))].sort() }
}

// Mock AI detector score per photo (REQ-9): most photos are clearly genuine, a few are borderline.
export function mockAiScore(imageId) {
  const r = hash(`ai:${imageId}`)
  return Math.round((r < 0.85 ? r * 0.3 : 0.45 + r * 0.4) * 100) / 100
}

const R = 6371
function distanceKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Hints for the review checklist. The admin still ticks each box; these only say what we could check automatically.
function autoChecks(listing) {
  const { draft, payload } = listing
  const hallsWithPhoto = draft.halls.filter((hall) => draft.venueImages.some((image) => image.hallId === hall.hallId))
  const center = CITIES.find((city) => city.value === draft.venue.city)
  const point = payload.venue.location
  const inPakistan = point && point.lat >= PAKISTAN_BOUNDS.minLat && point.lat <= PAKISTAN_BOUNDS.maxLat && point.lng >= PAKISTAN_BOUNDS.minLng && point.lng <= PAKISTAN_BOUNDS.maxLng
  const km = point && center ? distanceKm(point, center) : null
  const flaggedPhotos = draft.venueImages.filter((image) => mockAiScore(image.imageId) >= 0.6).length
  const missing = [
    !draft.venue.headline.trim() && 'listing title',
    draft.venue.description.trim().length < 50 && 'a longer description',
    !draft.menuPackages.length && 'a menu package',
    draft.halls.some((hall) => !hall.lengthFt || !hall.widthFt) && 'hall sizes',
    !draft.venue.parkingSpaces && 'parking spaces',
    !draft.bookingRules.cancellationPolicy && 'a cancellation policy',
  ].filter(Boolean)
  return {
    photos: {
      ok: draft.venueImages.length >= 5 && hallsWithPhoto.length === draft.halls.length && flaggedPhotos === 0,
      hint: `${draft.venueImages.length} photos, ${hallsWithPhoto.length} of ${draft.halls.length} halls covered${flaggedPhotos ? `, ${flaggedPhotos} with a high AI score` : ''}`,
    },
    details: { ok: missing.length === 0, hint: missing.length ? `Missing ${missing.join(', ')}` : 'Every section is filled in' },
    location: {
      ok: Boolean(inPakistan && km !== null && km <= 60),
      hint: !point ? 'No map pin' : !inPakistan ? 'Pin is outside Pakistan' : km === null ? 'City not recognised' : `Pin is ${Math.round(km)} km from the ${draft.venue.city} city centre`,
    },
  }
}

// Everything the review page shows: { listing, venue (detail shape), urls, checks, aiScores }. null = not found.
export async function getApproval(id) {
  await latency()
  const listing = getListingRecord(id)
  if (!listing) return null
  const urls = await resolveListingFiles(listing)
  return {
    listing,
    venue: listingToVenue(listing, urls),
    urls,
    checks: autoChecks(listing),
    aiScores: Object.fromEntries(listing.payload.venueImages.map((image) => [image.imageId, mockAiScore(image.imageId)])),
    suspended: Boolean(suspendedVenues()[id]),
  }
}

export async function approveListings(ids, { checklist } = {}) {
  await latency(300)
  for (const id of ids) {
    const listing = getListingRecord(id)
    if (!listing || (listing.status !== 'pending' && listing.status !== 'changes_requested')) continue
    setListingStatus(id, { status: 'approved', by: CURRENT_ADMIN.id })
    record({ action: 'venue.approve', targetTable: 'venues', targetId: id, targetLabel: listing.payload.venue.name, details: checklist ? { checklist } : { bulk: ids.length > 1 } })
  }
}

// Only pending or changes-requested listings can be decided; anything else is a 409 on the server.
function assertDecidable(id) {
  const listing = getListingRecord(id)
  if (!listing) throw new Error('Listing not found')
  if (listing.status !== 'pending' && listing.status !== 'changes_requested') throw new Error(`Listing is already ${listing.status}`)
}

export async function rejectListing(id, reason) {
  if (!reason?.trim()) throw new Error('A reason is required')
  await latency(300)
  assertDecidable(id)
  const listing = setListingStatus(id, { status: 'rejected', by: CURRENT_ADMIN.id, reason: reason.trim() })
  record({ action: 'venue.reject', targetTable: 'venues', targetId: id, targetLabel: listing.payload.venue.name, details: { reason: reason.trim() } })
}

export async function requestListingChanges(id, note) {
  if (!note?.trim()) throw new Error('A note is required')
  await latency(300)
  assertDecidable(id)
  const listing = setListingStatus(id, { status: 'changes_requested', by: CURRENT_ADMIN.id, note: note.trim() })
  record({ action: 'venue.request_changes', targetTable: 'venues', targetId: id, targetLabel: listing.payload.venue.name, details: { note: note.trim() } })
}

// ---------------------------------------------------------------------------------------------------------------
// Flagged images (REQ-9, REQ-10)
// ---------------------------------------------------------------------------------------------------------------
export async function listFlaggedImages({ status = 'flagged' }) {
  await latency()
  const images = store.get().flaggedImages
  return {
    images: images
      .filter((image) => image.status === status)
      .sort((a, b) => b.aiScore - a.aiScore)
      .map((image) => ({ ...image, imageUrl: GALLERY_URLS[image.asset] })),
    counts: { flagged: images.filter((i) => i.status === 'flagged').length, approved: images.filter((i) => i.status === 'approved').length, rejected: images.filter((i) => i.status === 'rejected').length },
  }
}

// decision: 'approved' (keep, publish) | 'rejected' (remove, never published). The owner is notified (REQ-10).
export async function decideImage(id, decision) {
  await latency(250)
  // Already decided (e.g. a double click while the list refreshed): the server answers 409; do nothing.
  if (store.get().flaggedImages.find((i) => i.id === id)?.status !== 'flagged') throw new Error('Image already decided')
  store.update((state) => {
    const image = state.flaggedImages.find((i) => i.id === id)
    const next = { ...state, flaggedImages: state.flaggedImages.map((i) => (i.id === id ? { ...i, status: decision, decidedAt: new Date().toISOString() } : i)) }
    return audit(next, { action: decision === 'approved' ? 'image.keep' : 'image.remove', targetTable: 'venue_images', targetId: id, targetLabel: `${image.fileName} (${image.venueName})`, details: { aiScore: image.aiScore } })
  })
}

// ---------------------------------------------------------------------------------------------------------------
// All venues (live catalogue + approved listings) and suspension
// ---------------------------------------------------------------------------------------------------------------
async function allLiveVenues() {
  const now = Date.now()
  const suspended = suspendedVenues()
  const catalog = listMockCatalog().map((venue) => ({
    id: venue.id,
    name: venue.name,
    city: venue.city,
    area: venue.area,
    venueType: venue.venueType,
    capacity: venue.capacity,
    rating: venue.rating,
    reviewCount: venue.reviewCount,
    image: venue.image,
    ownerName: `${venue.name} team`,
    source: 'catalog',
    listedAt: catalogCreatedAt(venue.id, now),
  }))
  const approved = await Promise.all(
    listListingRecords()
      .filter((listing) => listing.status === 'approved')
      .map(async (listing) => {
        const urls = await resolveListingFiles(listing)
        const cover = listing.payload.venueImages.find((image) => image.isCover) ?? listing.payload.venueImages[0]
        return {
          id: listing.id,
          name: listing.payload.venue.name,
          city: listing.payload.venue.city,
          area: listing.payload.extras.area,
          venueType: listing.payload.venue.venueType,
          capacity: listing.payload.venue.capacity,
          rating: 0,
          reviewCount: 0,
          image: urls[cover?.imageId] ?? '',
          ownerName: listing.owner.name,
          source: 'listing',
          listedAt: listing.decidedAt,
        }
      }),
  )
  return [...approved, ...catalog].map((venue) => ({ ...venue, suspended: suspended[venue.id] ?? null }))
}

const VENUE_SORTS = {
  newest: (a, b) => Date.parse(b.listedAt) - Date.parse(a.listedAt),
  name: (a, b) => a.name.localeCompare(b.name),
  rating: (a, b) => b.rating - a.rating,
  capacity: (a, b) => b.capacity - a.capacity,
}

// params: { status: 'live' | 'suspended', q, city, sort, page }
export async function listVenues(params) {
  await latency()
  const all = await allLiveVenues()
  const rows = all
    .filter((venue) => (params.status === 'suspended' ? venue.suspended : !venue.suspended) && matchesQuery(params.q, venue.name, venue.city, venue.area, venue.ownerName) && (!params.city || venue.city === params.city))
    .sort(VENUE_SORTS[params.sort] ?? VENUE_SORTS.newest)
  return {
    ...paginate(rows, params.page),
    counts: { live: all.filter((v) => !v.suspended).length, suspended: all.filter((v) => v.suspended).length },
    cities: [...new Set(all.map((v) => v.city))].sort(),
  }
}

export async function suspendVenue(id, name, reason) {
  await latency(250)
  setVenueSuspended(id, true, { by: CURRENT_ADMIN.id, reason })
  record({ action: 'venue.suspend', targetTable: 'venues', targetId: id, targetLabel: name, details: reason ? { reason } : {} })
}

export async function unsuspendVenue(id, name) {
  await latency(250)
  setVenueSuspended(id, false, { by: CURRENT_ADMIN.id })
  record({ action: 'venue.unsuspend', targetTable: 'venues', targetId: id, targetLabel: name })
}

// ---------------------------------------------------------------------------------------------------------------
// Users (REQ-47)
// ---------------------------------------------------------------------------------------------------------------
const userStatus = (user) => (user.deletedAt ? 'removed' : user.isActive ? 'active' : 'suspended')

// params: { role, status, q, page }
export async function listUsers(params) {
  await latency()
  const all = store.get().users
  const rows = all
    .filter((user) => (!params.role || user.role === params.role) && (!params.status || userStatus(user) === params.status) && matchesQuery(params.q, user.name, user.email, user.phone, user.city, user.businessName))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((user) => ({ ...user, status: userStatus(user) }))
  const roles = ['customer', 'venue_owner', 'decorator']
  return { ...paginate(rows, params.page), counts: Object.fromEntries(roles.map((role) => [role, all.filter((u) => u.role === role && !u.deletedAt).length])) }
}

export async function getUser(id) {
  await latency(150)
  const user = store.get().users.find((u) => u.id === id)
  if (!user) return null
  const history = store.get().audit.filter((entry) => entry.targetId === id)
  return { ...user, status: userStatus(user), history }
}

// action: 'suspend' | 'unblock' | 'remove'. Removal is a soft delete (users.deleted_at, personal fields anonymised
// on the server). The UI warns first when the user has active bookings (REQ-47).
export async function setUserState(id, action) {
  await latency(250)
  store.update((state) => {
    const user = state.users.find((u) => u.id === id)
    const patch = action === 'suspend' ? { isActive: false } : action === 'unblock' ? { isActive: true } : { isActive: false, deletedAt: new Date().toISOString() }
    const next = { ...state, users: state.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }
    return audit(next, { action: `user.${action}`, targetTable: 'users', targetId: id, targetLabel: `${user.name} (${user.role.replace('_', ' ')})`, details: user.activeBookings ? { activeBookings: user.activeBookings } : {} })
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Disputes (REQ-48) and listing reports (UI-only: no table in db/schema.sql yet)
// ---------------------------------------------------------------------------------------------------------------
export async function listDisputes({ status }) {
  await latency()
  const all = store.get().disputes
  return {
    rows: all.filter((d) => !status || d.status === status).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    counts: { open: all.filter((d) => d.status === 'open').length, under_review: all.filter((d) => d.status === 'under_review').length, resolved: all.filter((d) => d.status === 'resolved').length },
  }
}

export async function updateDispute(id, { status, resolution = '' }) {
  if (status === 'resolved' && !resolution.trim()) throw new Error('A resolution is required')
  await latency(250)
  if (store.get().disputes.find((d) => d.id === id)?.status === 'resolved') throw new Error('Dispute already resolved')
  store.update((state) => {
    const dispute = state.disputes.find((d) => d.id === id)
    const patch = status === 'resolved' ? { status, resolution: resolution.trim(), resolvedAt: new Date().toISOString(), adminName: CURRENT_ADMIN.name } : { status, adminName: CURRENT_ADMIN.name }
    const next = { ...state, disputes: state.disputes.map((d) => (d.id === id ? { ...d, ...patch } : d)) }
    return audit(next, { action: status === 'resolved' ? 'dispute.resolve' : 'dispute.take', targetTable: 'disputes', targetId: id, targetLabel: `${dispute.bookingId} · ${dispute.venueName}`, details: resolution ? { resolution: resolution.trim() } : {} })
  })
}

export async function listReports({ status }) {
  await latency()
  const all = store.get().reports
  return {
    rows: all.filter((r) => !status || r.status === status).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    counts: { open: all.filter((r) => r.status === 'open').length, under_review: all.filter((r) => r.status === 'under_review').length, resolved: all.filter((r) => r.status === 'resolved').length },
  }
}

export async function updateReport(id, { status, resolution = '' }) {
  if (status === 'resolved' && !resolution.trim()) throw new Error('A resolution is required')
  await latency(250)
  if (store.get().reports.find((r) => r.id === id)?.status === 'resolved') throw new Error('Report already resolved')
  store.update((state) => {
    const report = state.reports.find((r) => r.id === id)
    const patch = status === 'resolved' ? { status, resolution: resolution.trim(), resolvedAt: new Date().toISOString() } : { status }
    const next = { ...state, reports: state.reports.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
    return audit(next, { action: status === 'resolved' ? 'report.resolve' : 'report.take', targetTable: 'listing_reports', targetId: id, targetLabel: report.venueName, details: resolution ? { resolution: resolution.trim() } : {} })
  })
}

// Public: "Report this listing" on the venue page. Anyone can report; no account yet (TODO(auth): reporter id).
// Later: POST /api/venues/:id/reports (proposed table, see docs/progress.md).
export async function reportListing({ venueId, venueName, reason, details }) {
  await latency(400)
  const report = {
    id: `report-${Date.now().toString(36)}`,
    venueId,
    venueName,
    reason,
    details: details.trim(),
    reporter: 'Signed-out visitor',
    status: 'open',
    createdAt: new Date().toISOString(),
    resolution: '',
    resolvedAt: null,
  }
  store.update((state) => ({ ...state, reports: [report, ...state.reports] }))
  return report
}

// ---------------------------------------------------------------------------------------------------------------
// Audit log (NFR-4)
// ---------------------------------------------------------------------------------------------------------------
export async function listAudit({ q, action, page }) {
  await latency()
  const all = store.get().audit
  const rows = all.filter((entry) => (!action || entry.action.startsWith(`${action}.`)) && matchesQuery(q, entry.targetLabel, entry.adminName, entry.action, JSON.stringify(entry.details)))
  return paginate(rows, page)
}

// ---------------------------------------------------------------------------------------------------------------
// Overview, sidebar badges and notifications
// ---------------------------------------------------------------------------------------------------------------
// Sync, for the sidebar badges (they re-read on every store change).
export function navCounts() {
  const state = store.get()
  return {
    approvals: approvalCounts().pending,
    images: state.flaggedImages.filter((i) => i.status === 'flagged').length,
    reports: state.disputes.filter((d) => d.status === 'open').length + state.reports.filter((r) => r.status === 'open').length,
  }
}

const WEEKS = 12
// Monday 00:00 Pakistan time of the week `iso` falls in, as a timestamp.
function weekStart(time) {
  const pk = new Date(time + 5 * HOUR)
  const day = (pk.getUTCDay() + 6) % 7
  return Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate() - day) - 5 * HOUR
}

export async function getOverview() {
  await latency()
  const now = Date.now()
  const state = store.get()
  const listings = listListingRecords()
  const live = await allLiveVenues()
  const counts = approvalCounts()

  // Submissions per week: host listings (any status) + catalogue venues by their listing date.
  const thisWeek = weekStart(now)
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: thisWeek - (WEEKS - 1 - i) * 7 * DAY, submitted: 0, approved: 0 }))
  const bucket = (iso) => weeks.find((w) => Date.parse(iso) >= w.start && Date.parse(iso) < w.start + 7 * DAY)
  for (const listing of listings) {
    const week = bucket(listing.history[0]?.at ?? listing.submittedAt)
    if (week) week.submitted += 1
    if (listing.status === 'approved' && listing.decidedAt) {
      const decided = bucket(listing.decidedAt)
      if (decided) decided.approved += 1
    }
  }
  for (const venue of listMockCatalog()) {
    const week = bucket(catalogCreatedAt(venue.id, now))
    if (week) {
      week.submitted += 1
      week.approved += 1
    }
  }

  const pending = listings.filter((l) => l.status === 'pending').sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))
  const attention = [
    ...pending.filter((l) => now - Date.parse(l.submittedAt) > 2 * DAY).map((l) => ({ id: l.id, kind: 'approval', title: l.payload.venue.name, detail: `Waiting for review since ${l.submittedAt}`, at: l.submittedAt, to: `/admin/approvals/${l.id}` })),
    ...state.disputes.filter((d) => d.status === 'open').map((d) => ({ id: d.id, kind: 'dispute', title: `Dispute on ${d.bookingId}`, detail: d.venueName, at: d.createdAt, to: `/admin/reports?tab=disputes&status=open#${d.id}` })),
    ...state.flaggedImages.filter((i) => i.status === 'flagged' && i.aiScore >= 0.85).map((i) => ({ id: i.id, kind: 'image', title: `${i.fileName} scored ${Math.round(i.aiScore * 100)}%`, detail: i.venueName, at: i.uploadedAt, to: '/admin/images' })),
    ...state.reports.filter((r) => r.status === 'open').map((r) => ({ id: r.id, kind: 'report', title: `Report on ${r.venueName}`, detail: REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason, at: r.createdAt, to: `/admin/reports?tab=reports&status=open#${r.id}` })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const activity = [
    ...state.audit.slice(0, 12).map((entry) => ({ id: entry.logId, kind: 'audit', action: entry.action, actor: entry.adminName, target: entry.targetLabel, at: entry.createdAt })),
    ...listings.map((l) => ({ id: `sub-${l.id}-${l.submittedAt}`, kind: 'submission', action: 'venue.submit', actor: l.owner.name, target: l.payload.venue.name, at: l.submittedAt })),
    ...state.reports.map((r) => ({ id: `rep-${r.id}`, kind: 'report', action: 'report.create', actor: r.reporter, target: r.venueName, at: r.createdAt })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8)

  const monthStart = new Date(now)
  const users = state.users.filter((u) => !u.deletedAt)
  return {
    kpis: {
      pendingApprovals: counts.pending,
      pendingNewThisWeek: pending.filter((l) => Date.parse(l.submittedAt) >= thisWeek).length,
      liveVenues: live.filter((v) => !v.suspended).length,
      suspendedVenues: live.filter((v) => v.suspended).length,
      users: users.length,
      usersByRole: { customer: users.filter((u) => u.role === 'customer').length, venue_owner: users.filter((u) => u.role === 'venue_owner').length, decorator: users.filter((u) => u.role === 'decorator').length },
      // Mock until the booking engine exists: a stable number per month.
      bookingsThisMonth: 96 + Math.floor(hash(`bookings:${monthStart.getUTCFullYear()}-${monthStart.getUTCMonth()}`) * 60),
      flaggedImages: state.flaggedImages.filter((i) => i.status === 'flagged').length,
    },
    weeks,
    attention,
    activity,
  }
}

export async function getNotifications() {
  await latency(120)
  const state = store.get()
  const readAt = state.notificationsReadAt ? Date.parse(state.notificationsReadAt) : 0
  const items = [
    ...listListingRecords()
      .filter((l) => l.status === 'pending')
      .map((l) => ({ id: `n-sub-${l.id}`, text: `${l.payload.venue.name} was submitted for review`, at: l.submittedAt, to: `/admin/approvals/${l.id}` })),
    ...state.reports.filter((r) => r.status === 'open').map((r) => ({ id: `n-rep-${r.id}`, text: `New report on ${r.venueName}`, at: r.createdAt, to: `/admin/reports?tab=reports&status=open#${r.id}` })),
    ...state.disputes.filter((d) => d.status === 'open').map((d) => ({ id: `n-dis-${d.id}`, text: `Dispute opened on ${d.bookingId}`, at: d.createdAt, to: `/admin/reports?tab=disputes&status=open#${d.id}` })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 10)
    .map((item) => ({ ...item, unread: Date.parse(item.at) > readAt }))
  return { items, unread: items.filter((i) => i.unread).length }
}

export function markNotificationsRead() {
  store.update((state) => ({ ...state, notificationsReadAt: new Date().toISOString() }))
}

// Global search in the top bar: venues (listings + catalogue) and users by name.
export async function searchAdmin(q) {
  if (!q.trim()) return []
  await latency(100)
  const listings = listListingRecords()
    .filter((l) => matchesQuery(q, l.payload.venue.name, l.owner.name))
    .map((l) => ({ id: l.id, kind: 'Listing', label: l.payload.venue.name, detail: `${l.payload.venue.city} · ${l.status.replace('_', ' ')}`, to: `/admin/approvals/${l.id}` }))
  const suspended = suspendedVenues()
  const venues = listMockCatalog()
    .filter((v) => matchesQuery(q, v.name, v.area))
    .map((v) => ({ id: v.id, kind: 'Venue', label: v.name, detail: `${v.city}${suspended[v.id] ? ' · suspended' : ''}`, to: `/admin/venues?q=${encodeURIComponent(v.name)}${suspended[v.id] ? '&status=suspended' : ''}` }))
  const users = store
    .get()
    .users.filter((u) => matchesQuery(q, u.name, u.email))
    .map((u) => ({ id: u.id, kind: 'User', label: u.name, detail: u.email, to: `/admin/users?q=${encodeURIComponent(u.email)}&user=${u.id}` }))
  return [...listings, ...venues, ...users].slice(0, 8)
}

export function resetDemoData() {
  resetListings()
  store.reset()
}

