// SQL only (docs/architecture.md "Layers"). Every function takes `db` (the pool or a transaction client) first.
// Values always go through $n placeholders; the query texts are fixed strings (optional filters are `$n IS NULL OR`).
//
// Public = approval_status 'approved' AND is_active (REQ-7, srs-alignment #29): pending, rejected,
// changes_requested and suspended venues never come back from the public queries here.

const CARD_COLUMNS = `
  v.venue_id, v.name, v.area, v.city, v.capacity, v.base_price, v.avg_rating, v.venue_type,
  v.supported_events::text[] AS supported_events, -- enum arrays come back as '{a,b}' strings without the cast
  v.facilities, v.category, v.reviewed_at, v.created_at, v.google_maps_url,
  ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lng,
  (SELECT count(*) FROM halls h WHERE h.venue_id = v.venue_id)::int AS hall_count,
  (SELECT count(*) FROM reviews r WHERE r.venue_id = v.venue_id AND r.removed_at IS NULL)::int AS review_count,
  (SELECT i.image_url FROM venue_images i
    WHERE i.venue_id = v.venue_id AND i.is_published
    ORDER BY i.is_cover DESC, i.sort_order, i.image_id LIMIT 1) AS cover_url,
  (SELECT min(t.date) FROM time_slots t
    WHERE t.venue_id = v.venue_id AND t.status = 'available'
      AND t.date >= (now() AT TIME ZONE 'Asia/Karachi')::date) AS next_free_date,
  EXISTS (SELECT 1 FROM halls h WHERE h.venue_id = v.venue_id AND h.walkthrough_mode <> 'skip') AS has_walkthrough`

export function toCardRow(row) {
  return {
    id: row.venue_id,
    name: row.name,
    area: row.area,
    city: row.city,
    capacity: row.capacity,
    basePrice: row.base_price,
    avgRating: Number(row.avg_rating),
    venueType: row.venue_type,
    supportedEvents: row.supported_events,
    facilities: row.facilities,
    category: row.category,
    googleMapsUrl: row.google_maps_url ?? null,
    approvedAt: row.reviewed_at,
    createdAt: row.created_at,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    hallCount: row.hall_count,
    reviewCount: row.review_count,
    coverUrl: row.cover_url,
    nextFreeDate: row.next_free_date,
    hasWalkthrough: row.has_walkthrough,
  }
}

const PUBLIC_CARDS_SQL = `SELECT ${CARD_COLUMNS}
  FROM venues v
 WHERE v.approval_status = 'approved' AND v.is_active`

// Every public venue as a card row (the landing page builds its rows from these; the catalogue is small).
export async function listPublicCards(db) {
  const { rows } = await db.query(PUBLIC_CARDS_SQL)
  return rows.map(toCardRow)
}

// REQ-12 search with the Explore page's filters. Every filter is optional (NULL / empty array = not used).
// "Free on a date" = at least one hall has an available slot that day. Price is the cheapest package per head.
const SEARCH_SQL = `WITH matches AS (
  SELECT ${CARD_COLUMNS}
    FROM venues v
   WHERE v.approval_status = 'approved' AND v.is_active
     AND ($1::text IS NULL OR v.city ILIKE '%' || $1 || '%' OR v.area ILIKE '%' || $1 || '%' OR v.name ILIKE '%' || $1 || '%')
     AND ($2::date IS NULL OR EXISTS (SELECT 1 FROM time_slots t WHERE t.venue_id = v.venue_id AND t.date = $2 AND t.status = 'available'))
     AND ($3::int IS NULL OR v.capacity >= $3)
     AND ($4::event_type IS NULL OR $4::event_type = ANY (v.supported_events))
     AND ($5::numeric IS NULL OR v.base_price >= $5)
     AND ($6::numeric IS NULL OR v.base_price <= $6)
     AND v.capacity >= $7::int
     AND ($8::int IS NULL OR v.capacity <= $8)
     AND v.avg_rating >= $9::real
     AND (cardinality($10::venue_type[]) = 0 OR v.venue_type = ANY ($10::venue_type[]))
     AND v.facilities @> $11::text[]
     AND ($12::uuid[] IS NULL OR v.venue_id = ANY ($12::uuid[]))
)
SELECT *, count(*) OVER ()::int AS total
  FROM matches
 ORDER BY
   CASE WHEN $13 = 'price-asc' THEN base_price END ASC,
   CASE WHEN $13 = 'price-desc' THEN base_price END DESC,
   CASE WHEN $13 = 'rating' THEN avg_rating END DESC,
   CASE WHEN $13 = 'rating' THEN review_count END DESC,
   CASE WHEN $13 = 'capacity' THEN capacity END DESC,
   avg_rating + log(review_count + 1) / 4 DESC,
   name ASC
 LIMIT $14 OFFSET $15`

