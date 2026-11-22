-- Up Migration
-- 009_booking-engine
-- [Design] srs-alignment #38 (EUC-14, 15, 16, 24, SYS-01): the booking API.
--   * Price snapshot at booking time (EUC-24): hall charge, billable guests, advance % and amount, and the
--     cancellation policy as it was, so later edits to the venue never change an existing booking.
--     (menu_price_per_head came with 006; booking_add_ons.unit_price is in the ERD.)
--   * closed_as: why a booking is 'cancelled' (customer cancelled, owner rejected, expired). No enum change (REQ-21).
--   * refund_percent / refund_amount: recorded from the policy snapshot on cancel; no money moves (REQ-25 scope).
--   * booking_events: every status change with actor and time.
ALTER TABLE bookings
  ADD COLUMN hall_charge     numeric(12, 2) NOT NULL DEFAULT 0 CHECK (hall_charge >= 0),
  ADD COLUMN billable_guests int CHECK (billable_guests > 0),
  ADD COLUMN advance_percent smallint CHECK (advance_percent BETWEEN 0 AND 100),
  ADD COLUMN advance_due     numeric(12, 2) NOT NULL DEFAULT 0 CHECK (advance_due >= 0),
  ADD COLUMN policy_snapshot jsonb,
  ADD COLUMN customer_notes  text CHECK (char_length(customer_notes) <= 500),
  ADD COLUMN closed_as       text CHECK (closed_as IN ('cancelled', 'rejected', 'expired')),
  ADD COLUMN refund_percent  smallint CHECK (refund_percent BETWEEN 0 AND 100),
  ADD COLUMN refund_amount   numeric(12, 2) CHECK (refund_amount >= 0),
  ADD CONSTRAINT bookings_closed_as_status CHECK ((status = 'cancelled') = (closed_as IS NOT NULL));

CREATE TABLE booking_events (
  event_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  from_status booking_status,
  to_status   booking_status NOT NULL,
  actor_id    uuid REFERENCES users(user_id),
  actor_role  text NOT NULL CHECK (actor_role IN ('customer', 'venue_owner', 'admin', 'system')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_events_booking_idx ON booking_events (booking_id, created_at);

-- Down Migration
DROP TABLE booking_events;
ALTER TABLE bookings
  DROP CONSTRAINT bookings_closed_as_status,
  DROP COLUMN refund_amount,
  DROP COLUMN refund_percent,
  DROP COLUMN closed_as,
  DROP COLUMN customer_notes,
  DROP COLUMN policy_snapshot,
  DROP COLUMN advance_due,
  DROP COLUMN advance_percent,
  DROP COLUMN billable_guests,
  DROP COLUMN hall_charge;
