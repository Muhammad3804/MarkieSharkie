import { notifyAdminChange, notifyCountsChange } from '../features/admin/changes.js'
import { getSessionUser } from './auth.js'
import { ApiError, apiFetch } from './http.js'
import { listingToDraft, toHistory } from './listings.js'
import { PAKISTAN_BOUNDS, CITIES } from '../features/host/options.js'
import { REPORT_REASONS } from '../features/admin/format.js'

export { REPORT_REASONS }

// Admin API (REQ-7, 9, 10, 47, 48, NFR-4 audit). Venues, approvals, photo checks, the dashboard and the venue /
// photo audit log, users (REQ-47), disputes and listing reports (REQ-48) all come from the server (/api/admin/...).
// Every write is checked (role = admin) and written to admin_audit_log by the server (NFR-4); after a write the admin
// pages refetch through the change signal in features/admin/changes.js.
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

const DAY = 24 * 3600000
export const PAGE_SIZE = 10

export const APPROVAL_STATUSES = ['pending', 'changes_requested', 'approved', 'rejected']
const cachedCounts = { pending: 0, images: 0, edits: 0, reviews: 0, loaded: false, loading: false }
// After a write: badges reload and admin pages refetch (features/admin/hooks.js).
const changed = () => {
  cachedCounts.stale = true
  notifyAdminChange()
}

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
// Disputes (REQ-48, EUC-35) and listing reports (srs-alignment #41): /api/admin/disputes, /api/admin/venue-reports
// ---------------------------------------------------------------------------------------------------------------
export const DISPUTE_STATUSES = ['open', 'under_review', 'resolved', 'rejected']
export const REPORT_STATUSES = ['open', 'under_review', 'resolved']

// params: { status, category, q, page } -> { rows, total, page, pageCount, pageSize, counts }
export function listDisputes({ status = 'open', category = '', q = '', page = 1 } = {}) {
  return apiFetch(`/admin/disputes?${query({ status, category, q: q.trim(), page, pageSize: PAGE_SIZE })}`)
}

