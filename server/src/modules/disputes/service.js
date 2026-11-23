import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { env } from '../../config/env.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { detectFileType, UPLOAD_RULES } from '../../lib/fileType.js'
import { logger } from '../../lib/logger.js'
import { validationError } from '../../lib/validation.js'
import { getStorage } from '../../integrations/storage.js'
import { sendDisputeDecisionEmail } from '../../integrations/mailer.js'
import { insertAudit } from '../admin/repository.js'
import { bookingReference, loadBooking } from '../bookings/service.js'
import { paisa } from '../owner/money.js'
import * as repo from './repository.js'

// REQ-48 / EUC-35 (srs-alignment #41). A dispute is raised on a booking by one of its two parties: the customer or
// the owner of its venue. Both parties see it (and its non-internal notes and evidence); nobody else does (404, so
// ids can't be probed). The admin moves it open -> under_review -> resolved (outcome, optional compensation that is
// only recorded, REQ-25) or rejects it (open / under_review -> rejected). Every admin step is audited (NFR-4) and
// both parties get an email after the decision commits ("notifies both").
// Also: venue reports ("Report this listing"), reviewed by an admin (open -> under_review -> resolved).

export const DISPUTE_CATEGORIES = [
  'service_not_as_described',
  'cancellation_refund',
  'pricing',
  'damage',
  'conduct',
  'other',
]
export const OUTCOMES = ['upheld', 'partially_upheld', 'dismissed']
const OUTCOME_LABELS = {
  upheld: 'Upheld: the complaint was justified',
  partially_upheld: 'Partly upheld',
  dismissed: 'Dismissed: no fault found',
}
export const REPORT_REASONS = ['inaccurate', 'fake_photos', 'not_real', 'pricing', 'offensive', 'other']

