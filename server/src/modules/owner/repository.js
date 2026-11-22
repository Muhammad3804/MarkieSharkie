// SQL only. Every function takes `db` first; values go through $n placeholders.

// ---------------------------------------------------------------- drafts (one per owner and listing)

export async function findDraft(db, { ownerId, venueId }) {
  const { rows } = await db.query(
    `SELECT data, updated_at FROM venue_drafts WHERE owner_id = $1 AND venue_id IS NOT DISTINCT FROM $2`,
    [ownerId, venueId],
  )
  return rows[0] ?? null
}

export async function upsertDraft(db, { ownerId, venueId, data }) {
  const { rows } = await db.query(
    `INSERT INTO venue_drafts (owner_id, venue_id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT ON CONSTRAINT venue_drafts_one_per_listing
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING updated_at`,
    [ownerId, venueId, JSON.stringify(data)],
  )
  return rows[0].updated_at
}

export async function deleteDraft(db, { ownerId, venueId }) {
  await db.query(`DELETE FROM venue_drafts WHERE owner_id = $1 AND venue_id IS NOT DISTINCT FROM $2`, [
    ownerId,
    venueId,
  ])
}

// ---------------------------------------------------------------- uploads

export async function countRecentUploads(db, ownerId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM media_uploads WHERE owner_id = $1 AND created_at > now() - interval '24 hours'`,
    [ownerId],
  )
  return rows[0].n
}

export async function insertUpload(db, { ownerId, kind, storageKey, mimeType, size }) {
  const { rows } = await db.query(
    `INSERT INTO media_uploads (owner_id, kind, storage_key, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5) RETURNING upload_id, created_at`,
    [ownerId, kind, storageKey, mimeType, size],
  )
  return rows[0]
}

// The owner's own uploads with these ids, locked for the submission. Others' ids simply don't come back.
export async function findUploadsForUpdate(db, { ownerId, ids }) {
  const { rows } = await db.query(
    `SELECT upload_id, kind, storage_key, mime_type, size_bytes, venue_id
       FROM media_uploads WHERE owner_id = $1 AND upload_id = ANY ($2::uuid[]) FOR UPDATE`,
    [ownerId, ids],
  )
  return rows
}

export async function attachUploads(db, { venueId, ids }) {
  await db.query(`UPDATE media_uploads SET venue_id = $1 WHERE upload_id = ANY ($2::uuid[])`, [venueId, ids])
}

// ---------------------------------------------------------------- venues

export async function findOwnedVenueForUpdate(db, { venueId, ownerId }) {
  const { rows } = await db.query(
    `SELECT venue_id, owner_id, approval_status FROM venues WHERE venue_id = $1 AND owner_id = $2 FOR UPDATE`,
    [venueId, ownerId],
  )
  return rows[0] ?? null
}

export async function isOwner(db, { venueId, ownerId }) {
  const { rows } = await db.query(`SELECT 1 FROM venues WHERE venue_id = $1 AND owner_id = $2`, [venueId, ownerId])
  return rows.length > 0
}

const VENUE_FIELDS = `name = $3, address = $4, city = $5, location = ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
  venue_type = $8::venue_type, supported_events = $9::event_type[], capacity = $10, base_price = $11,
  facilities = $12, description = $13, category = $14, headline = $15, area = $16, postal_code = $17,
  google_maps_url = $18, hosting_since = $19, landmark = $20, landmark_minutes = $21, directions = $22,
  parking_spaces = $23, house_rules = $24, custom_menu_note = $25, advance_percent = $26,
  cancellation_policy = $27, cancellation_note = $28, booking_days = $29`

const venueParams = (venueId, ownerId, v) => [
  venueId,
  ownerId,
  v.name,
  v.address,
  v.city,
  v.lng,
  v.lat,
  v.venueType,
  v.supportedEvents,
  v.capacity,
  v.basePrice,
  v.facilities,
  v.description,
  v.category,
  v.headline,
  v.area,
  v.postalCode,
  v.googleMapsUrl,
  v.hostingSince,
  v.landmark,
  v.landmarkMinutes,
  v.directions,
  v.parkingSpaces,
  v.houseRules,
  v.customMenuNote,
  v.advancePercent,
  v.cancellationPolicy,
  v.cancellationNote,
  v.bookingDays,
]

const INSERT_VENUE_SQL = `INSERT INTO venues (venue_id, owner_id, name, address, city, location, venue_type, supported_events,
    capacity, base_price, facilities, description, category, headline, area, postal_code, google_maps_url,
    hosting_since, landmark, landmark_minutes, directions, parking_spaces, house_rules, custom_menu_note,
    advance_percent, cancellation_policy, cancellation_note, booking_days, approval_status, submitted_at)
  VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8::venue_type, $9::event_type[],
    $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
    'pending', now())
  RETURNING venue_id, approval_status, submitted_at`

export async function insertVenue(db, { venueId, ownerId, venue }) {
  const { rows } = await db.query(INSERT_VENUE_SQL, venueParams(venueId, ownerId, venue))
  return rows[0]
}

// Resubmission (REQ-5 "changed venue goes to Admin approval"): new values, back to pending, the admin's earlier
// reason / note cleared.
const UPDATE_VENUE_SQL = `UPDATE venues SET ${VENUE_FIELDS},
    approval_status = 'pending', rejection_reason = NULL, changes_note = NULL, submitted_at = now()
  WHERE venue_id = $1 AND owner_id = $2
  RETURNING venue_id, approval_status, submitted_at`

export async function updateVenue(db, { venueId, ownerId, venue }) {
  const { rows } = await db.query(UPDATE_VENUE_SQL, venueParams(venueId, ownerId, venue))
  return rows[0]
}

// Children are replaced on resubmit (only possible before approval, so no slot or booking can point at them).
// Returns the storage keys of the files that were attached, so the caller can delete the ones no longer used.
export async function deleteVenueChildren(db, venueId) {
  const { rows } = await db.query(
    `SELECT image_url AS url FROM venue_images WHERE venue_id = $1
     UNION ALL SELECT floor_plan_url FROM halls WHERE venue_id = $1 AND floor_plan_url IS NOT NULL
     UNION ALL SELECT file_url FROM walkthrough_assets WHERE venue_id = $1`,
    [venueId],
  )
  await db.query('DELETE FROM venue_images WHERE venue_id = $1', [venueId])
  await db.query('DELETE FROM walkthrough_assets WHERE venue_id = $1', [venueId])
  await db.query('DELETE FROM menu_packages WHERE venue_id = $1', [venueId])
  await db.query('DELETE FROM add_ons WHERE venue_id = $1', [venueId])
  await db.query('DELETE FROM bridal_suites WHERE venue_id = $1', [venueId])
  await db.query('DELETE FROM venue_slot_templates WHERE venue_id = $1', [venueId])
  await db.query('DELETE FROM venue_cancellation_tiers WHERE venue_id = $1', [venueId])
  await db.query('DELETE FROM halls WHERE venue_id = $1', [venueId])
  return rows.map((r) => r.url)
}

export async function insertHall(db, venueId, h) {
  await db.query(
    `INSERT INTO halls (hall_id, venue_id, name, capacity, standing_capacity, setting, has_ac, length_ft, width_ft,
                        ceiling_ft, description, floor_plan_url, floor_plan_type, zone_stage, zone_entrance,
                        zone_seating, walkthrough_mode, walkthrough_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6::venue_type, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      h.hallId,
      venueId,
      h.name,
      h.capacity,
      h.standingCapacity,
      h.setting,
      h.hasAc,
      h.lengthFt,
      h.widthFt,
      h.ceilingFt,
      h.description,
      h.floorPlanUrl,
      h.floorPlanType,
      h.zones.stage,
      h.zones.entrance,
      h.zones.seating,
      h.walkthroughMode,
      h.walkthroughUrl,
      h.sortOrder,
    ],
  )
}

