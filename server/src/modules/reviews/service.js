import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { insertAudit } from '../admin/repository.js'
import * as repo from './repository.js'

// Review moderation (REQ-44, EUC-34, srs-alignment #36). Anyone logged in (not admins) can report a review once.
// The admin hides (reversible), restores, keeps ("dismiss") or permanently deletes it, always with a reason. Each
// decision locks the review, recomputes the venue's average rating from the visible reviews (REQ-42) and writes
// admin_audit_log in the same transaction (NFR-4). Hidden reviews never reach the public venue page.

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))
const reviewNotFound = () => notFoundError('We couldn’t find that review.')

export async function reportReview(user, { venueId, reviewId }, { reason, note }) {
  return withTransaction(async (client) => {
    const review = await repo.findPublicReview(client, { venueId, reviewId })
    if (!review) throw reviewNotFound()
    if (review.customer_id === user.id) throw new AppError(403, 'FORBIDDEN', 'You can’t report your own review.')
    const report = await repo.insertReport(client, { reviewId, reporterId: user.id, reason, note: note || null })
    if (!report)
      throw new AppError(409, 'ALREADY_REPORTED', 'You’ve already reported this review. Our team will look at it.')
    await repo.flagReview(client, reviewId)
    return { report: { id: report.report_id, createdAt: iso(report.created_at) } }
  })
}

function toRow(r) {
  return {
    id: r.review_id,
    venueId: r.venue_id,
    venueName: r.venue_name,
    city: r.city,
    customerName: r.customer_name,
    rating: r.rating,
    comment: r.comment ?? '',
    createdAt: iso(r.created_at),
    status: r.removed_at ? 'hidden' : r.is_flagged ? 'reported' : 'visible',
    hiddenAt: iso(r.removed_at),
    removalReason: r.removal_reason,
    openReports: r.open_reports,
    reports: r.reports.map((p) => ({ reason: p.reason, note: p.note, at: p.at })),
  }
}

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function listReviews(query) {
  const rows = await repo.listReviews(pool, {
    status: query.status,
    q: query.q ? escapeLike(query.q) : null,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })
  const total = rows[0]?.total ?? 0
  return {
    rows: rows.map(toRow),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    counts: await repo.reviewCounts(pool),
  }
}

async function decide(adminId, reviewId, { allowed, action, reason, apply }) {
  return withTransaction(async (client) => {
    const review = await repo.lockReview(client, reviewId)
    if (!review) throw reviewNotFound()
    const state = review.removed_at ? 'hidden' : review.is_flagged ? 'reported' : 'visible'
    if (!allowed.includes(state))
      throw new AppError(409, 'INVALID_STATUS', `This review is ${state}, so that can’t be done now. Refresh the page.`)
    await apply(client, review)
    const reports = await repo.resolveReports(client, reviewId)
    const avgRating = await repo.recomputeRating(client, review.venue_id)
    await insertAudit(client, {
      adminId,
      action,
      targetTable: 'reviews',
      targetId: reviewId,
      details: {
        reason,
        from: state,
        venueId: review.venue_id,
        venueName: review.venue_name,
        rating: review.rating,
        reportsResolved: reports,
        // A deleted review is gone from the database; the audit row keeps what it said.
        ...(action === 'review.delete'
          ? { customerName: review.customer_name, comment: review.comment, createdAt: iso(review.created_at) }
          : {}),
      },
    })
    return { avgRating: Number(avgRating) }
  })
}

export const hideReview = (adminId, id, { reason }) =>
  decide(adminId, id, {
    allowed: ['reported', 'visible'],
    action: 'review.hide',
    reason,
    apply: (client) => repo.hideReview(client, { reviewId: id, adminId, reason }),
  })

export const restoreReview = (adminId, id, { reason }) =>
  decide(adminId, id, {
    allowed: ['hidden'],
    action: 'review.restore',
    reason,
    apply: (client) => repo.restoreReview(client, id),
  })

// "Keep": the reports were wrong; the review stays and is no longer flagged.
export const dismissReports = (adminId, id, { reason }) =>
  decide(adminId, id, {
    allowed: ['reported'],
    action: 'review.dismiss',
    reason,
    apply: (client) => repo.unflagReview(client, id),
  })

export const deleteReview = (adminId, id, { reason }) =>
  decide(adminId, id, {
    allowed: ['reported', 'visible', 'hidden'],
    action: 'review.delete',
    reason,
    apply: (client) => repo.deleteReview(client, id),
  })
