import { createMockStore, latency, notifyStoreChange } from './mockStore.js'
import { getSessionUser } from './auth.js'
import { ApiError, apiFetch } from './http.js'
import { listingToDraft, toHistory } from './listings.js'
import { PAKISTAN_BOUNDS, CITIES } from '../features/host/options.js'
import { REPORT_REASONS } from '../features/admin/format.js'

export { REPORT_REASONS }

// Admin API (REQ-7, 9, 10, 47, 48, NFR-4 audit). Venues, approvals, photo checks, the dashboard and the venue /
// photo audit log come from the server (/api/admin/...), and so do users (REQ-47). Disputes and listing reports are
// still a demo in localStorage `markiesharkie:admin` (REQ-48 comes with its own module); the comments below this line
// describe that demo part. Original note: mocked in localStorage until the server
// exists. Every function maps to a route in docs/api-and-security.md ("/admin/..."); every action that changes
// something writes an admin_audit_log row (`audit` below). The server re-checks role = admin on each request.
// The logged-in admin (the route is admin-only, RequireRole in app/router.jsx).
export const CURRENT_ADMIN = {
  get id() {
    return getSessionUser()?.id ?? ''
  },
  get name() {
    return getSessionUser()?.name ?? 'Admin'
  },
  get email() {
    return getSessionUser()?.email ?? ''
  },
}

const STORE_VERSION = 3 // 2: venues, photos and the venue audit log moved to the server; 3: users moved too
const HOUR = 3600000
const DAY = 24 * HOUR
export const PAGE_SIZE = 10

// ---------------------------------------------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------------------------------------------
// Demo customer names for the demo disputes only (REQ-48 moves to the server in Part D; users are on the server).
const DEMO_CUSTOMERS = ['Ayesha Malik', 'Hassan Qureshi', 'Sana Iqbal', 'Omar Sheikh', 'Hira Butt', 'Bilal Raza']

const DISPUTE_REASONS = [
  ['customer', 'The venue charged extra for the SMD screen even though it was in the agreed quotation.'],
  ['venue_owner', 'Customer cancelled two days before the event and is asking for the advance back, against the agreed policy.'],
  ['customer', 'Guest count was confirmed at 400 but only 300 chairs were set up; asking for a partial refund of the balance.'],
  ['customer', 'Booking was confirmed but the hall was double-booked for a corporate event at the same time.'],
  ['venue_owner', 'Balance payment recorded as received by the customer, but the owner never received it.'],
  ['customer', 'Dinner was served 90 minutes late and the menu items didn’t match Menu 2.'],
]
const DISPUTE_STATUS = ['open', 'open', 'under_review', 'open', 'resolved', 'under_review']

