-- Up Migration
-- 010_booking-contact
-- [Design] srs-alignment #38: the booking flow's "Event details" step (the host may be someone other than the
-- account holder; the venue owner calls this number).
ALTER TABLE bookings
  ADD COLUMN event_name text CHECK (char_length(event_name) <= 80),
  ADD COLUMN host_name  text CHECK (char_length(host_name) <= 60),
  ADD COLUMN host_phone text CHECK (host_phone ~ '^\+923[0-9]{9}$');

-- Down Migration
ALTER TABLE bookings
  DROP COLUMN host_phone,
  DROP COLUMN host_name,
  DROP COLUMN event_name;
