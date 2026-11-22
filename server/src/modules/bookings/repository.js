// Booking engine SQL (EUC-14, 15, 16, 24, SYS-01, docs/booking-engine.md). Raw pg, $n parameters only.
// Lock order everywhere: the slot row first, then the booking row (no deadlocks).

// ---------------------------------------------------------------- slots and holds (REQ-16, REQ-18)

export async function lockSlot(db, slotId) {
  const { rows } = await db.query(
    `SELECT slot_id, venue_id, hall_id, to_char(date, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS start_time,
            to_char(end_time, 'HH24:MI') AS end_time, status, held_by, held_until,
            (status = 'held' AND held_until <= now()) AS hold_expired,
            (date < (now() AT TIME ZONE 'Asia/Karachi')::date) AS is_past
       FROM time_slots WHERE slot_id = $1 FOR UPDATE`,
    [slotId],
  )
  return rows[0] ?? null
}

export async function setHold(db, { slotId, customerId, minutes }) {
  const { rows } = await db.query(
    `UPDATE time_slots SET status = 'held', held_by = $2, held_until = now() + make_interval(mins => $3)
      WHERE slot_id = $1 RETURNING held_until`,
    [slotId, customerId, minutes],
  )
  return rows[0].held_until
}

export async function setSlotStatus(db, slotId, status) {
  await db.query(`UPDATE time_slots SET status = $2, held_by = NULL, held_until = NULL WHERE slot_id = $1`, [
    slotId,
    status,
  ])
}

// One running hold per customer per venue: placing a new one gives the others back.
export async function releaseOtherHolds(db, { customerId, venueId, exceptSlotId }) {
  await db.query(
    `UPDATE time_slots SET status = 'available', held_by = NULL, held_until = NULL
      WHERE held_by = $1 AND venue_id = $2 AND status = 'held' AND slot_id <> $3`,
    [customerId, venueId, exceptSlotId],
  )
}

// The release job (REQ-18). The lazy check in lockSlot keeps correctness without it.
export async function releaseExpiredHolds(db) {
  const { rows } = await db.query(
    `UPDATE time_slots SET status = 'available', held_by = NULL, held_until = NULL
      WHERE status = 'held' AND held_until <= now()
     RETURNING slot_id, venue_id`,
  )
  return rows
}

// EUC-14 2.1: other free dates for the same hall and time, and other free halls at the same date and time.
export async function alternatives(db, { venueId, hallId, date, startTime }) {
  const [dates, halls] = await Promise.all([
    db.query(
      `SELECT to_char(t.date, 'YYYY-MM-DD') AS date FROM time_slots t
        WHERE t.hall_id = $1 AND t.start_time = $3::time AND t.date >= (now() AT TIME ZONE 'Asia/Karachi')::date AND t.date <> $2::date AND (t.status = 'available' OR (t.status = 'held' AND t.held_until <= now()))
        ORDER BY abs(t.date - $2::date), t.date LIMIT 3`,
      [hallId, date, startTime],
    ),
    db.query(
      `SELECT h.hall_id, h.name, h.capacity FROM time_slots t JOIN halls h ON h.hall_id = t.hall_id
        WHERE t.venue_id = $1 AND t.date = $3::date AND t.start_time = $4::time AND t.hall_id <> $2 AND (t.status = 'available' OR (t.status = 'held' AND t.held_until <= now()))
        ORDER BY h.sort_order`,
      [venueId, hallId, date, startTime],
    ),
  ])
  return {
    dates: dates.rows.map((r) => r.date).sort(),
    halls: halls.rows.map((h) => ({ hallId: h.hall_id, name: h.name, capacity: h.capacity })),
  }
}

// ---------------------------------------------------------------- what a booking is priced from

