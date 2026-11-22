// SQL for editing live venues (EUC-04, EUC-07, REQ-5, REQ-6, srs-alignment #35). Raw pg, $n parameters only.
// Every write runs inside the caller's transaction with the venue row locked (lockVenue).

export async function lockVenue(db, venueId) {
  const { rows } = await db.query(
    `SELECT venue_id, owner_id, approval_status, is_active, name FROM venues WHERE venue_id = $1 FOR UPDATE`,
    [venueId],
  )
  return rows[0] ?? null
}

export async function insertOwnerActivity(db, { ownerId, action, targetTable = 'venues', targetId, details = {} }) {
  await db.query(
    `INSERT INTO owner_activity_log (owner_id, action, target_table, target_id, details) VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, action, targetTable, targetId, details],
  )
}

export async function ownerActivity(db, venueId, limit = 50) {
  const { rows } = await db.query(
    `SELECT action, details, created_at FROM owner_activity_log
      WHERE target_table = 'venues' AND target_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [venueId, limit],
  )
  return rows
}

// ---------------------------------------------------------------- fields that go live at once

export async function updateLiveFields(db, venueId, f) {
  await db.query(
    `UPDATE venues SET headline = $2, landmark = $3, landmark_minutes = $4, directions = $5, parking_spaces = $6,
            house_rules = $7, google_maps_url = $8, hosting_since = $9, custom_menu_note = $10
      WHERE venue_id = $1`,
    [
      venueId,
      f.headline,
      f.landmark,
      f.landmarkMinutes,
      f.directions,
      f.parkingSpaces,
      f.houseRules,
      f.googleMapsUrl,
      f.hostingSince,
      f.customMenuNote,
    ],
  )
}

export async function setActive(db, venueId, active) {
  const { rows } = await db.query(
    `UPDATE venues SET is_active = $2 WHERE venue_id = $1 RETURNING venue_id, approval_status, is_active`,
    [venueId, active],
  )
  return rows[0]
}

// ---------------------------------------------------------------- photos

export async function deleteImagesExcept(db, venueId, keepIds) {
  const { rows } = await db.query(
    `DELETE FROM venue_images WHERE venue_id = $1 AND NOT (image_id = ANY ($2::uuid[])) RETURNING image_url`,
    [venueId, keepIds],
  )
  return rows.map((r) => r.image_url)
}

export async function clearCovers(db, venueId) {
  await db.query('UPDATE venue_images SET is_cover = false WHERE venue_id = $1 AND is_cover', [venueId])
}

export async function updateImage(db, venueId, { imageId, hallId, category, sortOrder, isCover }) {
  await db.query(
    `UPDATE venue_images SET hall_id = $3, category = $4, sort_order = $5, is_cover = $6
      WHERE venue_id = $1 AND image_id = $2`,
    [venueId, imageId, hallId, category, sortOrder, isCover],
  )
}

export async function insertImagesReturning(db, venueId, images) {
  const { rows } = await db.query(
    `INSERT INTO venue_images (venue_id, hall_id, category, image_url, sort_order, is_cover, mime_type, size_bytes,
                               verification_status, is_published)
     SELECT $1, hall, cat, url, ord, cover, mime, size, 'pending', false
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::smallint[], $6::boolean[], $7::text[], $8::int[])
            WITH ORDINALITY AS t(hall, cat, url, ord, cover, mime, size, n)
      ORDER BY n
     RETURNING image_id, image_url`,
    [
      venueId,
      images.map((i) => i.hallId),
      images.map((i) => i.category),
      images.map((i) => i.url),
      images.map((i) => i.sortOrder),
      images.map((i) => i.isCover),
      images.map((i) => i.mimeType),
      images.map((i) => i.size),
    ],
  )
  return rows
}

export async function linkImagesToHall(db, venueId, { imageIds, hallId }) {
  await db.query(
    `UPDATE venue_images SET hall_id = $3 WHERE venue_id = $1 AND image_id = ANY ($2::uuid[]) AND hall_id IS NULL`,
    [venueId, imageIds, hallId],
  )
}

// ---------------------------------------------------------------- menus and add-ons (REQ-6)