function seedDisputes(now, venues) {
  return DISPUTE_REASONS.map(([role, reason], i) => {
    const venue = venues[(i * 7) % venues.length]
    const customer = { name: DEMO_CUSTOMERS[(i * 3) % DEMO_CUSTOMERS.length] }
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
// Venue names for the demo disputes and reports (the seeded catalogue's names; ids are demo ids).
const DEMO_VENUES = ['Qasar-e-Noor', 'The Palms Marquee', 'Rosewood Banquet', 'Jasmine Garden', 'Pearl Banquet', 'Chenab Palace', 'Imperial Manor', 'Opal Pavilion'].map((name, i) => ({ id: `demo-venue-${i + 1}`, name, city: i % 3 === 0 ? 'Lahore' : i % 3 === 1 ? 'Islamabad' : 'Faisalabad', priceFrom: `${3500 + i * 250}.00` }))

const store = createMockStore('markiesharkie:admin', {
  seed: () => {
    const now = Date.now()
    const venues = DEMO_VENUES
    return {
      version: STORE_VERSION,
      disputes: seedDisputes(now, venues),
      reports: seedReports(now, venues),
      audit: [],
      notificationsReadAt: null,
    }
  },
  isValid: (value) => value?.version === STORE_VERSION && Array.isArray(value.disputes) && Array.isArray(value.audit),
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

// ---------------------------------------------------------------------------------------------------------------
// Venue approvals (REQ-7): GET/POST /api/admin/venues...
// ---------------------------------------------------------------------------------------------------------------
export const APPROVAL_STATUSES = ['pending', 'changes_requested', 'approved', 'rejected']

// Sidebar badges are read synchronously (navCounts); every server answer that has the numbers refreshes this.
const cachedCounts = { pending: 0, images: 0, edits: 0, reviews: 0, loaded: false, loading: false }
const changed = () => notifyStoreChange() // admin pages refetch on store changes (features/admin/hooks.js)

export function approvalCounts() {
  return { pending: cachedCounts.pending, changes_requested: 0, approved: 0, rejected: 0 }
}

const APPROVAL_SORT = { oldest: 'oldest', newest: 'newest', name: 'name', capacity: 'capacity' }
const query = (params) => {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') q.set(key, String(value))
  return q.toString()
}

// { rows (with coverUrl), total, page, pageCount, counts, cities } for the approvals table.
// params: { status, q, city, type, from, to (yyyy-mm-dd), sort, page }
export async function listApprovals(params) {
  const data = await apiFetch(
    `/admin/venues?${query({ status: params.status, q: params.q, city: params.city, type: params.type, submittedFrom: params.from, submittedTo: params.to, sort: APPROVAL_SORT[params.sort] ?? 'oldest', page: params.page || 1, pageSize: PAGE_SIZE })}`,
  )
  cachedCounts.pending = data.counts.pending
  return { rows: data.rows, total: data.total, page: data.page, pageCount: data.pageCount, pageSize: data.pageSize, counts: data.counts, cities: data.cities }
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
function autoChecks(listing, aiScores) {
  const { draft, payload } = listing
  const hallsWithPhoto = draft.halls.filter((hall) => draft.venueImages.some((image) => image.hallId === hall.hallId))
  const center = CITIES.find((city) => city.value === draft.venue.city)
  const point = payload.venue.location
  const inPakistan = point && point.lat >= PAKISTAN_BOUNDS.minLat && point.lat <= PAKISTAN_BOUNDS.maxLat && point.lng >= PAKISTAN_BOUNDS.minLng && point.lng <= PAKISTAN_BOUNDS.maxLng
  const km = point && center ? distanceKm(point, center) : null
  const flaggedPhotos = draft.venueImages.filter((image) => (aiScores[image.imageId] ?? 0) > 0.3).length
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

// Everything the review page shows: { listing (with the wizard draft), venue (detail shape), urls, checks,
// aiScores, suspended }. null = not found. GET /api/admin/venues/:id
export async function getApproval(id) {
  let data
  try {
    data = await apiFetch(`/admin/venues/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
  const { listing: server, venue, history } = data
  const { draft, files } = listingToDraft(server)
  const suspended = server.status === 'suspended'
  const listing = {
    id: server.id,
    status: suspended ? 'approved' : server.status,
    owner: server.owner,
    submittedAt: server.submittedAt,
    decidedAt: server.decidedAt,
    rejectionReason: server.rejectionReason,
    changesNote: server.changesNote,
    history: toHistory(server, history),
    payload: { venue: { name: server.venue.name, location: server.venue.lat == null ? null : { lat: server.venue.lat, lng: server.venue.lng } } },
    draft,
  }
  const aiScores = Object.fromEntries(server.images.map((image) => [image.imageId, image.aiScore ?? 0]))
  return { listing, venue, urls: Object.fromEntries(files.map((file) => [file.id, file.url])), checks: autoChecks(listing, aiScores), aiScores, suspended }
}

// One id: POST /admin/venues/:id/approve (with the checklist). Several: POST /admin/venues/approve (all or nothing).
export async function approveListings(ids, { checklist } = {}) {
  if (ids.length === 1) await apiFetch(`/admin/venues/${encodeURIComponent(ids[0])}/approve`, { method: 'POST', body: checklist ? { checklist } : {} })
  else await apiFetch('/admin/venues/approve', { method: 'POST', body: { ids } })
  changed()
}

export async function rejectListing(id, reason) {
  if (!reason?.trim()) throw new Error('A reason is required')
  await apiFetch(`/admin/venues/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason: reason.trim() } })
  changed()
}

export async function requestListingChanges(id, note) {
  if (!note?.trim()) throw new Error('A note is required')
  await apiFetch(`/admin/venues/${encodeURIComponent(id)}/request-changes`, { method: 'POST', body: { note: note.trim() } })
  changed()
}

// ---------------------------------------------------------------------------------------------------------------
// Photos checked by the AI detector (REQ-9, REQ-10): GET /api/admin/images, POST /api/admin/images/:id/decision
// ---------------------------------------------------------------------------------------------------------------
export async function listFlaggedImages({ status = 'flagged' }) {
  const data = await apiFetch(`/admin/images?status=${encodeURIComponent(status)}`)
  cachedCounts.images = data.counts.flagged
  return {
    images: data.images.map((image) => ({
      ...image,
      aiScore: image.aiScore ?? 0,
      aiLabel: image.aiScore === null ? 'Needs a look' : image.highConfidence ? 'Likely AI-generated' : 'Possibly AI-generated',
    })),
    counts: { flagged: data.counts.flagged, approved: data.counts.approved, rejected: data.counts.rejected },
  }
}

// decision: 'approved' (keep, publish) | 'rejected' (remove, never published). 409 if already decided.
export async function decideImage(id, decision) {
  await apiFetch(`/admin/images/${encodeURIComponent(id)}/decision`, { method: 'POST', body: { decision } })
  changed()
}

// ---------------------------------------------------------------------------------------------------------------
// Live and suspended venues (srs-alignment #29): GET /api/admin/venues?status=approved|suspended
// ---------------------------------------------------------------------------------------------------------------
const VENUE_SORT = { newest: 'decided', name: 'name', rating: 'rating', capacity: 'capacity' }
const NEW_DAYS = 21

// params: { status: 'live' | 'suspended', q, city, sort, page }
export async function listVenues(params) {
  const status = params.status === 'suspended' ? 'suspended' : 'approved'
  const data = await apiFetch(`/admin/venues?${query({ status, q: params.q, city: params.city, sort: VENUE_SORT[params.sort] ?? 'decided', page: params.page || 1, pageSize: PAGE_SIZE })}`)
  return {
    rows: data.rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      area: row.area,
      venueType: row.venueType,
      capacity: row.capacity,
      rating: row.rating,
      reviewCount: row.reviewCount,
      image: row.coverUrl ?? '',
      ownerName: row.owner.name,
      source: row.decidedAt && Date.now() - Date.parse(row.decidedAt) < NEW_DAYS * DAY ? 'listing' : 'catalog',
      listedAt: row.decidedAt ?? row.submittedAt,
      suspended: row.status === 'suspended' ? { at: row.decidedAt ?? row.submittedAt, reason: row.suspensionReason ?? '' } : null,
    })),
    total: data.total,
    page: data.page,
    pageCount: data.pageCount,
    pageSize: data.pageSize,
    counts: { live: data.counts.approved, suspended: data.counts.suspended },
    cities: data.cities,
  }
}

export async function suspendVenue(id, _name, reason) {
  const text = reason?.trim()
  await apiFetch(`/admin/venues/${encodeURIComponent(id)}/suspend`, { method: 'POST', body: { reason: text && text.length >= 5 ? text : 'No reason given.' } })
  changed()
}

export async function unsuspendVenue(id) {
  await apiFetch(`/admin/venues/${encodeURIComponent(id)}/unsuspend`, { method: 'POST', body: {} })
  changed()
}

// ---------------------------------------------------------------------------------------------------------------
// Users (REQ-47)
// ---------------------------------------------------------------------------------------------------------------
// GET/POST/DELETE /api/admin/users... (server/openapi.yaml "Admin", srs-alignment #40). Every action needs a reason
// and is written to admin_audit_log by the server.
export const USER_STATUSES = ['active', 'suspended', 'deleted']

// params: { role, status, q, page } -> { rows, total, page, pageCount, pageSize, counts }
export async function listUsers(params) {
  return apiFetch(`/admin/users?${query({ role: params.role, status: params.status || 'all', q: params.q?.trim(), page: params.page || 1, pageSize: PAGE_SIZE })}`)
}

// -> { user, history } or null when it doesn't exist
export async function getUser(id) {
  try {
    return await apiFetch(`/admin/users/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
  }
}

// action: 'suspend' | 'reactivate' | 'delete'. 409s (SELF_ACTION, LAST_ADMIN, INVALID_STATUS) carry a message.
export async function setUserState(id, action, reason) {
  const path = `/admin/users/${encodeURIComponent(id)}`
  if (action === 'delete') await apiFetch(path, { method: 'DELETE', body: { reason } })
  else await apiFetch(`${path}/${action}`, { method: 'POST', body: { reason } })
  changed()
}

// body: { role, reason, businessName?, contactNumber?, bio?, city? }. 409 HAS_VENUES / HAS_ACTIVE_BOOKINGS.
export async function changeUserRole(id, body) {
  const result = await apiFetch(`/admin/users/${encodeURIComponent(id)}/role`, { method: 'POST', body })
  changed()
  return result
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
// Audit log (NFR-4): venue and photo decisions from GET /api/admin/audit; user, dispute and report actions are
// still the local demo log until those modules exist on the server.
// ---------------------------------------------------------------------------------------------------------------
const LOCAL_ACTIONS = new Set(['dispute', 'report'])

export async function listAudit({ q, action, page }) {
  if (LOCAL_ACTIONS.has(action)) {
    const all = store.get().audit
    const rows = all.filter((entry) => entry.action.startsWith(`${action}.`) && matchesQuery(q, entry.targetLabel, entry.adminName, entry.action, JSON.stringify(entry.details)))
    return paginate(rows, page)
  }
  const data = await apiFetch(`/admin/audit?${query({ q, action, page: page || 1, pageSize: PAGE_SIZE })}`)
  return { rows: data.rows, total: data.total, page: data.page, pageCount: data.pageCount, pageSize: data.pageSize }
}

// ---------------------------------------------------------------------------------------------------------------
// Overview, sidebar badges and notifications
// ---------------------------------------------------------------------------------------------------------------
function applyStats(stats) {
  cachedCounts.pending = stats.kpis.pendingApprovals
  cachedCounts.images = stats.kpis.flaggedImages
  cachedCounts.edits = stats.kpis.pendingEdits ?? 0
  cachedCounts.reviews = stats.kpis.reportedReviews ?? 0
  cachedCounts.loaded = true
}

// Sync, for the sidebar badges (they re-read on every store change). The first call loads the numbers.
export function navCounts() {
  if (!cachedCounts.loaded && !cachedCounts.loading) {
    cachedCounts.loading = true
    apiFetch('/admin/stats')
      .then((stats) => {
        applyStats(stats)
        changed()
      })
      .catch(() => {})
      .finally(() => {
        cachedCounts.loading = false
      })
  }
  const state = store.get()
  return {
    approvals: cachedCounts.pending,
    images: cachedCounts.images,
    edits: cachedCounts.edits,
    reviews: cachedCounts.reviews,
    reports: state.disputes.filter((d) => d.status === 'open').length + state.reports.filter((r) => r.status === 'open').length,
  }
}

// GET /api/admin/stats, plus the demo disputes / reports for the attention list and activity feed.
export async function getOverview() {
  const stats = await apiFetch('/admin/stats')
  applyStats(stats)
  const state = store.get()
  const pkWeekStart = (week) => Date.parse(`${week}T00:00:00+05:00`)
  const attention = [
    ...stats.oldPending.map((v) => ({ id: v.id, kind: 'approval', title: v.name, detail: `Waiting for review since ${v.submittedAt}`, at: v.submittedAt, to: `/admin/approvals/${v.id}` })),
    ...(stats.kpis.flaggedImages
      ? [{ id: 'flagged-photos', kind: 'image', title: `${stats.kpis.flaggedImages} photo${stats.kpis.flaggedImages === 1 ? '' : 's'} flagged by the AI check`, detail: 'Keep or remove each one', at: new Date().toISOString(), to: '/admin/images' }]
      : []),
    ...state.disputes.filter((d) => d.status === 'open').map((d) => ({ id: d.id, kind: 'dispute', title: `Dispute on ${d.bookingId}`, detail: d.venueName, at: d.createdAt, to: `/admin/reports?tab=disputes&status=open#${d.id}` })),
    ...state.reports.filter((r) => r.status === 'open').map((r) => ({ id: r.id, kind: 'report', title: `Report on ${r.venueName}`, detail: REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason, at: r.createdAt, to: `/admin/reports?tab=reports&status=open#${r.id}` })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const activity = [
    ...stats.activity.map((entry) => ({ id: entry.id, kind: 'audit', action: entry.action, actor: entry.actor, target: entry.target, at: entry.at })),
    ...stats.submissions.map((s) => ({ id: `sub-${s.id}-${s.submittedAt}`, kind: 'submission', action: 'venue.submit', actor: s.ownerName, target: s.name, at: s.submittedAt })),
    ...state.reports.map((r) => ({ id: `rep-${r.id}`, kind: 'report', action: 'report.create', actor: r.reporter, target: r.venueName, at: r.createdAt })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8)

  return {
    kpis: stats.kpis,
    weeks: stats.weeks.map((w) => ({ start: pkWeekStart(w.week), submitted: w.submitted, approved: w.approved })),
    attention,
    activity,
  }
}

export async function getNotifications() {
  const state = store.get()
  const readAt = state.notificationsReadAt ? Date.parse(state.notificationsReadAt) : 0
  const pending = await apiFetch(`/admin/venues?${query({ status: 'pending', sort: 'newest', pageSize: 10 })}`).catch(() => ({ rows: [] }))
  const items = [
    ...pending.rows.map((v) => ({ id: `n-sub-${v.id}`, text: `${v.name} was submitted for review`, at: v.submittedAt, to: `/admin/approvals/${v.id}` })),
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

// Global search in the top bar: venues of any status and users by name, email or mobile (both from the server).
export async function searchAdmin(q) {
  if (!q.trim()) return []
  const data = await apiFetch(`/admin/venues?${query({ q: q.trim(), sort: 'name', pageSize: 6 })}`).catch(() => ({ rows: [] }))
  const venues = data.rows.map((v) => {
    const live = v.status === 'approved' || v.status === 'suspended'
    return {
      id: v.id,
      kind: live ? 'Venue' : 'Listing',
      label: v.name,
      detail: `${v.city} · ${v.status.replace('_', ' ')}`,
      to: live ? `/admin/venues?q=${encodeURIComponent(v.name)}${v.status === 'suspended' ? '&status=suspended' : ''}` : `/admin/approvals/${v.id}`,
    }
  })
  const people = await apiFetch(`/admin/users?${query({ q: q.trim(), status: 'all', pageSize: 4 })}`).catch(() => ({ rows: [] }))
  const users = people.rows.map((u) => ({ id: u.id, kind: 'User', label: u.name, detail: u.email, to: `/admin/users?q=${encodeURIComponent(u.email)}&user=${u.id}` }))
  return [...venues, ...users].slice(0, 8)
}

// Resets the demo-only admin data (disputes, reports). Users, bookings and invitations are on the server.
export function resetDemoData() {
  store.reset()
}

// ---------------------------------------------------------------------------------------------------------------
// AI image check test (REQ-9 demo): GET /api/admin/image-detection, POST /api/admin/image-detection/test
// ---------------------------------------------------------------------------------------------------------------
// { provider: 'sightengine' | 'fake', live, timeoutMs, flagThreshold, genuineThreshold }
export function getImageDetectionStatus() {
  return apiFetch('/admin/image-detection')
}

// Runs one photo through the live AI check (nothing is stored but an audit row).
// -> { provider, live, score (0..1), verdict: 'genuine' | 'flagged', highConfidence, thresholds, durationMs }
export async function testImageDetection(file) {
  const form = new FormData()
  form.append('file', file, file.name || 'photo.jpg')
  const result = await apiFetch('/admin/image-detection/test', { method: 'POST', body: form })
  changed() // the audit log has a new row
  return result
}

// ---------------------------------------------------------------------------------------------------------------
// Edits to live venues (REQ-5 "changed venue goes to Admin approval", srs-alignment #35)
// ---------------------------------------------------------------------------------------------------------------
export const REVISION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn']

// GET /api/admin/revisions -> { rows, total, page, pageCount, pageSize, counts }
export async function listRevisions({ status = 'pending', page = 1 } = {}) {
  const data = await apiFetch(`/admin/revisions?${query({ status, page, pageSize: PAGE_SIZE })}`)
  cachedCounts.edits = data.counts.pending
  return data
}

// GET /api/admin/revisions/:id -> the revision with old versus new per changed field, or null.
export async function getRevision(id) {
  try {
    const { revision } = await apiFetch(`/admin/revisions/${encodeURIComponent(id)}`)
    return revision
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function approveRevision(id) {
  await apiFetch(`/admin/revisions/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} })
  cachedCounts.edits = Math.max(0, cachedCounts.edits - 1)
  changed()
}

export async function rejectRevision(id, reason) {
  await apiFetch(`/admin/revisions/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason } })
  cachedCounts.edits = Math.max(0, cachedCounts.edits - 1)
  changed()
}

// ---------------------------------------------------------------------------------------------------------------
// Review moderation (REQ-44, EUC-34)
// ---------------------------------------------------------------------------------------------------------------
export const REVIEW_STATUSES = ['reported', 'hidden', 'all']

// GET /api/admin/reviews -> { rows, total, page, pageCount, pageSize, counts: { reported, hidden, all } }
export async function listModerationReviews({ status = 'reported', q = '', page = 1 } = {}) {
  const data = await apiFetch(`/admin/reviews?${query({ status, q, page, pageSize: PAGE_SIZE })}`)
  cachedCounts.reviews = data.counts.reported
  return data
}

// action: 'hide' | 'restore' | 'dismiss' | 'delete'; a reason is always required (audited). -> { avgRating }
export async function moderateReview(id, action, reason) {
  const path = `/admin/reviews/${encodeURIComponent(id)}`
  const result =
    action === 'delete'
      ? await apiFetch(path, { method: 'DELETE', body: { reason } })
      : await apiFetch(`${path}/${action}`, { method: 'POST', body: { reason } })
  changed()
  return result
}