// Bookable = approved, active, and the owner's account is active (REQ-7, REQ-5, REQ-47).
export async function findBookableVenue(db, venueId) {
  const { rows } = await db.query(
    `SELECT v.venue_id, v.owner_id, v.name, v.advance_percent, v.cancellation_policy, v.cancellation_note,
            (v.approval_status = 'approved' AND v.is_active AND u.is_active AND u.deleted_at IS NULL) AS bookable
       FROM venues v JOIN users u ON u.user_id = v.owner_id
      WHERE v.venue_id = $1`,
    [venueId],
  )
  return rows[0] ?? null
}

export async function findHall(db, hallId) {
  const { rows } = await db.query('SELECT hall_id, name, capacity FROM halls WHERE hall_id = $1', [hallId])
  return rows[0] ?? null
}

export async function findLiveMenu(db, { venueId, menuId }) {
  const { rows } = await db.query(
    `SELECT menu_id, name, price_per_head, min_guests FROM menu_packages
      WHERE menu_id = $1 AND venue_id = $2 AND archived_at IS NULL`,
    [menuId, venueId],
  )
  return rows[0] ?? null
}

export async function countLiveMenus(db, venueId) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS n FROM menu_packages WHERE venue_id = $1 AND archived_at IS NULL',
    [venueId],
  )
  return rows[0].n
}

export async function findLiveAddOns(db, { venueId, ids }) {
  const { rows } = await db.query(
    `SELECT add_on_id, name, price FROM add_ons
      WHERE venue_id = $1 AND add_on_id = ANY ($2::uuid[]) AND archived_at IS NULL AND is_available`,
    [venueId, ids],
  )
  return rows
}

export async function findTiers(db, venueId) {
  const { rows } = await db.query(
    'SELECT from_days, to_days, refund_percent FROM venue_cancellation_tiers WHERE venue_id = $1',
    [venueId],
  )
  return rows
}

// ---------------------------------------------------------------- bookings

export async function insertBooking(db, b) {
  const { rows } = await db.query(
    `INSERT INTO bookings (slot_id, customer_id, venue_id, hall_id, menu_package_id, menu_price_per_head, event_type,
                           guest_count, billable_guests, total_amount, hall_charge, advance_percent, advance_due,
                           policy_snapshot, customer_notes, event_name, host_name, host_phone, status, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7::event_type, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
             'requested', 'online')
     RETURNING booking_id`,
    [
      b.slotId,
      b.customerId,
      b.venueId,
      b.hallId,
      b.menuId,
      b.menuPricePerHead,
      b.eventType,
      b.guests,
      b.billable,
      b.total,
      b.hallCharge,
      b.advancePercent,
      b.advanceDue,
      b.policySnapshot,
      b.notes,
      b.eventName,
      b.hostName,
      b.hostPhone,
    ],
  )
  return rows[0].booking_id
}

export async function insertBookingAddOns(db, bookingId, addOns) {
  if (!addOns.length) return
  await db.query(
    `INSERT INTO booking_add_ons (booking_id, add_on_id, quantity, unit_price)
     SELECT $1, id, qty, price FROM unnest($2::uuid[], $3::int[], $4::numeric[]) AS t(id, qty, price)`,
    [bookingId, addOns.map((a) => a.addOnId), addOns.map((a) => a.quantity), addOns.map((a) => a.unitPrice)],
  )
}

export async function insertEvent(db, { bookingId, from = null, to, actorId = null, actorRole, reason = null }) {
  await db.query(
    `INSERT INTO booking_events (booking_id, from_status, to_status, actor_id, actor_role, reason)
     VALUES ($1, $2::booking_status, $3::booking_status, $4, $5, $6)`,
    [bookingId, from, to, actorId, actorRole, reason],
  )
}

// The booking row with its venue owner and event date, locked (after its slot).
export async function lockBooking(db, bookingId) {
  const { rows } = await db.query(
    `SELECT b.*, v.owner_id, to_char(s.date, 'YYYY-MM-DD') AS event_date,
            (s.date - (now() AT TIME ZONE 'Asia/Karachi')::date)::int AS days_before
       FROM bookings b JOIN venues v ON v.venue_id = b.venue_id JOIN time_slots s ON s.slot_id = b.slot_id
      WHERE b.booking_id = $1
      FOR UPDATE OF b`,
    [bookingId],
  )
  return rows[0] ?? null
}