// -> { dispute, booking } or null
export async function getDispute(id) {
  try {
    return await apiFetch(`/admin/disputes/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
  }
}

// action: 'take' | 'resolve' ({ outcome, compensation?, resolution }) | 'reject' ({ reason }) | 'note' ({ body, internal })
export async function actOnDispute(id, action, body = {}) {
  const path = action === 'note' ? 'notes' : action
  const result = await apiFetch(`/admin/disputes/${encodeURIComponent(id)}/${path}`, { method: 'POST', body })
  changed()
  return result
}

export function listReports({ status = 'open', page = 1 } = {}) {
  return apiFetch(`/admin/venue-reports?${query({ status, page, pageSize: PAGE_SIZE })}`)
}

// status: 'under_review' (take) | 'resolved' (with a resolution)
export async function updateReport(id, { status, resolution = '' }) {
  const path = `/admin/venue-reports/${encodeURIComponent(id)}`
  if (status === 'resolved') await apiFetch(`${path}/resolve`, { method: 'POST', body: { resolution: resolution.trim() } })
  else await apiFetch(`${path}/take`, { method: 'POST', body: {} })
  changed()
}

// Evidence photos are private: fetched with the admin's token and shown from a blob URL (caller revokes it).
export async function evidenceUrl(apiPath) {
  return URL.createObjectURL(await apiFetch(apiPath.replace(/^\/api/, ''), { as: 'blob' }))
}

// ---------------------------------------------------------------------------------------------------------------
// Audit log (NFR-4): GET /api/admin/audit (venues, photos, reviews, users, disputes, reports)
// ---------------------------------------------------------------------------------------------------------------
export async function listAudit({ q, action, page }) {
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
  cachedCounts.reports = (stats.kpis.openDisputes ?? 0) + (stats.kpis.openReports ?? 0)
  cachedCounts.loaded = true
}

// Sync, for the sidebar badges (they re-read on every change signal). Loads the numbers on first use and again after
// each write (`changed` marks them stale); the reload signals once more, by which time they are fresh.
export function navCounts() {
  if ((!cachedCounts.loaded || cachedCounts.stale) && !cachedCounts.loading) {
    cachedCounts.stale = false
    cachedCounts.loading = true
    apiFetch('/admin/stats')
      .then((stats) => {
        applyStats(stats)
        notifyCountsChange()
      })
      .catch(() => {})
      .finally(() => {
        cachedCounts.loading = false
      })
  }
  return {
    approvals: cachedCounts.pending,
    images: cachedCounts.images,
    edits: cachedCounts.edits,
    reviews: cachedCounts.reviews,
    reports: cachedCounts.reports ?? 0,
  }
}

const reasonLabel = (value) => REPORT_REASONS.find((x) => x.value === value)?.label ?? value

// GET /api/admin/stats plus the oldest open disputes and listing reports for the attention list.
export async function getOverview() {
  const [stats, disputes, reports] = await Promise.all([
    apiFetch('/admin/stats'),
    listDisputes({ status: 'open' }).catch(() => ({ rows: [] })),
    listReports({ status: 'open' }).catch(() => ({ rows: [] })),
  ])
  applyStats(stats)
  const pkWeekStart = (week) => Date.parse(`${week}T00:00:00+05:00`)
  const attention = [
    ...stats.oldPending.map((v) => ({ id: v.id, kind: 'approval', title: v.name, detail: `Waiting for review since ${v.submittedAt}`, at: v.submittedAt, to: `/admin/approvals/${v.id}` })),
    ...(stats.kpis.flaggedImages
      ? [{ id: 'flagged-photos', kind: 'image', title: `${stats.kpis.flaggedImages} photo${stats.kpis.flaggedImages === 1 ? '' : 's'} flagged by the AI check`, detail: 'Keep or remove each one', at: new Date().toISOString(), to: '/admin/images' }]
      : []),
    ...disputes.rows.map((d) => ({ id: d.id, kind: 'dispute', title: `Dispute on ${d.reference}`, detail: d.venue.name, at: d.createdAt, to: `/admin/reports?dispute=${d.id}` })),
    ...reports.rows.map((r) => ({ id: r.id, kind: 'report', title: `Report on ${r.venueName}`, detail: reasonLabel(r.reason), at: r.createdAt, to: `/admin/reports?tab=reports#${r.id}` })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const activity = [
    ...stats.activity.map((entry) => ({ id: entry.id, kind: 'audit', action: entry.action, actor: entry.actor, target: entry.target, at: entry.at })),
    ...stats.submissions.map((s) => ({ id: `sub-${s.id}-${s.submittedAt}`, kind: 'submission', action: 'venue.submit', actor: s.ownerName, target: s.name, at: s.submittedAt })),
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

// When this admin last opened the bell (per browser; a convenience, not shared state).
const READ_KEY = 'markiesharkie:admin-notifications-read'
function readAt() {
  try {
    return Number(localStorage.getItem(READ_KEY)) || 0
  } catch {
    return 0
  }
}

export async function getNotifications() {
  const since = readAt()
  const [pending, disputes, reports] = await Promise.all([
    apiFetch(`/admin/venues?${query({ status: 'pending', sort: 'newest', pageSize: 10 })}`).catch(() => ({ rows: [] })),
    listDisputes({ status: 'open' }).catch(() => ({ rows: [] })),
    listReports({ status: 'open' }).catch(() => ({ rows: [] })),
  ])
  const items = [
    ...pending.rows.map((v) => ({ id: `n-sub-${v.id}`, text: `${v.name} was submitted for review`, at: v.submittedAt, to: `/admin/approvals/${v.id}` })),
    ...reports.rows.map((r) => ({ id: `n-rep-${r.id}`, text: `New report on ${r.venueName}`, at: r.createdAt, to: `/admin/reports?tab=reports#${r.id}` })),
    ...disputes.rows.map((d) => ({ id: `n-dis-${d.id}`, text: `Dispute opened on ${d.reference}`, at: d.createdAt, to: `/admin/reports?dispute=${d.id}` })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 10)
    .map((item) => ({ ...item, unread: Date.parse(item.at) > since }))
  return { items, unread: items.filter((i) => i.unread).length }
}

export function markNotificationsRead() {
  try {
    localStorage.setItem(READ_KEY, String(Date.now()))
  } catch {
    // storage blocked: the badge comes back on the next load
  }
  notifyAdminChange()
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
