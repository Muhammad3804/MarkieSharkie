// Disputes (REQ-48, EUC-35) and venue reports SQL (srs-alignment #41). Raw pg, $n parameters only.

// ---------------------------------------------------------------- evidence files

export async function countRecentFiles(db, userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM dispute_files WHERE uploaded_by = $1 AND created_at > now() - interval '24 hours'`,
    [userId],
  )
  return rows[0].n
}

export async function insertFile(db, { userId, storageKey, mimeType, size }) {
  const { rows } = await db.query(
    `INSERT INTO dispute_files (uploaded_by, storage_key, mime_type, size_bytes) VALUES ($1, $2, $3, $4)
     RETURNING file_id, created_at`,
    [userId, storageKey, mimeType, size],
  )
  return rows[0]
}

// The caller's own uploads that aren't attached to a dispute yet, locked so two disputes can't both take one.
export async function lockOwnLooseFiles(db, userId, fileIds) {
  const { rows } = await db.query(
    `SELECT file_id FROM dispute_files
      WHERE uploaded_by = $1 AND dispute_id IS NULL AND file_id = ANY ($2::uuid[])
      FOR UPDATE`,
    [userId, fileIds],
  )
  return rows.map((r) => r.file_id)
}

export async function attachFiles(db, disputeId, fileIds) {
  await db.query('UPDATE dispute_files SET dispute_id = $1 WHERE file_id = ANY ($2::uuid[])', [disputeId, fileIds])
}

export async function disputeFiles(db, disputeId) {
  const { rows } = await db.query(
    `SELECT f.file_id, f.mime_type, f.size_bytes, f.created_at, f.uploaded_by, u.name AS uploader_name
       FROM dispute_files f JOIN users u ON u.user_id = f.uploaded_by
      WHERE f.dispute_id = $1 ORDER BY f.created_at, f.file_id`,
    [disputeId],
  )
  return rows
}

export async function findFile(db, { disputeId, fileId }) {
  const { rows } = await db.query(
    'SELECT storage_key, mime_type FROM dispute_files WHERE dispute_id = $1 AND file_id = $2',
    [disputeId, fileId],
  )
  return rows[0] ?? null
}

// ---------------------------------------------------------------- bookings and disputes

// Who the two parties of a booking are, and whether it can be disputed.
export async function bookingParties(db, bookingId) {
  const { rows } = await db.query(
    `SELECT b.booking_id, b.status, b.customer_id, v.owner_id, v.name AS venue_name
       FROM bookings b JOIN venues v ON v.venue_id = b.venue_id
      WHERE b.booking_id = $1`,
    [bookingId],
  )
  return rows[0] ?? null
}

export async function insertDispute(db, { bookingId, raisedBy, raisedByRole, category, reason }) {
  const { rows } = await db.query(
    `INSERT INTO disputes (booking_id, raised_by, raised_by_role, category, reason) VALUES ($1, $2, $3, $4, $5)
     RETURNING dispute_id`,
    [bookingId, raisedBy, raisedByRole, category, reason],
  )
  return rows[0].dispute_id
}

const DISPUTE_COLUMNS = `
  d.dispute_id, d.booking_id, d.category, d.reason, d.status, d.raised_by, d.raised_by_role, d.outcome,
  d.compensation_amount, d.resolution, d.created_at, d.updated_at, d.resolved_at, d.admin_id,
  a.name AS admin_name, r.name AS raised_by_name,
  b.status AS booking_status, b.closed_as, b.customer_id, b.total_amount, b.advance_due, b.event_name,
  to_char(s.date, 'YYYY-MM-DD') AS event_date, to_char(s.start_time, 'HH24:MI') AS start_time,
  v.venue_id, v.name AS venue_name, v.city AS venue_city, v.owner_id,
  cu.name AS customer_name, cu.email AS customer_email, ow.name AS owner_name, ow.email AS owner_email,
  vo.business_name,
  (SELECT count(*) FROM dispute_files f WHERE f.dispute_id = d.dispute_id)::int AS file_count,
  (SELECT count(*) FROM dispute_notes n WHERE n.dispute_id = d.dispute_id AND NOT n.internal)::int AS note_count`

const DISPUTE_FROM = `
  FROM disputes d
  JOIN bookings b ON b.booking_id = d.booking_id
  JOIN time_slots s ON s.slot_id = b.slot_id
  JOIN venues v ON v.venue_id = b.venue_id
  JOIN users r ON r.user_id = d.raised_by
  LEFT JOIN users cu ON cu.user_id = b.customer_id
  LEFT JOIN users ow ON ow.user_id = v.owner_id
  LEFT JOIN venue_owners vo ON vo.user_id = v.owner_id
  LEFT JOIN users a ON a.user_id = d.admin_id`

const FIND_DISPUTE_SQL = `SELECT ${DISPUTE_COLUMNS} ${DISPUTE_FROM} WHERE d.dispute_id = $1`

export async function findDispute(db, disputeId) {
  const { rows } = await db.query(FIND_DISPUTE_SQL, [disputeId])
  return rows[0] ?? null
}

// status: open (open + under_review) | closed (resolved + rejected) | all. Disputes on bookings the user is a party
// to, whichever side raised them.
const PARTY_LIST_SQL = `SELECT ${DISPUTE_COLUMNS}, count(*) OVER ()::int AS total ${DISPUTE_FROM}
  WHERE (b.customer_id = $1 OR v.owner_id = $1)
    AND CASE $2::text
          WHEN 'open' THEN d.status IN ('open', 'under_review')
          WHEN 'closed' THEN d.status::text IN ('resolved', 'rejected')
          ELSE true
        END
  ORDER BY d.updated_at DESC, d.dispute_id
  LIMIT $3 OFFSET $4`

export async function listForParty(db, userId, { status, limit, offset }) {
  const { rows } = await db.query(PARTY_LIST_SQL, [userId, status, limit, offset])
  return rows
}

// The open disputes on a set of bookings (for "Report a problem" buttons and badges).
export async function openOnBookings(db, bookingIds) {
  const { rows } = await db.query(
    `SELECT booking_id, dispute_id, raised_by, status FROM disputes
      WHERE booking_id = ANY ($1::uuid[]) AND status IN ('open', 'under_review')`,
    [bookingIds],
  )
  return rows
}

// Admin queue. status: open | under_review | resolved | rejected | all. q: venue, customer, owner, raiser or the
// booking reference (MS-XXXXXX); wildcards escaped by the caller.
const ADMIN_LIST_SQL = `SELECT ${DISPUTE_COLUMNS}, count(*) OVER ()::int AS total ${DISPUTE_FROM}
  WHERE ($1::text = 'all' OR d.status::text = $1)
    AND ($2::text IS NULL OR d.category = $2)
    AND ($3::text IS NULL OR v.name ILIKE '%' || $3 || '%' OR cu.name ILIKE '%' || $3 || '%'
         OR ow.name ILIKE '%' || $3 || '%' OR r.name ILIKE '%' || $3 || '%'
         OR ('MS-' || upper(left(replace(b.booking_id::text, '-', ''), 6))) ILIKE '%' || $3 || '%')
  ORDER BY CASE WHEN d.status IN ('open', 'under_review') THEN d.created_at END ASC NULLS LAST,
           d.updated_at DESC, d.dispute_id
  LIMIT $4 OFFSET $5`

export async function adminList(db, { status, category, q, limit, offset }) {
  const { rows } = await db.query(ADMIN_LIST_SQL, [status, category ?? null, q ?? null, limit, offset])
  return rows
}

export async function disputeCounts(db) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'open')::int AS open,
            count(*) FILTER (WHERE status = 'under_review')::int AS under_review,
            count(*) FILTER (WHERE status = 'resolved')::int AS resolved,
            count(*) FILTER (WHERE status::text = 'rejected')::int AS rejected
       FROM disputes`,
  )
  return rows[0]
}