export async function searchPublic(db, f) {
  const { rows } = await db.query(SEARCH_SQL, [
    f.city || null,
    f.date || null,
    f.guests ?? null,
    f.eventType || null,
    f.priceMin ?? null,
    f.priceMax ?? null,
    f.capacityMin,
    f.capacityMax ?? null,
    f.minRating,
    f.settings,
    f.amenities,
    f.venueIds ?? null,
    f.sort,
    f.limit,
    f.offset,
  ])
  return { rows: rows.map(toCardRow), total: rows[0]?.total ?? 0 }
}

export async function publicPriceRange(db) {
  const { rows } = await db.query(
    `SELECT min(base_price) AS min, max(base_price) AS max FROM venues WHERE approval_status = 'approved' AND is_active`,
  )
  return rows[0]
}

export async function platformStats(db) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS venue_count,
            count(DISTINCT v.city)::int AS city_count,
            coalesce(sum((SELECT count(*) FROM halls h WHERE h.venue_id = v.venue_id)), 0)::int AS hall_count,
            avg(v.avg_rating) FILTER (WHERE EXISTS (SELECT 1 FROM reviews r WHERE r.venue_id = v.venue_id AND r.removed_at IS NULL)) AS average_rating
       FROM venues v
      WHERE v.approval_status = 'approved' AND v.is_active`,
  )
  return rows[0]
}

// REQ-12 / REQ-4: a customer's search is saved to their history.
export async function insertSearch(db, { customerId, queryText, filters, resultsCount }) {
  await db.query(
    `INSERT INTO search_history (customer_id, query_text, filters, results_count) VALUES ($1, $2, $3::jsonb, $4)`,
    [customerId, queryText, JSON.stringify(filters), resultsCount],
  )
}

// ---------------------------------------------------------------- one venue, everything (detail, review, editing)

export async function findVenueBase(db, venueId) {
  const { rows } = await db.query(
    `SELECT v.*, v.supported_events::text[] AS supported_events, -- pg returns enum arrays as strings otherwise
            ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lng,
            u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone, o.business_name
       FROM venues v
       JOIN venue_owners o ON o.user_id = v.owner_id
       JOIN users u ON u.user_id = v.owner_id
      WHERE v.venue_id = $1`,
    [venueId],
  )
  return rows[0] ?? null
}

// All the rows a venue page, the admin review or the owner's edit needs. publishedOnly: only published photos.
export async function loadVenueBundle(db, venueId, { publishedOnly = true } = {}) {
  const base = await findVenueBase(db, venueId)
  if (!base) return null
  const [halls, images, menus, items, addOns, suite, templates, tiers, walkthroughs] = await Promise.all([
    db.query('SELECT * FROM halls WHERE venue_id = $1 ORDER BY sort_order, created_at, hall_id', [venueId]),
    db.query(
      `SELECT i.*,
              (SELECT v.ai_score FROM image_verifications v WHERE v.image_id = i.image_id
                ORDER BY v.checked_at DESC LIMIT 1) AS ai_score
         FROM venue_images i
        WHERE i.venue_id = $1 AND (NOT $2::boolean OR i.is_published)
        ORDER BY i.sort_order, i.image_id`,
      [venueId, publishedOnly],
    ),
    // Archived packages and add-ons (replaced or removed, kept for old bookings, migration 006) are never shown.
    db.query('SELECT * FROM menu_packages WHERE venue_id = $1 AND archived_at IS NULL ORDER BY sort_order, menu_id', [
      venueId,
    ]),
    db.query(
      `SELECT mi.* FROM menu_items mi JOIN menu_packages m USING (menu_id)
        WHERE m.venue_id = $1 AND m.archived_at IS NULL ORDER BY mi.sort_order, mi.item_id`,
      [venueId],
    ),
    db.query('SELECT * FROM add_ons WHERE venue_id = $1 AND archived_at IS NULL ORDER BY type, add_on_id', [venueId]),
    db.query('SELECT * FROM bridal_suites WHERE venue_id = $1', [venueId]),
    db.query('SELECT * FROM venue_slot_templates WHERE venue_id = $1 ORDER BY start_time', [venueId]),
    db.query('SELECT * FROM venue_cancellation_tiers WHERE venue_id = $1 ORDER BY from_days DESC', [venueId]),
    db.query('SELECT * FROM walkthrough_assets WHERE venue_id = $1 ORDER BY uploaded_at', [venueId]),
  ])
  return {
    base,
    halls: halls.rows,
    images: images.rows,
    menus: menus.rows,
    items: items.rows,
    addOns: addOns.rows,
    bridalSuite: suite.rows[0] ?? null,
    slotTemplates: templates.rows,
    tiers: tiers.rows,
    walkthroughs: walkthroughs.rows,
  }
}

// Reviews (REQ-42), newest first, with the reviewer's name / city and the event type of the booking.
export async function findReviews(db, venueId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT r.review_id, r.rating, r.comment, r.created_at, u.name AS customer_name, u.city AS customer_city,
            b.event_type
       FROM reviews r
       JOIN users u ON u.user_id = r.customer_id
       JOIN bookings b ON b.booking_id = r.booking_id
      WHERE r.venue_id = $1 AND r.removed_at IS NULL
      ORDER BY r.created_at DESC, r.review_id
      LIMIT $2 OFFSET $3`,
    [venueId, limit, offset],
  )
  return rows
}

