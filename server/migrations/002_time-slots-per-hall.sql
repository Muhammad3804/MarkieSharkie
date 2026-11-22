-- Up Migration
-- 002_time-slots-per-hall
-- srs-alignment #19: every slot belongs to one hall of its venue; halls are booked independently.
ALTER TABLE time_slots ADD COLUMN hall_id uuid;
UPDATE time_slots t
   SET hall_id = (SELECT h.hall_id FROM halls h WHERE h.venue_id = t.venue_id ORDER BY h.created_at, h.hall_id LIMIT 1);
ALTER TABLE time_slots ALTER COLUMN hall_id SET NOT NULL;  -- fails loudly if a venue with slots has no hall
ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_hall_same_venue FOREIGN KEY (venue_id, hall_id)
      REFERENCES halls (venue_id, hall_id) ON DELETE CASCADE;
-- Overlap is now per hall (two halls of one venue can host at the same time).
ALTER TABLE time_slots DROP CONSTRAINT time_slots_no_overlap;
ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_no_overlap EXCLUDE USING gist (
    hall_id WITH =,
    tsrange(date + start_time, date + end_time) WITH &&
  );
DROP INDEX time_slots_venue_date_idx;
CREATE INDEX time_slots_venue_date_idx ON time_slots (venue_id, date, hall_id);
-- bookings_one_active_per_slot is unchanged: one slot row per hall makes it per hall automatically.