export async function activeMenus(db, venueId) {
  const { rows } = await db.query(
    `SELECT m.*, coalesce((SELECT jsonb_agg(jsonb_build_object('name', i.name, 'category', i.category)
                                            ORDER BY i.sort_order, i.item_id)
                             FROM menu_items i WHERE i.menu_id = m.menu_id), '[]'::jsonb) AS items
       FROM menu_packages m WHERE m.venue_id = $1 AND m.archived_at IS NULL ORDER BY m.sort_order, m.menu_id`,
    [venueId],
  )
  return rows
}

// A booking (any status) points at it: it must never change (bookings keep the package they were made with).
export async function menuInUse(db, menuId) {
  const { rows } = await db.query('SELECT 1 FROM bookings WHERE menu_package_id = $1 LIMIT 1', [menuId])
  return rows.length > 0
}

export async function archiveMenu(db, menuId) {
  await db.query('UPDATE menu_packages SET archived_at = now() WHERE menu_id = $1', [menuId])
}

export async function deleteMenu(db, menuId) {
  await db.query('DELETE FROM menu_packages WHERE menu_id = $1', [menuId])
}

export async function setMenuOrder(db, menuId, sortOrder) {
  await db.query('UPDATE menu_packages SET sort_order = $2 WHERE menu_id = $1', [menuId, sortOrder])
}

export async function updateMenu(db, menuId, m) {
  await db.query(
    `UPDATE menu_packages SET name = $2, description = $3, price_per_head = $4, is_customizable = $5, min_guests = $6,
            sort_order = $7
      WHERE menu_id = $1`,
    [menuId, m.name, m.description, m.pricePerHead, m.isCustomizable, m.minGuests, m.sortOrder],
  )
  await db.query('DELETE FROM menu_items WHERE menu_id = $1', [menuId])
  await insertMenuItems(db, menuId, m.items)
}

export async function insertMenuReturning(db, venueId, m) {
  const { rows } = await db.query(
    `INSERT INTO menu_packages (venue_id, name, description, price_per_head, is_customizable, min_guests, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING menu_id`,
    [venueId, m.name, m.description, m.pricePerHead, m.isCustomizable, m.minGuests, m.sortOrder],
  )
  await insertMenuItems(db, rows[0].menu_id, m.items)
  return rows[0].menu_id
}

async function insertMenuItems(db, menuId, items) {
  if (!items.length) return
  await db.query(
    `INSERT INTO menu_items (menu_id, name, category, is_optional, sort_order)
     SELECT $1, name, cat, false, ord FROM unnest($2::text[], $3::text[], $4::smallint[]) AS t(name, cat, ord)`,
    [menuId, items.map((i) => i.name), items.map((i) => i.category), items.map((_i, n) => n)],
  )
}

export async function nextMenuOrder(db, venueId) {
  const { rows } = await db.query(
    `SELECT coalesce(max(sort_order) + 1, 0)::int AS n FROM menu_packages WHERE venue_id = $1 AND archived_at IS NULL`,
    [venueId],
  )
  return rows[0].n
}

// venues.base_price (ERD, REQ-5) = the cheapest live package per guest; search and cards use it.
export async function recomputeBasePrice(db, venueId) {
  await db.query(
    `UPDATE venues SET base_price = coalesce(
       (SELECT min(price_per_head) FROM menu_packages WHERE venue_id = $1 AND archived_at IS NULL), base_price)
      WHERE venue_id = $1`,
    [venueId],
  )
}

export async function activeAddOns(db, venueId) {
  const { rows } = await db.query(
    `SELECT * FROM add_ons WHERE venue_id = $1 AND archived_at IS NULL ORDER BY type, add_on_id`,
    [venueId],
  )
  return rows
}

export async function addOnInUse(db, addOnId) {
  const { rows } = await db.query('SELECT 1 FROM booking_add_ons WHERE add_on_id = $1 LIMIT 1', [addOnId])
  return rows.length > 0
}

export async function archiveAddOn(db, addOnId) {
  await db.query('UPDATE add_ons SET archived_at = now() WHERE add_on_id = $1', [addOnId])
}

export async function deleteAddOn(db, addOnId) {
  await db.query('DELETE FROM add_ons WHERE add_on_id = $1', [addOnId])
}

export async function updateAddOn(db, addOnId, a) {
  await db.query(
    `UPDATE add_ons SET type = $2::add_on_type, name = $3, description = $4, price = $5 WHERE add_on_id = $1`,
    [addOnId, a.type, a.name, a.description, a.price],
  )
}

