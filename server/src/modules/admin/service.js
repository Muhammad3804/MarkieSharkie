import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { env } from '../../config/env.js'
import { classifyScore, detectAiImage, detectorInfo } from '../../integrations/imageDetection.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { detectFileType, UPLOAD_RULES } from '../../lib/fileType.js'
import { logger } from '../../lib/logger.js'
import { absolute, toListing, toVenueDetail } from '../venues/mappers.js'
import { generateSlots, loadVenueBundle } from '../venues/repository.js'
import * as edits from '../owner/editRepository.js'
import { applyRevision, removeFiles } from '../owner/editService.js'
import { revisionDiff } from '../owner/revisionModel.js'
import * as repo from './repository.js'

// Admin venue moderation (REQ-7, REQ-9, REQ-10, srs-alignment #18 / #29). Each decision locks the venue row,
// checks the transition, changes it and writes admin_audit_log in ONE transaction (NFR-4).
//
//   pending / changes_requested --approve--> approved (photos published, 60 days of slots created)
//   pending / changes_requested --reject (reason)--> rejected
//   pending --request changes (note)--> changes_requested
//   approved --suspend (reason)--> suspended --unsuspend--> approved
//   changes_requested / rejected --owner resubmits--> pending

const STATUSES = ['pending', 'changes_requested', 'approved', 'rejected', 'suspended']
const DECIDABLE = new Set(['pending', 'changes_requested'])
const SLOT_DAYS = 60
const venueNotFound = () => notFoundError('We couldn’t find that venue.')
const invalidStatus = (name, status) =>
  new AppError(
    409,
    'INVALID_STATUS',
    `${name} is ${status.replace('_', ' ')}, so that can’t be done now. Refresh the page.`,
  )

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))

function toRow(r, origin) {
  return {
    id: r.venue_id,
    name: r.name,
    city: r.city,
    area: r.area ?? '',
    category: r.category ?? '',
    venueType: r.venue_type,
    capacity: r.capacity,
    hallCount: r.hall_count,
    photoCount: r.photo_count,
    flaggedPhotos: r.flagged_count,
    basePrice: r.base_price,
    rating: r.review_count > 0 ? Number(r.avg_rating) : 0,
    reviewCount: r.review_count,
    owner: { name: r.owner_name, email: r.owner_email, phone: r.owner_phone },
    status: r.approval_status,
    isActive: r.is_active,
    submittedAt: iso(r.submitted_at ?? r.created_at),
    decidedAt: iso(r.reviewed_at),
    rejectionReason: r.rejection_reason,
    changesNote: r.changes_note,
    suspensionReason: r.suspension_reason,
    coverUrl: r.cover_url ? absolute(origin, r.cover_url) : null,
  }
}

export async function listVenues(query, { origin }) {
  const filters = { ...query, from: query.submittedFrom, to: query.submittedTo }
  const [{ rows, total }, counts, cities] = await Promise.all([
    repo.listVenues(pool, filters),
    repo.statusCounts(pool),
    repo.venueCities(pool),
  ])
  return {
    rows: rows.map((r) => toRow(r, origin)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])),
    cities,
  }
}

// Everything the review page needs: the structured listing (the client rebuilds the wizard draft from it), the
// venue as customers would see it (all photos, published or not) and the decision history.
export async function getVenue(id, { origin }) {
  const bundle = await loadVenueBundle(pool, id, { publishedOnly: false })
  if (!bundle) throw venueNotFound()
  const history = await repo.venueHistory(pool, id)
  return {
    listing: toListing(bundle, origin),
    venue: toVenueDetail(bundle, { origin }),
    history: history.map((h) => ({ action: h.action, details: h.details, at: iso(h.created_at), by: h.admin_name })),
  }
}

async function decide(adminId, id, { allowed, apply, action, details }) {
  await withTransaction(async (client) => {
    const [venue] = await repo.lockVenues(client, [id])
    if (!venue) throw venueNotFound()
    if (!allowed.has(venue.approval_status)) throw invalidStatus(venue.name, venue.approval_status)
    await apply(client, venue)
    await repo.insertAudit(client, {
      adminId,
      action,
      targetTable: 'venues',
      targetId: id,
      details: { from: venue.approval_status, ...details },
    })
  })
}

