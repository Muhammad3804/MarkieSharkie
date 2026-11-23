// Invitations, guests and RSVPs (EUC-25, 26, 27; srs-alignment #39). Raw pg, $n parameters only.

// The booking an invitation is for, with what the card and the guest page show (venue, hall, date, times, map).
export async function findBookingFacts(db, bookingId) {
  const { rows } = await db.query(
    `SELECT b.booking_id, b.customer_id, b.status, b.event_type, b.event_name, b.guest_count, b.host_name,
            b.host_phone, to_char(s.date, 'YYYY-MM-DD') AS event_date, to_char(s.start_time, 'HH24:MI') AS start_time,
            to_char(s.end_time, 'HH24:MI') AS end_time, v.venue_id, v.name AS venue_name, v.address AS venue_address,
            v.city AS venue_city, v.google_maps_url, ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lng,
            h.name AS hall_name, h.capacity AS hall_capacity,
            (s.date >= (now() AT TIME ZONE 'Asia/Karachi')::date) AS upcoming
       FROM bookings b
       JOIN time_slots s ON s.slot_id = b.slot_id
       JOIN venues v ON v.venue_id = b.venue_id
       LEFT JOIN halls h ON h.hall_id = COALESCE(b.hall_id, s.hall_id)
      WHERE b.booking_id = $1`,
    [bookingId],
  )
  return rows[0] ?? null
}

export async function findInvitationByBooking(db, bookingId, { lock = false } = {}) {
  const { rows } = await db.query(lock ? INVITATION_BY_BOOKING_LOCK : INVITATION_BY_BOOKING, [bookingId])
  return rows[0] ?? null
}
const INVITATION_BY_BOOKING = 'SELECT * FROM invitations WHERE booking_id = $1'
const INVITATION_BY_BOOKING_LOCK = 'SELECT * FROM invitations WHERE booking_id = $1 FOR UPDATE'

// The invitation with its booking's customer (for the ownership check), locked when asked.
export async function findInvitation(db, invitationId, { lock = false } = {}) {
  const { rows } = await db.query(lock ? INVITATION_LOCK : INVITATION, [invitationId])
  return rows[0] ?? null
}
const INVITATION = `SELECT i.*, b.customer_id FROM invitations i JOIN bookings b ON b.booking_id = i.booking_id
  WHERE i.invitation_id = $1`
const INVITATION_LOCK = `SELECT i.*, b.customer_id FROM invitations i JOIN bookings b ON b.booking_id = i.booking_id
  WHERE i.invitation_id = $1 FOR UPDATE OF i`

export async function insertInvitation(db, inv) {
  const { rows } = await db.query(
    `INSERT INTO invitations (booking_id, title, message, event_date, event_time, share_link, template, event_type,
                              host_names, rsvp_by, contact_phone, dress_code, notes)
     VALUES ($1, $2, $3, $4::date, $5::time, $6, $7, $8::event_type, $9, $10::date, $11, $12, $13)
     RETURNING *`,
    [
      inv.bookingId,
      inv.title,
      inv.message,
      inv.eventDate,
      inv.eventTime,
      inv.shareLink,
      inv.template,
      inv.eventType,
      inv.hostNames,
      inv.rsvpBy,
      inv.contactPhone,
      inv.dressCode,
      inv.notes,
    ],
  )
  return rows[0]
}

export async function updateInvitation(db, invitationId, inv) {
  const { rows } = await db.query(
    `UPDATE invitations SET title = $2, message = $3, event_date = $4::date, event_time = $5::time, template = $6,
            event_type = $7::event_type, host_names = $8, rsvp_by = $9::date, contact_phone = $10, dress_code = $11,
            notes = $12
      WHERE invitation_id = $1 RETURNING *`,
    [
      invitationId,
      inv.title,
      inv.message,
      inv.eventDate,
      inv.eventTime,
      inv.template,
      inv.eventType,
      inv.hostNames,
      inv.rsvpBy,
      inv.contactPhone,
      inv.dressCode,
      inv.notes,
    ],
  )
  return rows[0]
}

// ---------------------------------------------------------------- guests

// Guests start with a random, never-shown token hash; the real link is made when the invitation is sent.
export async function insertGuests(db, invitationId, guests) {
  const { rows } = await db.query(
    `INSERT INTO guests (invitation_id, name, email, phone, invite_token, token_expires_at)
     SELECT $1, name, email, phone, token, $6::timestamptz
       FROM unnest($2::text[], $3::citext[], $4::text[], $5::text[]) AS t(name, email, phone, token)
     RETURNING guest_id`,
    [
      invitationId,
      guests.map((g) => g.name),
      guests.map((g) => g.email),
      guests.map((g) => g.phone),
      guests.map((g) => g.tokenHash),
      guests[0]?.expiresAt ?? null,
    ],
  )
  return rows.map((r) => r.guest_id)
}

export async function findGuest(db, { invitationId, guestId }) {
  const { rows } = await db.query('SELECT * FROM guests WHERE guest_id = $1 AND invitation_id = $2', [
    guestId,
    invitationId,
  ])
  return rows[0] ?? null
}

export async function deleteGuest(db, guestId) {
  await db.query('DELETE FROM guests WHERE guest_id = $1', [guestId])
}

// A new link for a guest: the old one stops working at once; revoking is undone.
export async function rotateToken(db, { guestId, tokenHash, expiresAt }) {
  await db.query(`UPDATE guests SET invite_token = $2, token_expires_at = $3, revoked_at = NULL WHERE guest_id = $1`, [
    guestId,
    tokenHash,
    expiresAt,
  ])
}

export async function revokeGuest(db, guestId) {
  await db.query('UPDATE guests SET revoked_at = now() WHERE guest_id = $1 AND revoked_at IS NULL', [guestId])
}