// Statuses a booking can be disputed in: there has to have been an agreement (or its end) to argue about.
const DISPUTABLE = new Set(['confirmed', 'completed', 'cancelled'])
const OPEN = new Set(['open', 'under_review'])
const FILES_PER_DAY = 20

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`)
const disputeNotFound = () => notFoundError('We couldn’t find that dispute.')
const isDeletedEmail = (email) => !email || String(email).endsWith('@deleted.invalid')
const fileUrl = (disputeId, fileId) => `/api/disputes/${disputeId}/files/${fileId}`

// 'customer' | 'venue_owner' when the user is that party of the booking, else null.
function partyRole(user, row) {
  if (user.role === 'customer' && row.customer_id === user.id) return 'customer'
  if (user.role === 'venue_owner' && row.owner_id === user.id) return 'venue_owner'
  return null
}

function summary(row) {
  return {
    id: row.dispute_id,
    bookingId: row.booking_id,
    reference: bookingReference(row.booking_id),
    category: row.category,
    description: row.reason,
    status: row.status,
    raisedByRole: row.raised_by_role,
    outcome: row.outcome,
    compensation: row.compensation_amount,
    resolution: row.resolution,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    resolvedAt: iso(row.resolved_at),
    fileCount: row.file_count,
    noteCount: row.note_count,
    booking: {
      eventName: row.event_name ?? '',
      eventDate: row.event_date,
      startTime: row.start_time,
      status: row.booking_status,
      closedAs: row.closed_as,
      totalAmount: row.total_amount,
      advanceDue: row.advance_due,
    },
    venue: { id: row.venue_id, name: row.venue_name, city: row.venue_city, business: row.business_name },
    customerName: row.customer_name,
  }
}

function partyView(row, user) {
  return {
    ...summary(row),
    raisedByYou: row.raised_by === user.id,
    yourRole: partyRole(user, row),
    canReply: OPEN.has(row.status),
  }
}

// ---------------------------------------------------------------- evidence

// file = multer's { buffer, size }. Same content check as venue photos (JPEG / PNG ≤ 5 MB, from the bytes).
// Stored under disputes/, which the public /uploads route refuses to serve (app.js).
export async function uploadEvidence(user, file) {
  const rules = UPLOAD_RULES.photo
  if (!file?.buffer?.length) throw validationError([{ field: 'file', message: 'Choose a photo to upload.' }])
  const type = detectFileType(file.buffer)
  if (!type || !rules.types.includes(type.mime))
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', rules.label, [{ field: 'file', message: rules.label }])
  if (file.size > rules.maxBytes)
    throw new AppError(413, 'FILE_TOO_LARGE', rules.label, [{ field: 'file', message: rules.label }])
  if ((await repo.countRecentFiles(pool, user.id)) >= FILES_PER_DAY)
    throw new AppError(429, 'UPLOAD_LIMIT', `You can upload up to ${FILES_PER_DAY} photos a day. Try again tomorrow.`)
  const saved = await getStorage().save(file.buffer, { folder: `disputes/user-${user.id}`, ext: type.ext })
  try {
    const row = await repo.insertFile(pool, {
      userId: user.id,
      storageKey: saved.key,
      mimeType: type.mime,
      size: file.size,
    })
    return { fileId: row.file_id, mimeType: type.mime, size: file.size }
  } catch (err) {
    await getStorage()
      .remove(saved.key)
      .catch(() => {})
    throw err
  }
}

// The bytes of one evidence photo, for a party of the dispute or an admin.
export async function readEvidence(user, disputeId, fileId) {
  const row = await repo.findDispute(pool, disputeId)
  if (!row || (user.role !== 'admin' && !partyRole(user, row))) throw disputeNotFound()
  const file = await repo.findFile(pool, { disputeId, fileId })
  if (!file) throw notFoundError('We couldn’t find that photo.')
  return { buffer: await getStorage().read(file.storage_key), mimeType: file.mime_type }
}

// ---------------------------------------------------------------- parties

export async function openDispute(user, bookingId, { category, description, evidenceIds }) {
  const disputeId = await withTransaction(async (client) => {
    const booking = await repo.bookingParties(client, bookingId)
    const role = booking && partyRole(user, booking)
    if (!role) throw notFoundError('We couldn’t find that booking.')
    if (!DISPUTABLE.has(booking.status))
      throw new AppError(
        409,
        'NOT_DISPUTABLE',
        'You can report a problem once the venue has confirmed the booking. For a pending request, cancel it instead.',
      )
    const ids = [...new Set(evidenceIds)]
    if (ids.length) {
      const mine = await repo.lockOwnLooseFiles(client, user.id, ids)
      if (mine.length !== ids.length)
        throw validationError([
          { field: 'evidenceIds', message: 'One of the photos is missing. Upload it again and retry.' },
        ])
    }
    let id
    try {
      id = await repo.insertDispute(client, {
        bookingId,
        raisedBy: user.id,
        raisedByRole: role,
        category,
        reason: description,
      })
    } catch (err) {
      if (err.code === '23505')
        throw new AppError(
          409,
          'DISPUTE_EXISTS',
          'You already have an open dispute on this booking. Add to it instead of opening another.',
        )
      throw err
    }
    if (ids.length) await repo.attachFiles(client, id, ids)
    return id
  })
  return getMyDispute(user, disputeId)
}

export async function listMyDisputes(user, { status, page, pageSize }) {
  const rows = await repo.listForParty(pool, user.id, { status, limit: pageSize, offset: (page - 1) * pageSize })
  const total = rows[0]?.total ?? 0
  return {
    data: rows.map((r) => partyView(r, user)),
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

async function details(db, row, { admin, user }) {
  const [files, notes] = await Promise.all([
    repo.disputeFiles(db, row.dispute_id),
    repo.disputeNotes(db, row.dispute_id, { includeInternal: admin }),
  ])
  return {
    files: files.map((f) => ({
      id: f.file_id,
      url: fileUrl(row.dispute_id, f.file_id),
      mimeType: f.mime_type,
      size: f.size_bytes,
      uploadedBy: admin ? f.uploader_name : undefined,
      byYou: user ? f.uploaded_by === user.id : undefined,
      fromRole: f.uploaded_by === row.customer_id ? 'customer' : 'venue_owner',
      createdAt: iso(f.created_at),
    })),
    notes: notes.map((n) => ({
      id: n.note_id,
      authorRole: n.author_role,
      // Parties don't see which admin wrote; admins do.
      authorName: n.author_role === 'admin' && !admin ? 'MarkieSharkie admin' : n.author_name,
      body: n.body,
      internal: admin ? n.internal : undefined,
      byYou: user ? n.author_id === user.id : undefined,
      createdAt: iso(n.created_at),
    })),
  }
}

export async function getMyDispute(user, disputeId) {
  const row = await repo.findDispute(pool, disputeId)
  if (!row || !partyRole(user, row)) throw disputeNotFound()
  return { dispute: { ...partyView(row, user), ...(await details(pool, row, { admin: false, user })) } }
}

export async function addPartyNote(user, disputeId, { body }) {
  await withTransaction(async (client) => {
    const locked = await repo.lockDispute(client, disputeId)
    const row = locked && (await repo.findDispute(client, disputeId))
    const role = row && partyRole(user, row)
    if (!role) throw disputeNotFound()
    if (!OPEN.has(locked.status))
      throw new AppError(409, 'DISPUTE_CLOSED', 'This dispute is closed. Open a new one if something else went wrong.')
    await repo.insertNote(client, { disputeId, authorId: user.id, authorRole: role, body })
    await repo.touchDispute(client, disputeId)
  })
  return getMyDispute(user, disputeId)
}

// ---------------------------------------------------------------- admin

export async function adminListDisputes({ status, category, q, page, pageSize }) {
  const rows = await repo.adminList(pool, {
    status,
    category,
    q: q ? escapeLike(q) : null,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const total = rows[0]?.total ?? 0
  return {
    rows: rows.map((r) => ({
      ...summary(r),
      raisedByName: r.raised_by_name,
      ownerName: r.owner_name,
      handledBy: r.admin_name,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts: await repo.disputeCounts(pool),
  }
}

// REQ-48 "admin reviews booking, quotations, payments": the dispute with the booking (price snapshot, status
// history from booking_events) and both parties' contact details. Quotations and payments arrive with their
// modules (out of scope here); the booking's total, advance and refund are what exists today.
export async function adminGetDispute(disputeId, { origin }) {
  const row = await repo.findDispute(pool, disputeId)
  if (!row) throw disputeNotFound()
  const booking = await loadBooking(pool, row.booking_id, { view: 'owner', origin })
  return {
    dispute: {
      ...summary(row),
      raisedByName: row.raised_by_name,
      handledBy: row.admin_name,
      parties: {
        customer: { name: row.customer_name, email: isDeletedEmail(row.customer_email) ? null : row.customer_email },
        owner: {
          name: row.owner_name,
          business: row.business_name,
          email: isDeletedEmail(row.owner_email) ? null : row.owner_email,
        },
      },
      ...(await details(pool, row, { admin: true, user: null })),
    },
    booking,
  }
}

async function audit(client, adminId, action, disputeId, details) {
  await insertAudit(client, { adminId, action, targetTable: 'disputes', targetId: disputeId, details })
}

export async function takeDispute(adminId, disputeId) {
  await withTransaction(async (client) => {
    const d = await repo.lockDispute(client, disputeId)
    if (!d) throw disputeNotFound()
    if (d.status !== 'open')
      throw new AppError(
        409,
        'INVALID_STATUS',
        'Only an open dispute can be taken for review. Reload to see who has it.',
      )
    await repo.takeDispute(client, { disputeId, adminId })
    await audit(client, adminId, 'dispute.take', disputeId, { reference: bookingReference(d.booking_id) })
  })
  return adminGetDispute(disputeId, { origin: null })
}

export async function resolveDispute(adminId, disputeId, { outcome, compensation, resolution }, { origin }) {
  if (outcome === 'dismissed' && compensation)
    throw validationError([{ field: 'compensation', message: 'A dismissed dispute has no compensation.' }])
  await withTransaction(async (client) => {
    const d = await repo.lockDispute(client, disputeId)
    if (!d) throw disputeNotFound()
    if (d.status !== 'under_review')
      throw new AppError(
        409,
        'INVALID_STATUS',
        d.status === 'open' ? 'Start the review before resolving.' : 'This dispute is already closed.',
      )
    const row = await repo.findDispute(client, disputeId)
    if (compensation && paisa(compensation) > paisa(row.total_amount))
      throw validationError([
        {
          field: 'compensation',
          message: `Compensation can’t be more than the booking total (Rs ${row.total_amount}).`,
        },
      ])
    await repo.decideDispute(client, {
      disputeId,
      adminId,
      status: 'resolved',
      outcome,
      compensation: compensation ?? null,
      text: resolution,
    })
    await audit(client, adminId, 'dispute.resolve', disputeId, {
      reference: bookingReference(d.booking_id),
      outcome,
      compensation: compensation ?? null,
      reason: resolution,
    })
  })
  await notifyParties(disputeId)
  return adminGetDispute(disputeId, { origin })
}

export async function rejectDispute(adminId, disputeId, { reason }, { origin }) {
  await withTransaction(async (client) => {
    const d = await repo.lockDispute(client, disputeId)
    if (!d) throw disputeNotFound()
    if (!OPEN.has(d.status)) throw new AppError(409, 'INVALID_STATUS', 'This dispute is already closed.')
    await repo.decideDispute(client, { disputeId, adminId, status: 'rejected', text: reason })
    await audit(client, adminId, 'dispute.reject', disputeId, { reference: bookingReference(d.booking_id), reason })
  })
  await notifyParties(disputeId)
  return adminGetDispute(disputeId, { origin })
}

export async function addAdminNote(adminId, disputeId, { body, internal }, { origin }) {
  await withTransaction(async (client) => {
    const d = await repo.lockDispute(client, disputeId)
    if (!d) throw disputeNotFound()
    await repo.insertNote(client, { disputeId, authorId: adminId, authorRole: 'admin', body, internal })
    await repo.touchDispute(client, disputeId)
    await audit(client, adminId, 'dispute.note', disputeId, { reference: bookingReference(d.booking_id), internal })
  })
  return adminGetDispute(disputeId, { origin })
}

// After the decision commits. A failed email is logged (without content) and never undoes the decision.
async function notifyParties(disputeId) {
  const row = await repo.findDispute(pool, disputeId)
  const link = `${env.clientOrigin}/disputes/${disputeId}`
  const fields = {
    reference: bookingReference(row.booking_id),
    venueName: row.venue_name,
    decision: row.status,
    outcomeLabel: row.outcome ? OUTCOME_LABELS[row.outcome] : null,
    compensation: row.compensation_amount ? `Rs ${row.compensation_amount}` : null,
    reason: row.resolution,
    link,
  }
  for (const [name, email] of [
    [row.customer_name, row.customer_email],
    [row.owner_name, row.owner_email],
  ]) {
    if (isDeletedEmail(email)) continue
    try {
      await sendDisputeDecisionEmail({ to: email, name, ...fields })
    } catch (err) {
      logger.warn({ disputeId, err: err.message }, '[disputes] decision email not sent')
    }
  }
}

// ---------------------------------------------------------------- venue reports

export async function reportVenue(user, venueId, { reason, details: text }) {
  const venue = await repo.findPublicVenue(pool, venueId)
  if (!venue) throw notFoundError('We couldn’t find that venue.')
  if (venue.owner_id === user.id) throw new AppError(409, 'OWN_VENUE', 'You can’t report your own venue.')
  try {
    const row = await repo.insertReport(pool, { venueId, reporterId: user.id, reason, details: text })
    return { report: { id: row.report_id, status: 'open', createdAt: iso(row.created_at) } }
  } catch (err) {
    if (err.code === '23505')
      throw new AppError(409, 'REPORT_EXISTS', 'You’ve already reported this venue. An admin is looking at it.')
    throw err
  }
}

export async function adminListReports({ status, page, pageSize }) {
  const rows = await repo.listReports(pool, { status, limit: pageSize, offset: (page - 1) * pageSize })
  const total = rows[0]?.total ?? 0
  return {
    rows: rows.map((r) => ({
      id: r.report_id,
      venueId: r.venue_id,
      venueName: r.venue_name,
      venueCity: r.venue_city,
      venueStatus: r.venue_status,
      reason: r.reason,
      details: r.details,
      status: r.status,
      resolution: r.resolution,
      reporter: {
        name: r.reporter_name,
        email: isDeletedEmail(r.reporter_email) ? null : r.reporter_email,
        role: r.reporter_role,
      },
      handledBy: r.admin_name,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      resolvedAt: iso(r.resolved_at),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts: await repo.reportCounts(pool),
  }
}

export async function takeReport(adminId, reportId) {
  return withTransaction(async (client) => {
    const r = await repo.lockReport(client, reportId)
    if (!r) throw notFoundError('We couldn’t find that report.')
    if (r.status !== 'open') throw new AppError(409, 'INVALID_STATUS', 'Only an open report can be taken for review.')
    await repo.updateReport(client, { reportId, adminId, status: 'under_review' })
    await insertAudit(client, {
      adminId,
      action: 'report.take',
      targetTable: 'venue_reports',
      targetId: reportId,
      details: { venue: r.venue_name },
    })
    return { status: 'under_review' }
  })
}

export async function resolveReport(adminId, reportId, { resolution }) {
  return withTransaction(async (client) => {
    const r = await repo.lockReport(client, reportId)
    if (!r) throw notFoundError('We couldn’t find that report.')
    if (r.status === 'resolved') throw new AppError(409, 'INVALID_STATUS', 'This report is already resolved.')
    await repo.updateReport(client, { reportId, adminId, status: 'resolved', resolution })
    await insertAudit(client, {
      adminId,
      action: 'report.resolve',
      targetTable: 'venue_reports',
      targetId: reportId,
      details: { venue: r.venue_name, reason: resolution },
    })
    return { status: 'resolved' }
  })
}