export async function lockDispute(db, disputeId) {
  const { rows } = await db.query(
    'SELECT dispute_id, status, admin_id, booking_id FROM disputes WHERE dispute_id = $1 FOR UPDATE',
    [disputeId],
  )
  return rows[0] ?? null
}

export async function takeDispute(db, { disputeId, adminId }) {
  await db.query(`UPDATE disputes SET status = 'under_review', admin_id = $2 WHERE dispute_id = $1`, [
    disputeId,
    adminId,
  ])
}

// status: 'resolved' (with outcome and optional compensation) or 'rejected'.
export async function decideDispute(db, { disputeId, adminId, status, outcome = null, compensation = null, text }) {
  await db.query(
    `UPDATE disputes
        SET status = $3::dispute_status, admin_id = $2, outcome = $4, compensation_amount = $5::numeric,
            resolution = $6, resolved_at = now()
      WHERE dispute_id = $1`,
    [disputeId, adminId, status, outcome, compensation, text],
  )
}

export async function touchDispute(db, disputeId) {
  await db.query('UPDATE disputes SET updated_at = now() WHERE dispute_id = $1', [disputeId])
}

// ---------------------------------------------------------------- notes

export async function insertNote(db, { disputeId, authorId, authorRole, body, internal = false }) {
  const { rows } = await db.query(
    `INSERT INTO dispute_notes (dispute_id, author_id, author_role, body, internal) VALUES ($1, $2, $3, $4, $5)
     RETURNING note_id, created_at`,
    [disputeId, authorId, authorRole, body, internal],
  )
  return rows[0]
}