export async function findSlotIdOfBooking(db, bookingId) {
  const { rows } = await db.query('SELECT slot_id FROM bookings WHERE booking_id = $1', [bookingId])
  return rows[0]?.slot_id ?? null
}

export async function closeBooking(db, { bookingId, closedAs, reason, refundPercent = null, refundAmount = null }) {
  await db.query(
    `UPDATE bookings SET status = 'cancelled', closed_as = $2, cancellation_reason = $3, refund_percent = $4,
            refund_amount = $5
      WHERE booking_id = $1`,
    [bookingId, closedAs, reason, refundPercent, refundAmount],
  )
}

export async function setBookingStatus(db, bookingId, status) {
  await db.query('UPDATE bookings SET status = $2::booking_status WHERE booking_id = $1', [bookingId, status])
}

// The nightly jobs, also run lazily before reads and changes (docs/booking-engine.md "Scheduled jobs"):
// requests the venue never answered expire after the event date; confirmed events become completed.
export async function settleBookings(db, expiredReason) {
  const expired = await db.query(
    `WITH stale AS (
       SELECT b.booking_id, b.status, b.slot_id FROM bookings b JOIN time_slots s ON s.slot_id = b.slot_id
        WHERE b.status IN ('requested', 'held') AND s.date < (now() AT TIME ZONE 'Asia/Karachi')::date
        FOR UPDATE OF b SKIP LOCKED),
     closed AS (
       UPDATE bookings b SET status = 'cancelled', closed_as = 'expired', cancellation_reason = $1, refund_percent = 0,
              refund_amount = 0
         FROM stale WHERE b.booking_id = stale.booking_id
       RETURNING b.booking_id, stale.status AS from_status, b.slot_id),
     freed AS (
       UPDATE time_slots t SET status = 'available', held_by = NULL, held_until = NULL
         FROM closed WHERE t.slot_id = closed.slot_id)
     INSERT INTO booking_events (booking_id, from_status, to_status, actor_role, reason)
     SELECT booking_id, from_status, 'cancelled', 'system', $1 FROM closed
     RETURNING booking_id`,
    [expiredReason],
  )
  const completed = await db.query(
    `WITH done AS (
       UPDATE bookings b SET status = 'completed'
         FROM time_slots s
        WHERE s.slot_id = b.slot_id AND b.status = 'confirmed' AND s.date < (now() AT TIME ZONE 'Asia/Karachi')::date
       RETURNING b.booking_id)
     INSERT INTO booking_events (booking_id, from_status, to_status, actor_role, reason)
     SELECT booking_id, 'confirmed', 'completed', 'system', 'The event date has passed' FROM done
     RETURNING booking_id`,
  )
  return { expired: expired.rowCount, completed: completed.rowCount }
}

// ---------------------------------------------------------------- reads

const BOOKING_COLUMNS = `
  b.booking_id, b.slot_id, b.venue_id, b.hall_id, b.customer_id, b.status, b.closed_as, b.source, b.event_type,
  b.event_name, b.host_name, b.host_phone, b.customer_notes, b.guest_count, b.billable_guests,
  b.menu_package_id, b.menu_price_per_head, b.hall_charge, b.total_amount, b.advance_percent, b.advance_due,
  b.advance_amount, b.policy_snapshot, b.cancellation_reason, b.refund_percent, b.refund_amount, b.created_at,
  b.updated_at, b.client_name, b.client_phone,
  to_char(s.date, 'YYYY-MM-DD') AS event_date, to_char(s.start_time, 'HH24:MI') AS start_time,
  to_char(s.end_time, 'HH24:MI') AS end_time,
  v.name AS venue_name, v.city AS venue_city, v.owner_id, h.name AS hall_name, m.name AS menu_name,
  u.name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
  (SELECT i.image_url FROM venue_images i WHERE i.venue_id = v.venue_id AND i.is_published
    ORDER BY i.is_cover DESC, i.sort_order LIMIT 1) AS cover_url`

