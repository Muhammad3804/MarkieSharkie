// Review moderation SQL (REQ-44, EUC-34, srs-alignment #36). Raw pg, $n parameters only.

// A review shown on a public venue page (not hidden, venue approved and active).
export async function findPublicReview(db, { venueId, reviewId }) {
  const { rows } = await db.query(
    `SELECT r.review_id, r.customer_id, r.venue_id
       FROM reviews r JOIN venues v ON v.venue_id = r.venue_id
      WHERE r.review_id = $1 AND r.venue_id = $2 AND r.removed_at IS NULL
        AND v.approval_status = 'approved' AND v.is_active
        AND EXISTS (SELECT 1 FROM users ou WHERE ou.user_id = v.owner_id AND ou.is_active AND ou.deleted_at IS NULL)`,
    [reviewId, venueId],
  )
  return rows[0] ?? null
}

// -> the new report, or null when this user already reported the review (review_reports_one_per_user).
export async function insertReport(db, { reviewId, reporterId, reason, note }) {
  const { rows } = await db.query(
    `INSERT INTO review_reports (review_id, reporter_id, reason, note) VALUES ($1, $2, $3, $4)
     ON CONFLICT (review_id, reporter_id) DO NOTHING
     RETURNING report_id, created_at`,
    [reviewId, reporterId, reason, note],
  )
  return rows[0] ?? null
}

export async function flagReview(db, reviewId) {
  await db.query('UPDATE reviews SET is_flagged = true WHERE review_id = $1', [reviewId])
}

export async function lockReview(db, reviewId) {
  const { rows } = await db.query(
    `SELECT r.*, u.name AS customer_name, v.name AS venue_name
       FROM reviews r JOIN users u ON u.user_id = r.customer_id JOIN venues v ON v.venue_id = r.venue_id
      WHERE r.review_id = $1
      FOR UPDATE OF r`,
    [reviewId],
  )
  return rows[0] ?? null
}

export async function hideReview(db, { reviewId, adminId, reason }) {
  await db.query(
    `UPDATE reviews SET removed_at = now(), removed_by = $2, removal_reason = $3, is_flagged = false
      WHERE review_id = $1`,
    [reviewId, adminId, reason],
  )
}

export async function restoreReview(db, reviewId) {
  await db.query(
    `UPDATE reviews SET removed_at = NULL, removed_by = NULL, removal_reason = NULL, is_flagged = false
      WHERE review_id = $1`,
    [reviewId],
  )
}

export async function unflagReview(db, reviewId) {
  await db.query('UPDATE reviews SET is_flagged = false WHERE review_id = $1', [reviewId])
}

export async function deleteReview(db, reviewId) {
  await db.query('DELETE FROM reviews WHERE review_id = $1', [reviewId]) // its reports cascade
}

export async function resolveReports(db, reviewId) {
  const { rowCount } = await db.query(
    'UPDATE review_reports SET resolved_at = now() WHERE review_id = $1 AND resolved_at IS NULL',
    [reviewId],
  )
  return rowCount
}

// REQ-42 "update venue average rating": hidden reviews don't count. Runs in the moderation transaction.
export async function recomputeRating(db, venueId) {
  const { rows } = await db.query(
    `UPDATE venues SET avg_rating = coalesce(
       (SELECT round(avg(rating)::numeric, 2) FROM reviews WHERE venue_id = $1 AND removed_at IS NULL), 0)
      WHERE venue_id = $1
     RETURNING avg_rating`,
    [venueId],
  )
  return rows[0]?.avg_rating ?? 0
}

// status: 'reported' (flagged, still shown), 'hidden', 'all'. q matches the comment, reviewer or venue (ILIKE with
// the wildcards escaped by the caller).
export async function listReviews(db, { status, q, limit, offset }) {
  const { rows } = await db.query(
    `SELECT r.review_id, r.venue_id, r.rating, r.comment, r.is_flagged, r.created_at, r.removed_at, r.removal_reason,
            u.name AS customer_name, v.name AS venue_name, v.city,
            (SELECT count(*) FROM review_reports p WHERE p.review_id = r.review_id AND p.resolved_at IS NULL)::int
              AS open_reports,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('reason', p.reason, 'note', p.note, 'at', p.created_at)
                                       ORDER BY p.created_at DESC), '[]'::jsonb)
               FROM review_reports p WHERE p.review_id = r.review_id AND p.resolved_at IS NULL) AS reports,
            count(*) OVER ()::int AS total
       FROM reviews r
       JOIN users u ON u.user_id = r.customer_id
       JOIN venues v ON v.venue_id = r.venue_id
      WHERE CASE $1::text
              WHEN 'reported' THEN r.is_flagged AND r.removed_at IS NULL
              WHEN 'hidden' THEN r.removed_at IS NOT NULL
              ELSE true
            END
        AND ($2::text IS NULL OR r.comment ILIKE '%' || $2 || '%' OR u.name ILIKE '%' || $2 || '%'
             OR v.name ILIKE '%' || $2 || '%')
      ORDER BY CASE WHEN $1::text = 'reported' THEN r.created_at END ASC, r.created_at DESC, r.review_id
      LIMIT $3 OFFSET $4`,
    [status, q ?? null, limit, offset],
  )
  return rows
}

export async function reviewCounts(db) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE is_flagged AND removed_at IS NULL)::int AS reported,
            count(*) FILTER (WHERE removed_at IS NOT NULL)::int AS hidden,
            count(*)::int AS "all"
       FROM reviews`,
  )
  return rows[0]
}