export async function ratingCounts(db, venueId) {
  const { rows } = await db.query(
    `SELECT rating, count(*)::int AS n FROM reviews WHERE venue_id = $1 AND removed_at IS NULL GROUP BY rating`,
    [venueId],
  )
  return rows
}

// Days (from today) where the venue has slots but none of them is available: the calendar shows them as booked.
export async function fullyBookedDates(db, venueId, { days = 120 } = {}) {
  const { rows } = await db.query(
    `SELECT to_char(date, 'YYYY-MM-DD') AS day
       FROM time_slots
      WHERE venue_id = $1
        AND date >= (now() AT TIME ZONE 'Asia/Karachi')::date
        AND date < (now() AT TIME ZONE 'Asia/Karachi')::date + $2::int
      GROUP BY date
     HAVING bool_and(status <> 'available')
      ORDER BY date`,
    [venueId, days],
  )
  return rows.map((r) => r.day)
}

// Slots per hall between two dates (inclusive), for the availability calendar.
export async function findSlots(db, venueId, { from, to }) {
  const { rows } = await db.query(
    `SELECT t.slot_id, t.hall_id, to_char(t.date, 'YYYY-MM-DD') AS date, to_char(t.start_time, 'HH24:MI') AS start_time,
            to_char(t.end_time, 'HH24:MI') AS end_time,
            -- REQ-18 lazy release: a hold past held_until is free again, whatever the release job has done
            CASE WHEN t.status = 'held' AND t.held_until <= now() THEN 'available' ELSE t.status::text END AS status,
            CASE WHEN t.status = 'held' AND t.held_until > now() THEN t.held_by END AS held_by,
            CASE WHEN t.status = 'held' AND t.held_until > now() THEN t.held_until END AS held_until
       FROM time_slots t JOIN halls h ON h.hall_id = t.hall_id
      WHERE t.venue_id = $1 AND t.date BETWEEN $2::date AND $3::date
      ORDER BY t.date, t.start_time, h.sort_order, t.hall_id`,
    [venueId, from, to],
  )
  return rows
}

// Generates the bookable calendar from the venue's slot templates and booking days: every hall, every slot type,
// for the next `days` days. Existing slots are left alone (ON CONFLICT DO NOTHING also skips overlaps).
export async function generateSlots(db, venueId, { days = 60 } = {}) {
  const { rowCount } = await db.query(
    `INSERT INTO time_slots (venue_id, hall_id, date, start_time, end_time)
     SELECT h.venue_id, h.hall_id, d::date, t.start_time, t.end_time
       FROM halls h
       JOIN venue_slot_templates t ON t.venue_id = h.venue_id
       JOIN venues v ON v.venue_id = h.venue_id
      CROSS JOIN generate_series((now() AT TIME ZONE 'Asia/Karachi')::date,
                                 (now() AT TIME ZONE 'Asia/Karachi')::date + ($2::int - 1), interval '1 day') AS d
      WHERE h.venue_id = $1
        AND (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM d)::int + 1] = ANY (v.booking_days)
     ON CONFLICT DO NOTHING`,
    [venueId, days],
  )
  return rowCount
}