export async function insertAddOnReturning(db, venueId, a) {
  const { rows } = await db.query(
    `INSERT INTO add_ons (venue_id, type, name, description, price, is_available)
     VALUES ($1, $2::add_on_type, $3, $4, $5, true) RETURNING add_on_id`,
    [venueId, a.type, a.name, a.description, a.price],
  )
  return rows[0].add_on_id
}

// ---------------------------------------------------------------- revisions (REQ-5)

const PENDING_SQL = `SELECT * FROM venue_revisions WHERE venue_id = $1 AND status = 'pending'`
const PENDING_LOCK_SQL = `SELECT * FROM venue_revisions WHERE venue_id = $1 AND status = 'pending' FOR UPDATE`

export async function findPendingRevision(db, venueId, { lock = false } = {}) {
  const { rows } = await db.query(lock ? PENDING_LOCK_SQL : PENDING_SQL, [venueId])
  return rows[0] ?? null
}

export async function latestRevision(db, venueId) {
  const { rows } = await db.query(
    `SELECT * FROM venue_revisions WHERE venue_id = $1 ORDER BY submitted_at DESC, revision_id DESC LIMIT 1`,
    [venueId],
  )
  return rows[0] ?? null
}

export async function insertRevision(db, { venueId, ownerId, changes, previous }) {
  const { rows } = await db.query(
    `INSERT INTO venue_revisions (venue_id, owner_id, changes, previous) VALUES ($1, $2, $3, $4)
     RETURNING revision_id, status, submitted_at`,
    [venueId, ownerId, changes, previous],
  )
  return rows[0]
}

export async function replaceRevision(db, revisionId, { changes, previous }) {
  const { rows } = await db.query(
    `UPDATE venue_revisions SET changes = $2, previous = $3, submitted_at = now() WHERE revision_id = $1
     RETURNING revision_id, status, submitted_at`,
    [revisionId, changes, previous],
  )
  return rows[0]
}

export async function setRevisionStatus(db, revisionId, { status, adminId = null, note = null }) {
  await db.query(
    `UPDATE venue_revisions
        SET status = $2, decided_by = $3, admin_note = $4,
            decided_at = CASE WHEN $2 IN ('approved', 'rejected') THEN now() ELSE decided_at END
      WHERE revision_id = $1`,
    [revisionId, status, adminId, note],
  )
}

export async function lockRevision(db, revisionId) {
  const { rows } = await db.query('SELECT * FROM venue_revisions WHERE revision_id = $1 FOR UPDATE', [revisionId])
  return rows[0] ?? null
}

export async function listRevisions(db, { status, limit, offset }) {
  const { rows } = await db.query(
    `SELECT r.revision_id, r.venue_id, r.status, r.submitted_at, r.decided_at, r.admin_note, r.changes, r.previous,
            v.name AS venue_name, v.city, u.name AS owner_name, count(*) OVER ()::int AS total
       FROM venue_revisions r
       JOIN venues v ON v.venue_id = r.venue_id
       JOIN users u ON u.user_id = r.owner_id
      WHERE ($1::text IS NULL OR r.status = $1)
      ORDER BY CASE WHEN r.status = 'pending' THEN r.submitted_at END ASC, r.submitted_at DESC
      LIMIT $2 OFFSET $3`,
    [status ?? null, limit, offset],
  )
  return rows
}

export async function revisionCounts(db) {
  const { rows } = await db.query(`SELECT status, count(*)::int AS n FROM venue_revisions GROUP BY status`)
  return rows
}

export async function findRevision(db, revisionId) {
  const { rows } = await db.query(
    `SELECT r.*, v.name AS venue_name, v.city, v.approval_status, v.is_active, u.name AS owner_name,
            u.email AS owner_email
       FROM venue_revisions r
       JOIN venues v ON v.venue_id = r.venue_id
       JOIN users u ON u.user_id = r.owner_id
      WHERE r.revision_id = $1`,
    [revisionId],
  )
  return rows[0] ?? null
}

// ---------------------------------------------------------------- applying an approved revision

