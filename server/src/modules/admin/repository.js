// SQL only. Every function takes `db` first; values go through $n placeholders; query texts are fixed strings.

// NFR-4 / REQ-47: every admin action is recorded with who, what, when and why.
export async function insertAudit(db, { adminId, action, targetTable, targetId, details = {} }) {
  await db.query(
    `INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [adminId, action, targetTable, targetId, JSON.stringify(details)],
  )
}

// Admin venue list: any status, search, filters, sort, pagination. Optional filters are `$n IS NULL OR`.
const LIST_SQL = `WITH rows AS (
  SELECT v.venue_id, v.name, v.city, v.area, v.category, v.venue_type, v.capacity, v.base_price, v.avg_rating,
         v.approval_status, v.is_active, v.submitted_at, v.reviewed_at, v.created_at, v.suspension_reason,
         v.rejection_reason, v.changes_note,
         u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone,
         (SELECT count(*) FROM halls h WHERE h.venue_id = v.venue_id)::int AS hall_count,
         (SELECT count(*) FROM venue_images i WHERE i.venue_id = v.venue_id)::int AS photo_count,
         (SELECT count(*) FROM venue_images i WHERE i.venue_id = v.venue_id AND i.verification_status = 'flagged')::int AS flagged_count,
         (SELECT count(*) FROM reviews r WHERE r.venue_id = v.venue_id AND r.removed_at IS NULL)::int AS review_count,
         (SELECT i.image_url FROM venue_images i WHERE i.venue_id = v.venue_id
           ORDER BY i.is_cover DESC, i.sort_order LIMIT 1) AS cover_url
    FROM venues v
    JOIN users u ON u.user_id = v.owner_id
   WHERE ($1::approval_status IS NULL OR v.approval_status = $1::approval_status)
     AND ($2::text IS NULL OR v.name ILIKE '%' || $2 || '%' OR v.city ILIKE '%' || $2 || '%'
          OR v.area ILIKE '%' || $2 || '%' OR u.name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
     AND ($3::text IS NULL OR v.city = $3)
     AND ($4::venue_type IS NULL OR v.venue_type = $4::venue_type)
     AND ($5::date IS NULL OR v.submitted_at >= ($5::date::timestamp AT TIME ZONE 'Asia/Karachi'))
     AND ($6::date IS NULL OR v.submitted_at < (($6::date + 1)::timestamp AT TIME ZONE 'Asia/Karachi'))
)
SELECT *, count(*) OVER ()::int AS total FROM rows
 ORDER BY
   CASE WHEN $7 = 'oldest' THEN coalesce(submitted_at, created_at) END ASC,
   CASE WHEN $7 = 'newest' THEN coalesce(submitted_at, created_at) END DESC,
   CASE WHEN $7 = 'decided' THEN reviewed_at END DESC NULLS LAST,
   CASE WHEN $7 = 'name' THEN name END ASC,
   CASE WHEN $7 = 'capacity' THEN capacity END DESC,
   CASE WHEN $7 = 'rating' THEN avg_rating END DESC,
   name ASC
 LIMIT $8 OFFSET $9`

export async function listVenues(db, f) {
  const { rows } = await db.query(LIST_SQL, [
    f.status ?? null,
    f.q || null,
    f.city || null,
    f.type || null,
    f.from || null,
    f.to || null,
    f.sort,
    f.pageSize,
    (f.page - 1) * f.pageSize,
  ])
  return { rows, total: rows[0]?.total ?? 0 }
}

export async function statusCounts(db) {
  const { rows } = await db.query(`SELECT approval_status::text AS status, count(*)::int AS n FROM venues GROUP BY 1`)
  return rows
}

export async function venueCities(db) {
  const { rows } = await db.query(`SELECT DISTINCT city FROM venues ORDER BY city`)
  return rows.map((r) => r.city)
}

export async function lockVenues(db, ids) {
  const { rows } = await db.query(
    `SELECT venue_id, name, approval_status FROM venues WHERE venue_id = ANY ($1::uuid[]) ORDER BY venue_id FOR UPDATE`,
    [ids],
  )
  return rows
}

export async function approveVenue(db, { venueId, adminId }) {
  await db.query(
    `UPDATE venues SET approval_status = 'approved', approved_by = $2, reviewed_at = now(),
            rejection_reason = NULL, changes_note = NULL, suspension_reason = NULL
      WHERE venue_id = $1`,
    [venueId, adminId],
  )
  // D1 + REQ-9: photos the detector couldn't check yet were reviewed by the admin with the listing -> approved.
  // Genuine and approved photos are published; flagged ones wait for the admin's image decision (REQ-10).
  await db.query(
    `UPDATE venue_images
        SET verification_status = CASE WHEN verification_status = 'pending' THEN 'approved'::verification_status
                                       ELSE verification_status END,
            is_published = verification_status IN ('genuine', 'approved', 'pending')
      WHERE venue_id = $1`,
    [venueId],
  )
}

export async function setDecision(db, { venueId, status, rejectionReason = null, changesNote = null }) {
  await db.query(
    `UPDATE venues SET approval_status = $2::approval_status, reviewed_at = now(), rejection_reason = $3, changes_note = $4
      WHERE venue_id = $1`,
    [venueId, status, rejectionReason, changesNote],
  )
}

export async function setSuspended(db, { venueId, suspended, reason = null }) {
  await db.query(
    `UPDATE venues SET approval_status = CASE WHEN $2 THEN 'suspended'::approval_status ELSE 'approved'::approval_status END,
            suspension_reason = $3
      WHERE venue_id = $1`,
    [venueId, suspended, reason],
  )
}

// History for the review page: the audit entries for this venue, oldest first.
export async function venueHistory(db, venueId) {
  const { rows } = await db.query(
    `SELECT l.action, l.details, l.created_at, u.name AS admin_name
       FROM admin_audit_log l JOIN users u ON u.user_id = l.admin_id
      WHERE l.target_table = 'venues' AND l.target_id = $1
      ORDER BY l.created_at`,
    [venueId],
  )
  return rows
}

// ---------------------------------------------------------------- images (REQ-9, REQ-10)

export async function listImages(db, { status }) {
  const { rows } = await db.query(
    `SELECT i.image_id, i.venue_id, i.image_url, i.category, i.verification_status, i.uploaded_at, i.size_bytes,
            v.name AS venue_name, v.approval_status, u.name AS owner_name,
            (SELECT x.ai_score FROM image_verifications x WHERE x.image_id = i.image_id AND x.ai_score IS NOT NULL
              ORDER BY x.checked_at DESC LIMIT 1) AS ai_score,
            (SELECT x.checked_at FROM image_verifications x WHERE x.image_id = i.image_id
              ORDER BY x.checked_at DESC LIMIT 1) AS checked_at
       FROM venue_images i
       JOIN venues v ON v.venue_id = i.venue_id
       JOIN users u ON u.user_id = v.owner_id
      WHERE i.verification_status = $1::verification_status
        AND EXISTS (SELECT 1 FROM image_verifications x WHERE x.image_id = i.image_id)
      ORDER BY ai_score DESC NULLS LAST, i.uploaded_at
      LIMIT 200`,
    [status],
  )
  return rows
}

// Counts of photos the detector or an admin has looked at, by status.
export async function imageCounts(db) {
  const { rows } = await db.query(
    `SELECT verification_status::text AS status, count(*)::int AS n FROM venue_images i
      WHERE EXISTS (SELECT 1 FROM image_verifications x WHERE x.image_id = i.image_id)
      GROUP BY 1`,
  )
  return rows
}

export async function lockImage(db, imageId) {
  const { rows } = await db.query(
    `SELECT i.image_id, i.venue_id, i.verification_status, v.name AS venue_name, v.approval_status
       FROM venue_images i JOIN venues v USING (venue_id) WHERE i.image_id = $1 FOR UPDATE OF i`,
    [imageId],
  )
  return rows[0] ?? null
}

export async function decideImage(db, { imageId, adminId, decision }) {
  await db.query(
    `UPDATE venue_images i
        SET verification_status = $2::verification_status,
            is_published = ($2 = 'approved' AND EXISTS (
              SELECT 1 FROM venues v WHERE v.venue_id = i.venue_id AND v.approval_status IN ('approved', 'suspended')))
      WHERE i.image_id = $1`,
    [imageId, decision],
  )
  await db.query(
    `INSERT INTO image_verifications (image_id, ai_score, result, reviewed_by) VALUES ($1, NULL, $2::verification_status, $3)`,
    [imageId, decision, adminId],
  )
}

// ---------------------------------------------------------------- dashboard

export async function dashboardNumbers(db) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*) FROM venues WHERE approval_status = 'pending')::int AS pending,
       (SELECT count(*) FROM venues WHERE approval_status = 'pending'
          AND submitted_at >= date_trunc('week', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi')::int AS pending_this_week,
       (SELECT count(*) FROM venues WHERE approval_status = 'approved' AND is_active)::int AS live,
       (SELECT count(*) FROM venues WHERE approval_status = 'suspended')::int AS suspended,
       (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role = 'customer')::int AS customers,
       (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role = 'venue_owner')::int AS venue_owners,
       (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role = 'decorator')::int AS decorators,
       (SELECT count(*) FROM bookings
         WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi')::int AS bookings_this_month,
       (SELECT count(*) FROM venue_images WHERE verification_status = 'flagged')::int AS flagged_images,
       (SELECT count(*) FROM venue_revisions WHERE status = 'pending')::int AS pending_edits,
       (SELECT count(*) FROM reviews WHERE is_flagged AND removed_at IS NULL)::int AS reported_reviews`,
  )
  return rows[0]
}

// Submitted and approved venues per week (Monday, Pakistan time) for the last `weeks` weeks.
export async function weeklySubmissions(db, weeks) {
  const { rows } = await db.query(
    `WITH w AS (
       SELECT generate_series(date_trunc('week', now() AT TIME ZONE 'Asia/Karachi') - ($1::int - 1) * interval '1 week',
                              date_trunc('week', now() AT TIME ZONE 'Asia/Karachi'), interval '1 week') AS start
     )
     SELECT to_char(w.start, 'YYYY-MM-DD') AS week,
            (SELECT count(*) FROM venues v WHERE (v.submitted_at AT TIME ZONE 'Asia/Karachi') >= w.start
                AND (v.submitted_at AT TIME ZONE 'Asia/Karachi') < w.start + interval '1 week')::int AS submitted,
            (SELECT count(*) FROM venues v WHERE v.approval_status IN ('approved', 'suspended')
                AND (v.reviewed_at AT TIME ZONE 'Asia/Karachi') >= w.start
                AND (v.reviewed_at AT TIME ZONE 'Asia/Karachi') < w.start + interval '1 week')::int AS approved
       FROM w ORDER BY w.start`,
    [weeks],
  )
  return rows
}

export async function oldPending(db) {
  const { rows } = await db.query(
    `SELECT venue_id, name, submitted_at FROM venues
      WHERE approval_status = 'pending' AND submitted_at < now() - interval '2 days'
      ORDER BY submitted_at LIMIT 20`,
  )
  return rows
}

export async function recentSubmissions(db) {
  const { rows } = await db.query(
    `SELECT v.venue_id, v.name, v.submitted_at, u.name AS owner_name FROM venues v JOIN users u ON u.user_id = v.owner_id
      WHERE v.submitted_at IS NOT NULL ORDER BY v.submitted_at DESC LIMIT 10`,
  )
  return rows
}

// ---------------------------------------------------------------- audit log (NFR-4)

const AUDIT_SQL = `SELECT l.log_id, l.action, l.target_table, l.target_id, l.details, l.created_at, u.name AS admin_name,
       coalesce(v.name, iv.name, l.details->>'name', tu.name) AS target_label, count(*) OVER ()::int AS total
  FROM admin_audit_log l
  JOIN users u ON u.user_id = l.admin_id
  LEFT JOIN venues v ON l.target_table = 'venues' AND v.venue_id = l.target_id
  LEFT JOIN venue_images i ON l.target_table = 'venue_images' AND i.image_id = l.target_id
  LEFT JOIN venues iv ON iv.venue_id = i.venue_id
  LEFT JOIN users tu ON l.target_table = 'users' AND tu.user_id = l.target_id
 WHERE ($1::text IS NULL OR l.action LIKE $1 || '.%')
   AND ($2::text IS NULL OR u.name ILIKE '%' || $2 || '%' OR l.action ILIKE '%' || $2 || '%'
        OR coalesce(v.name, iv.name, tu.name, '') ILIKE '%' || $2 || '%' OR l.details::text ILIKE '%' || $2 || '%')
 ORDER BY l.created_at DESC
 LIMIT $3 OFFSET $4`

export async function listAudit(db, { action, q, page, pageSize }) {
  const { rows } = await db.query(AUDIT_SQL, [action || null, q || null, pageSize, (page - 1) * pageSize])
  return { rows, total: rows[0]?.total ?? 0 }
}

export async function recentAudit(db, limit = 12) {
  const { rows } = await db.query(
    `SELECT l.log_id, l.action, l.created_at, u.name AS admin_name,
            coalesce(v.name, l.details->>'name', tu.name, '') AS target_label
       FROM admin_audit_log l JOIN users u ON u.user_id = l.admin_id
       LEFT JOIN venues v ON l.target_table = 'venues' AND v.venue_id = l.target_id
       LEFT JOIN users tu ON l.target_table = 'users' AND tu.user_id = l.target_id
      ORDER BY l.created_at DESC LIMIT $1`,
    [limit],
  )
  return rows
}