const BOOKING_FROM = `
  FROM bookings b
  JOIN time_slots s ON s.slot_id = b.slot_id
  JOIN venues v ON v.venue_id = b.venue_id
  LEFT JOIN halls h ON h.hall_id = COALESCE(b.hall_id, s.hall_id)
  LEFT JOIN menu_packages m ON m.menu_id = b.menu_package_id
  LEFT JOIN users u ON u.user_id = b.customer_id`

const FIND_BOOKING_SQL = `SELECT ${BOOKING_COLUMNS} ${BOOKING_FROM} WHERE b.booking_id = $1`

export async function findBooking(db, bookingId) {
  const { rows } = await db.query(FIND_BOOKING_SQL, [bookingId])
  return rows[0] ?? null
}

export async function bookingAddOns(db, bookingIds) {
  const { rows } = await db.query(
    `SELECT ba.booking_id, ba.add_on_id, ba.quantity, ba.unit_price, a.name, a.type
       FROM booking_add_ons ba JOIN add_ons a ON a.add_on_id = ba.add_on_id
      WHERE ba.booking_id = ANY ($1::uuid[])
      ORDER BY a.type, a.name`,
    [bookingIds],
  )
  return rows
}

export async function bookingEvents(db, bookingId) {
  const { rows } = await db.query(
    `SELECT e.from_status, e.to_status, e.actor_role, e.reason, e.created_at, u.name AS actor_name
       FROM booking_events e LEFT JOIN users u ON u.user_id = e.actor_id
      WHERE e.booking_id = $1 ORDER BY e.created_at, e.event_id`,
    [bookingId],
  )
  return rows
}

const LIST_CUSTOMER_SQL = `SELECT ${BOOKING_COLUMNS}, count(*) OVER ()::int AS total ${BOOKING_FROM}
  WHERE b.customer_id = $1
  ORDER BY s.date DESC, s.start_time DESC, b.created_at DESC
  LIMIT $2 OFFSET $3`

export async function listCustomerBookings(db, customerId, { limit, offset }) {
  const { rows } = await db.query(LIST_CUSTOMER_SQL, [customerId, limit, offset])
  return rows
}

// status: 'requested' (inbox), 'confirmed' (upcoming), 'closed' (cancelled / completed), 'all'.
const LIST_OWNER_SQL = `SELECT ${BOOKING_COLUMNS}, count(*) OVER ()::int AS total ${BOOKING_FROM}
  WHERE v.owner_id = $1
    AND ($2::uuid IS NULL OR b.venue_id = $2)
    AND CASE $3::text
          WHEN 'requested' THEN b.status IN ('requested', 'held')
          WHEN 'confirmed' THEN b.status = 'confirmed'
          WHEN 'closed' THEN b.status IN ('cancelled', 'completed')
          ELSE true
        END
  ORDER BY CASE WHEN $3::text IN ('requested', 'confirmed') THEN s.date END ASC NULLS LAST, s.date DESC, b.created_at DESC
  LIMIT $4 OFFSET $5`

// status: 'requested' (inbox), 'confirmed' (upcoming), 'closed' (cancelled / completed), 'all'.
export async function listOwnerBookings(db, ownerId, { status, venueId, limit, offset }) {
  const { rows } = await db.query(LIST_OWNER_SQL, [ownerId, venueId ?? null, status, limit, offset])
  return rows
}

export async function ownerCounts(db, ownerId) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE b.status IN ('requested', 'held'))::int AS requested,
            count(*) FILTER (WHERE b.status = 'confirmed')::int AS confirmed,
            count(*) FILTER (WHERE b.status IN ('cancelled', 'completed'))::int AS closed,
            count(*)::int AS "all"
       FROM bookings b JOIN venues v ON v.venue_id = b.venue_id
      WHERE v.owner_id = $1`,
    [ownerId],
  )
  return rows[0]
}