async function approveLocked(client, venueId, adminId) {
  await repo.approveVenue(client, { venueId, adminId })
  await generateSlots(client, venueId, { days: SLOT_DAYS })
}

export async function approve(adminId, id, { checklist } = {}) {
  await decide(adminId, id, {
    allowed: DECIDABLE,
    apply: (client) => approveLocked(client, id, adminId),
    action: 'venue.approve',
    details: checklist ? { checklist } : {},
  })
}

export async function reject(adminId, id, { reason }) {
  await decide(adminId, id, {
    allowed: DECIDABLE,
    apply: (client) => repo.setDecision(client, { venueId: id, status: 'rejected', rejectionReason: reason }),
    action: 'venue.reject',
    details: { reason },
  })
}

export async function requestChanges(adminId, id, { note }) {
  await decide(adminId, id, {
    allowed: new Set(['pending']),
    apply: (client) => repo.setDecision(client, { venueId: id, status: 'changes_requested', changesNote: note }),
    action: 'venue.request_changes',
    details: { note },
  })
}

export async function suspend(adminId, id, { reason }) {
  await decide(adminId, id, {
    allowed: new Set(['approved']),
    apply: (client) => repo.setSuspended(client, { venueId: id, suspended: true, reason }),
    action: 'venue.suspend',
    details: { reason },
  })
}

export async function unsuspend(adminId, id) {
  await decide(adminId, id, {
    allowed: new Set(['suspended']),
    apply: (client) => repo.setSuspended(client, { venueId: id, suspended: false }),
    action: 'venue.unsuspend',
    details: {},
  })
}

// All or nothing: every listing must exist and be decidable, otherwise nothing is approved (409 lists them).
export async function bulkApprove(adminId, { ids }) {
  const unique = [...new Set(ids)]
  await withTransaction(async (client) => {
    const venues = await repo.lockVenues(client, unique)
    const blocked = [
      ...unique
        .filter((id) => !venues.some((v) => v.venue_id === id))
        .map((id) => ({ field: id, message: 'Not found.' })),
      ...venues
        .filter((v) => !DECIDABLE.has(v.approval_status))
        .map((v) => ({ field: v.venue_id, message: `${v.name} is ${v.approval_status}.` })),
    ]
    if (blocked.length) {
      throw new AppError(409, 'INVALID_STATUS', 'Some listings can’t be approved now. Nothing was changed.', blocked)
    }
    for (const venue of venues) {
      await approveLocked(client, venue.venue_id, adminId)
      await repo.insertAudit(client, {
        adminId,
        action: 'venue.approve',
        targetTable: 'venues',
        targetId: venue.venue_id,
        details: { from: venue.approval_status, bulk: unique.length },
      })
    }
  })
  return { approved: unique.length }
}

// ---------------------------------------------------------------- photos (REQ-9, REQ-10)

export async function listImages({ status }, { origin }) {
  const [rows, counts] = await Promise.all([repo.listImages(pool, { status }), repo.imageCounts(pool)])
  return {
    images: rows.map((r) => ({
      id: r.image_id,
      venueId: r.venue_id,
      venueName: r.venue_name,
      ownerName: r.owner_name,
      imageUrl: absolute(origin, r.image_url),
      fileName: r.image_url.split('/').pop(),
      category: r.category,
      aiScore: r.ai_score === null ? null : Number(r.ai_score),
      status: r.verification_status,
      uploadedAt: iso(r.uploaded_at),
      checkedAt: iso(r.checked_at),
      highConfidence: r.ai_score !== null && Number(r.ai_score) >= env.imageDetection.flagThreshold,
    })),
    counts: Object.fromEntries(
      ['flagged', 'approved', 'rejected', 'genuine'].map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0]),
    ),
  }
}