export async function updateApprovalFields(db, venueId, v) {
  await db.query(
    `UPDATE venues SET name = $2, address = $3, city = $4, location = ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
            category = $7, area = $8, postal_code = $9, supported_events = $10::event_type[], facilities = $11,
            description = $12, venue_type = $13::venue_type, capacity = $14, advance_percent = $15,
            cancellation_policy = $16, cancellation_note = $17, booking_days = $18
      WHERE venue_id = $1`,
    [
      venueId,
      v.name,
      v.address,
      v.city,
      v.lng,
      v.lat,
      v.category,
      v.area,
      v.postalCode,
      v.supportedEvents,
      v.facilities,
      v.description,
      v.venueType,
      v.capacity,
      v.advancePercent,
      v.cancellationPolicy,
      v.cancellationNote,
      v.bookingDays,
    ],
  )
}

// A hall a booking uses (directly or through one of its slots) can't be removed.
export async function hallInUse(db, hallId) {
  const { rows } = await db.query(
    `SELECT 1 FROM bookings b WHERE b.hall_id = $1
     UNION ALL
     SELECT 1 FROM bookings b JOIN time_slots s ON s.slot_id = b.slot_id WHERE s.hall_id = $1
     LIMIT 1`,
    [hallId],
  )
  return rows.length > 0
}

// Renames are applied in two steps so swapping two hall names never trips halls_name_per_venue.
export async function parkHallNames(db, venueId) {
  await db.query(`UPDATE halls SET name = name || ' #' || hall_id WHERE venue_id = $1`, [venueId])
}

export async function updateHall(db, venueId, h) {
  await db.query(
    `UPDATE halls SET name = $3, capacity = $4, standing_capacity = $5, setting = $6::venue_type, has_ac = $7,
            length_ft = $8, width_ft = $9, ceiling_ft = $10, description = $11, zone_stage = $12, zone_entrance = $13,
            zone_seating = $14, walkthrough_mode = $15, walkthrough_url = $16, sort_order = $17
      WHERE venue_id = $1 AND hall_id = $2`,
    [
      venueId,
      h.hallId,
      h.name,
      h.capacity,
      h.standingCapacity,
      h.setting,
      h.hasAc,
      h.lengthFt,
      h.widthFt,
      h.ceilingFt,
      h.description,
      h.zones.stage,
      h.zones.entrance,
      h.zones.seating,
      h.walkthroughMode,
      h.walkthroughUrl,
      h.sortOrder,
    ],
  )
}

export async function setFloorPlan(db, hallId, { url, type }) {
  const { rows } = await db.query(
    `UPDATE halls h SET floor_plan_url = $2, floor_plan_type = $3
       FROM (SELECT floor_plan_url AS old FROM halls WHERE hall_id = $1) o
      WHERE h.hall_id = $1 RETURNING o.old`,
    [hallId, url, type],
  )
  return rows[0]?.old ?? null
}

export async function deleteWalkthroughs(db, hallId) {
  const { rows } = await db.query('DELETE FROM walkthrough_assets WHERE hall_id = $1 RETURNING file_url', [hallId])
  return rows.map((r) => r.file_url)
}

export async function deleteHall(db, hallId) {
  const { rows } = await db.query(
    `SELECT floor_plan_url AS url FROM halls WHERE hall_id = $1 AND floor_plan_url IS NOT NULL
     UNION ALL SELECT file_url FROM walkthrough_assets WHERE hall_id = $1`,
    [hallId],
  )
  await db.query('DELETE FROM halls WHERE hall_id = $1', [hallId]) // its free slots and walkthroughs cascade
  return rows.map((r) => r.url)
}

export async function deleteBridalSuite(db, venueId) {
  await db.query('DELETE FROM bridal_suites WHERE venue_id = $1', [venueId])
}

export async function deleteSlotTemplates(db, venueId) {
  await db.query('DELETE FROM venue_slot_templates WHERE venue_id = $1', [venueId])
}

export async function deleteTiers(db, venueId) {
  await db.query('DELETE FROM venue_cancellation_tiers WHERE venue_id = $1', [venueId])
}

// New slot times or booking days: the calendar from today is rebuilt. Slots that are held, booked or blocked, or that
// any booking points at, are kept (generateSlots then skips anything overlapping them).
export async function deleteFutureFreeSlots(db, venueId) {
  const { rowCount } = await db.query(
    `DELETE FROM time_slots t
      WHERE t.venue_id = $1 AND t.status = 'available'
        AND t.date >= (now() AT TIME ZONE 'Asia/Karachi')::date
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = t.slot_id)`,
    [venueId],
  )
  return rowCount
}