// A link was made for a guest without an email (the host shares it): remembered so "send all" doesn't replace it.
export async function markLinkIssued(db, guestId) {
  await db.query(`UPDATE guests SET sent_at = now(), delivery_error = NULL WHERE guest_id = $1`, [guestId])
}

export async function setDelivery(db, { guestId, status, error = null }) {
  await db.query(
    `UPDATE guests SET delivery_status = $2::delivery_status, delivery_error = $3,
            sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
      WHERE guest_id = $1`,
    [guestId, status, error],
  )
}

export async function guestsForSend(db, { invitationId, guestIds }) {
  const { rows } = await db.query(
    `SELECT * FROM guests
      WHERE invitation_id = $1
        AND (
          -- chosen guests (resend / new link; this also brings back a revoked link)
          ($2::uuid[] IS NOT NULL AND guest_id = ANY ($2::uuid[]))
          -- "send to everyone not sent yet": skip revoked guests, and a guest without an email who already has a link
          OR ($2::uuid[] IS NULL AND revoked_at IS NULL AND delivery_status IN ('pending', 'failed')
              AND (email IS NOT NULL OR sent_at IS NULL))
        )
      ORDER BY created_at, guest_id`,
    [invitationId, guestIds ?? null],
  )
  return rows
}

// status: all | attending | declined | awaiting (no reply yet) | not_delivered (failed). q: name, email or phone.
export async function listGuests(db, { invitationId, status, q }) {
  const { rows } = await db.query(
    `SELECT g.guest_id, g.name, g.email, g.phone, g.delivery_status, g.delivery_error, g.sent_at, g.revoked_at,
            g.created_at, r.response, r.party_size, r.note, r.updated_at AS replied_at
       FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.guest_id
      WHERE g.invitation_id = $1
        AND CASE $2::text
              WHEN 'attending' THEN r.response = 'yes'
              WHEN 'declined' THEN r.response = 'no'
              WHEN 'awaiting' THEN r.response IS NULL
              WHEN 'not_delivered' THEN g.delivery_status = 'failed'
              ELSE true
            END
        AND ($3::text IS NULL OR g.name ILIKE '%' || $3 || '%' OR g.email::text ILIKE '%' || $3 || '%'
             OR g.phone ILIKE '%' || $3 || '%')
      ORDER BY g.created_at, g.guest_id`,
    [invitationId, status, q ?? null],
  )
  return rows
}

export async function guestTotals(db, invitationId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS invited,
            count(*) FILTER (WHERE r.response = 'yes')::int AS attending,
            count(*) FILTER (WHERE r.response = 'no')::int AS declined,
            count(*) FILTER (WHERE r.response IS NULL)::int AS awaiting,
            count(*) FILTER (WHERE g.delivery_status = 'failed')::int AS not_delivered,
            coalesce(sum(r.party_size) FILTER (WHERE r.response = 'yes'), 0)::int AS people
       FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.guest_id
      WHERE g.invitation_id = $1`,
    [invitationId],
  )
  return rows[0]
}

// The customer's invitations with their totals, for "My bookings".
export async function summariesForCustomer(db, customerId) {
  const { rows } = await db.query(
    `SELECT i.invitation_id, i.booking_id, i.title,
            count(g.guest_id)::int AS invited,
            count(r.rsvp_id) FILTER (WHERE r.response = 'yes')::int AS attending,
            count(r.rsvp_id) FILTER (WHERE r.response = 'no')::int AS declined,
            coalesce(sum(r.party_size) FILTER (WHERE r.response = 'yes'), 0)::int AS people
       FROM invitations i JOIN bookings b ON b.booking_id = i.booking_id
       LEFT JOIN guests g ON g.invitation_id = i.invitation_id
       LEFT JOIN rsvps r ON r.guest_id = g.guest_id
      WHERE b.customer_id = $1
      GROUP BY i.invitation_id`,
    [customerId],
  )
  return rows
}

// ---------------------------------------------------------------- public (the guest's link)

// The guest whose link this is, if it is still valid (not revoked, not expired, booking still on).
export async function findGuestByToken(db, tokenHash, { lock = false } = {}) {
  const { rows } = await db.query(lock ? GUEST_BY_TOKEN_LOCK : GUEST_BY_TOKEN, [tokenHash])
  return rows[0] ?? null
}
const GUEST_BY_TOKEN_SQL = `SELECT g.guest_id, g.name, g.invitation_id, i.booking_id, r.response, r.party_size, r.note,
         r.updated_at AS replied_at
    FROM guests g
    JOIN invitations i ON i.invitation_id = g.invitation_id
    JOIN bookings b ON b.booking_id = i.booking_id
    LEFT JOIN rsvps r ON r.guest_id = g.guest_id
   WHERE g.invite_token = $1 AND g.revoked_at IS NULL AND g.token_expires_at > now()
     AND b.status IN ('confirmed', 'completed')`
const GUEST_BY_TOKEN = GUEST_BY_TOKEN_SQL
const GUEST_BY_TOKEN_LOCK = `${GUEST_BY_TOKEN_SQL} FOR UPDATE OF g`

export async function upsertRsvp(db, { guestId, response, partySize, note }) {
  const { rows } = await db.query(
    `INSERT INTO rsvps (guest_id, response, party_size, note) VALUES ($1, $2::rsvp_response, $3, $4)
     ON CONFLICT (guest_id) DO UPDATE
       SET response = EXCLUDED.response, party_size = EXCLUDED.party_size, note = EXCLUDED.note, updated_at = now()
     RETURNING response, party_size, note, updated_at`,
    [guestId, response, partySize, note],
  )
  return rows[0]
}