export async function disputeNotes(db, disputeId, { includeInternal }) {
  const { rows } = await db.query(
    `SELECT n.note_id, n.author_id, n.author_role, n.body, n.internal, n.created_at, u.name AS author_name
       FROM dispute_notes n JOIN users u ON u.user_id = n.author_id
      WHERE n.dispute_id = $1 AND ($2::boolean OR NOT n.internal)
      ORDER BY n.created_at, n.note_id`,
    [disputeId, includeInternal],
  )
  return rows
}

// ---------------------------------------------------------------- venue reports

// A venue customers can see (the report button is on the public page).
export async function findPublicVenue(db, venueId) {
  const { rows } = await db.query(
    `SELECT v.venue_id, v.owner_id, v.name FROM venues v
      WHERE v.venue_id = $1 AND v.approval_status = 'approved' AND v.is_active
        AND EXISTS (SELECT 1 FROM users ou WHERE ou.user_id = v.owner_id AND ou.is_active AND ou.deleted_at IS NULL)`,
    [venueId],
  )
  return rows[0] ?? null
}

export async function insertReport(db, { venueId, reporterId, reason, details }) {
  const { rows } = await db.query(
    `INSERT INTO venue_reports (venue_id, reporter_id, reason, details) VALUES ($1, $2, $3, $4)
     RETURNING report_id, created_at`,
    [venueId, reporterId, reason, details],
  )
  return rows[0]
}

const REPORT_LIST_SQL = `SELECT r.report_id, r.venue_id, r.reason, r.details, r.status, r.resolution, r.created_at,
       r.updated_at, r.resolved_at, v.name AS venue_name, v.city AS venue_city, v.approval_status AS venue_status,
       u.name AS reporter_name, u.email AS reporter_email, u.role AS reporter_role, a.name AS admin_name,
       count(*) OVER ()::int AS total
  FROM venue_reports r
  JOIN venues v ON v.venue_id = r.venue_id
  JOIN users u ON u.user_id = r.reporter_id
  LEFT JOIN users a ON a.user_id = r.admin_id
 WHERE ($1::text = 'all' OR r.status = $1)
 ORDER BY CASE WHEN r.status <> 'resolved' THEN r.created_at END ASC NULLS LAST, r.updated_at DESC, r.report_id
 LIMIT $2 OFFSET $3`

export async function listReports(db, { status, limit, offset }) {
  const { rows } = await db.query(REPORT_LIST_SQL, [status, limit, offset])
  return rows
}

export async function reportCounts(db) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'open')::int AS open,
            count(*) FILTER (WHERE status = 'under_review')::int AS under_review,
            count(*) FILTER (WHERE status = 'resolved')::int AS resolved
       FROM venue_reports`,
  )
  return rows[0]
}

export async function lockReport(db, reportId) {
  const { rows } = await db.query(
    `SELECT r.report_id, r.status, r.venue_id, v.name AS venue_name
       FROM venue_reports r JOIN venues v ON v.venue_id = r.venue_id
      WHERE r.report_id = $1 FOR UPDATE OF r`,
    [reportId],
  )
  return rows[0] ?? null
}

export async function updateReport(db, { reportId, adminId, status, resolution = null }) {
  await db.query(
    `UPDATE venue_reports
        SET status = $3, admin_id = $2, resolution = coalesce($4, resolution),
            resolved_at = CASE WHEN $3 = 'resolved' THEN now() ELSE resolved_at END
      WHERE report_id = $1`,
    [reportId, adminId, status, resolution],
  )
}