// keep (approved: published if the venue is live) or remove (rejected: never published). Flagged photos only.
export async function decideImage(adminId, imageId, { decision }) {
  await withTransaction(async (client) => {
    const image = await repo.lockImage(client, imageId)
    if (!image) throw notFoundError('We couldn’t find that photo.')
    if (image.verification_status !== 'flagged') {
      throw new AppError(409, 'INVALID_STATUS', `This photo is already ${image.verification_status}. Refresh the page.`)
    }
    await repo.decideImage(client, { imageId, adminId, decision })
    await repo.insertAudit(client, {
      adminId,
      action: decision === 'approved' ? 'image.keep' : 'image.remove',
      targetTable: 'venue_images',
      targetId: imageId,
      details: { venueId: image.venue_id },
    })
  })
}

// ---------------------------------------------------------------- dashboard + audit

export async function getStats() {
  const [n, weeks, old, submissions, audit] = await Promise.all([
    repo.dashboardNumbers(pool),
    repo.weeklySubmissions(pool, 12),
    repo.oldPending(pool),
    repo.recentSubmissions(pool),
    repo.recentAudit(pool),
  ])
  return {
    kpis: {
      pendingApprovals: n.pending,
      pendingNewThisWeek: n.pending_this_week,
      liveVenues: n.live,
      suspendedVenues: n.suspended,
      users: n.customers + n.venue_owners + n.decorators,
      usersByRole: { customer: n.customers, venue_owner: n.venue_owners, decorator: n.decorators },
      bookingsThisMonth: n.bookings_this_month,
      flaggedImages: n.flagged_images,
      pendingEdits: n.pending_edits,
      reportedReviews: n.reported_reviews, // REQ-44 moderation queue // edits to live venues waiting for approval (srs-alignment #35)
      openDisputes: n.open_disputes, // REQ-48, not yet taken by an admin
      openReports: n.open_reports, // "Report this listing", not yet taken
    },
    weeks: weeks.map((w) => ({ week: w.week, submitted: w.submitted, approved: w.approved })),
    oldPending: old.map((r) => ({ id: r.venue_id, name: r.name, submittedAt: iso(r.submitted_at) })),
    submissions: submissions.map((r) => ({
      id: r.venue_id,
      name: r.name,
      ownerName: r.owner_name,
      submittedAt: iso(r.submitted_at),
    })),
    activity: audit.map((r) => ({
      id: r.log_id,
      action: r.action,
      actor: r.admin_name,
      target: r.target_label,
      at: iso(r.created_at),
    })),
  }
}