export async function insertImages(db, venueId, images) {
  await db.query(
    `INSERT INTO venue_images (venue_id, hall_id, category, image_url, sort_order, is_cover, mime_type, size_bytes,
                               verification_status, is_published)
     SELECT $1, hall, cat, url, ord, cover, mime, size, 'pending', false
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::smallint[], $6::boolean[], $7::text[], $8::int[])
            AS t(hall, cat, url, ord, cover, mime, size)`,
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
}

export async function insertWalkthrough(db, venueId, { hallId, assetType, url }) {
  await db.query(
    `INSERT INTO walkthrough_assets (venue_id, hall_id, asset_type, file_url) VALUES ($1, $2, $3::asset_type, $4)`,
    [venueId, hallId, assetType, url],
  )
}

export async function insertMenu(db, venueId, menu) {
  const { rows } = await db.query(
    `INSERT INTO menu_packages (venue_id, name, description, price_per_head, is_customizable, min_guests, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING menu_id`,
    [venueId, menu.name, menu.description, menu.pricePerHead, menu.isCustomizable, menu.minGuests, menu.sortOrder],
  )
  const menuId = rows[0].menu_id
  if (menu.items.length) {
    await db.query(
      `INSERT INTO menu_items (menu_id, name, category, is_optional, sort_order)
       SELECT $1, name, cat, false, ord FROM unnest($2::text[], $3::text[], $4::smallint[]) AS t(name, cat, ord)`,
      [menuId, menu.items.map((i) => i.name), menu.items.map((i) => i.category), menu.items.map((_i, n) => n)],
    )
  }
}

export async function insertAddOn(db, venueId, a) {
  await db.query(
    `INSERT INTO add_ons (venue_id, type, name, description, price, is_available) VALUES ($1, $2::add_on_type, $3, $4, $5, true)`,
    [venueId, a.type, a.name, a.description, a.price],
  )
}

export async function insertBridalSuite(db, venueId, s) {
  await db.query(
    `INSERT INTO bridal_suites (venue_id, name, capacity, length_ft, width_ft, description) VALUES ($1, $2, $3, $4, $5, $6)`,
    [venueId, s.name, s.capacity, s.lengthFt, s.widthFt, s.description],
  )
}

export async function insertSlotTemplate(db, venueId, { type, start, end }) {
  await db.query(
    `INSERT INTO venue_slot_templates (venue_id, slot_type, start_time, end_time) VALUES ($1, $2, $3, $4)`,
    [venueId, type, start, end],
  )
}

export async function insertTier(db, venueId, t) {
  await db.query(
    `INSERT INTO venue_cancellation_tiers (venue_id, from_days, to_days, refund_percent) VALUES ($1, $2, $3, $4)`,
    [venueId, t.fromDays, t.toDays, t.refundPercent],
  )
}

// "My venues" with the admin's reason or note and the REQ-9 photo check results.
export async function listOwnerVenues(db, ownerId) {
  const { rows } = await db.query(
    `SELECT v.venue_id, v.name, v.city, v.area, v.approval_status, v.is_active, v.rejection_reason, v.changes_note,
            v.suspension_reason, v.submitted_at, v.reviewed_at, v.created_at,
            (SELECT i.image_url FROM venue_images i WHERE i.venue_id = v.venue_id
              ORDER BY i.is_cover DESC, i.sort_order LIMIT 1) AS cover_url,
            (SELECT jsonb_build_object('id', r.revision_id, 'status', r.status, 'submittedAt', r.submitted_at,
                                       'decidedAt', r.decided_at, 'note', r.admin_note)
               FROM venue_revisions r WHERE r.venue_id = v.venue_id
              ORDER BY r.submitted_at DESC, r.revision_id DESC LIMIT 1) AS revision,
            (SELECT jsonb_object_agg(s, n) FROM (
               SELECT verification_status::text AS s, count(*)::int AS n FROM venue_images i
                WHERE i.venue_id = v.venue_id GROUP BY 1) x) AS photo_checks
       FROM venues v
      WHERE v.owner_id = $1
      ORDER BY coalesce(v.submitted_at, v.created_at) DESC`,
    [ownerId],
  )
  return rows
}