export async function listAudit(query) {
  const { rows, total } = await repo.listAudit(pool, query)
  return {
    rows: rows.map((r) => ({
      logId: r.log_id,
      action: r.action,
      adminName: r.admin_name,
      targetTable: r.target_table,
      targetId: r.target_id,
      targetLabel: r.target_label ?? '',
      details: r.details,
      createdAt: iso(r.created_at),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  }
}

// ---------------------------------------------------------------- AI image check test (REQ-9, for demos)

// Which detector is running (live Sightengine or the fake one) and its thresholds.
export const imageDetectionStatus = () => detectorInfo()

// Runs one photo through the same detector and the same genuine / flagged rule as real uploads, and says how long it
// took. Nothing is stored except an audit row (who tested, the score and the verdict, never the photo).
export async function testImageDetection(adminId, file) {
  const rules = UPLOAD_RULES.photo
  if (!file?.buffer?.length)
    throw new AppError(400, 'VALIDATION_ERROR', 'Choose a photo to test.', [
      { field: 'file', message: 'Choose a photo to test.' },
    ])
  const type = detectFileType(file.buffer)
  if (!type || !rules.types.includes(type.mime)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', rules.label, [{ field: 'file', message: rules.label }])
  }
  if (file.size > rules.maxBytes)
    throw new AppError(413, 'FILE_TOO_LARGE', rules.label, [{ field: 'file', message: rules.label }])

  const info = detectorInfo()
  const started = performance.now()
  let score
  try {
    ;({ score } = await detectAiImage({ buffer: file.buffer, mimeType: type.mime, fileName: `test.${type.ext}` }))
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' ? `no answer within ${Math.round(info.timeoutMs / 1000)} seconds` : err.message
    logger.warn({ err: { message: err.message } }, 'AI image check test failed')
    throw new AppError(
      502,
      'DETECTOR_UNAVAILABLE',
      `The AI check isn’t working right now (${reason}). Uploaded photos stay pending until it works again.`,
    )
  }
  const durationMs = Math.round(performance.now() - started)
  const verdict = classifyScore(score)
  const result = {
    provider: info.provider,
    live: info.live,
    score: Math.round(score * 1000) / 1000,
    verdict,
    highConfidence: score >= info.flagThreshold,
    thresholds: { genuine: info.genuineThreshold, flag: info.flagThreshold },
    durationMs,
    checkedAt: new Date().toISOString(),
  }
  await repo.insertAudit(pool, {
    adminId,
    action: 'image.detection_test',
    targetTable: 'admins',
    targetId: adminId,
    details: { provider: result.provider, score: result.score, verdict, durationMs },
  })
  return result
}

// ---------------------------------------------------------------- edits to live venues (REQ-5, srs-alignment #35)

const revisionNotFound = () => notFoundError('We couldn’t find that change request.')

function toRevisionRow(r, origin) {
  const diff = revisionDiff(r.previous, r.changes, origin)
  return {
    id: r.revision_id,
    venueId: r.venue_id,
    venueName: r.venue_name,
    city: r.city,
    ownerName: r.owner_name,
    status: r.status,
    submittedAt: iso(r.submitted_at),
    decidedAt: iso(r.decided_at),
    note: r.admin_note,
    changeCount: diff.length,
    sections: [...new Set(diff.map((d) => d.section))],
  }
}

export async function listRevisions(query, { origin }) {
  const rows = await edits.listRevisions(pool, {
    status: query.status,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })
  const total = rows[0]?.total ?? 0
  const counts = await edits.revisionCounts(pool)
  return {
    rows: rows.map((r) => toRevisionRow(r, origin)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    counts: Object.fromEntries(
      ['pending', 'approved', 'rejected', 'withdrawn'].map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0]),
    ),
  }
}

// Old versus new for every changed field, plus the venue as it is live now.
export async function getRevision(id, { origin }) {
  const r = await edits.findRevision(pool, id)
  if (!r) throw revisionNotFound()
  return {
    revision: {
      ...toRevisionRow(r, origin),
      venueStatus: r.approval_status,
      venueActive: r.is_active,
      ownerEmail: r.owner_email,
      changes: revisionDiff(r.previous, r.changes, origin),
    },
  }
}

async function decideRevision(adminId, id, decide) {
  let removed = []
  await withTransaction(async (client) => {
    const rev = await edits.lockRevision(client, id)
    if (!rev) throw revisionNotFound()
    if (rev.status !== 'pending')
      throw new AppError(
        409,
        'INVALID_STATUS',
        `This change request is ${rev.status}, so it can’t be decided now. Refresh the page.`,
      )
    const venue = await edits.lockVenue(client, rev.venue_id)
    removed = (await decide(client, rev, venue)) ?? []
  })
  removeFiles(removed)
}

export async function approveRevision(adminId, id) {
  await decideRevision(adminId, id, async (client, rev, venue) => {
    if (venue.approval_status !== 'approved') throw invalidStatus(venue.name, venue.approval_status)
    const labels = revisionDiff(rev.previous, rev.changes).map((d) => d.label)
    const { removedUrls } = await applyRevision(client, rev)
    await edits.setRevisionStatus(client, rev.revision_id, { status: 'approved', adminId })
    await repo.insertAudit(client, {
      adminId,
      action: 'venue.revision_approve',
      targetTable: 'venues',
      targetId: rev.venue_id,
      details: { revisionId: rev.revision_id, changes: labels },
    })
    return removedUrls
  })
}

export async function rejectRevision(adminId, id, { reason }) {
  await decideRevision(adminId, id, async (client, rev) => {
    await edits.setRevisionStatus(client, rev.revision_id, { status: 'rejected', adminId, note: reason })
    await repo.insertAudit(client, {
      adminId,
      action: 'venue.revision_reject',
      targetTable: 'venues',
      targetId: rev.venue_id,
      details: { revisionId: rev.revision_id, reason },
    })
  })
}
