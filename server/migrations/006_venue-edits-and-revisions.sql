-- Up Migration
-- 006_venue-edits-and-revisions
-- [Design] srs-alignment #35 (EUC-04, EUC-07, REQ-5, REQ-6): owners edit live venues.
--   * venue_revisions: REQ-5 "a changed venue goes to Admin approval before customers see it". The proposed values
--     wait here while the live version stays public and bookable; approving applies them in one transaction.
--   * owner_activity_log: admin_audit_log.admin_id must be an admin, so owner actions (edits, deactivate) go here.
--   * archived_at on menu_packages / add_ons: a package or add-on a booking points at is never changed or deleted;
--     editing it archives the old row and creates a new one (copy-on-write), deleting it archives it.
--   * bookings.menu_price_per_head: the per-guest price the booking was made with (booking_add_ons.unit_price
--     already snapshots add-on prices).

CREATE TABLE venue_revisions (
  revision_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES venue_owners(user_id),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  changes      jsonb NOT NULL,                                   -- proposed values (the fields that need approval)
  previous     jsonb NOT NULL,                                   -- the live values when it was (re)submitted
  admin_note   text,                                             -- reason when rejected
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES admins(user_id),
  CONSTRAINT venue_revisions_size CHECK (pg_column_size(changes) + pg_column_size(previous) <= 524288),
  CONSTRAINT venue_revisions_decided CHECK (
    status NOT IN ('approved', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX venue_revisions_one_pending ON venue_revisions (venue_id) WHERE status = 'pending';
CREATE INDEX venue_revisions_queue_idx ON venue_revisions (status, submitted_at);

CREATE TABLE owner_activity_log (
  log_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES venue_owners(user_id),
  action       text NOT NULL,                                    -- e.g. 'venue.edit', 'venue.deactivate'
  target_table text NOT NULL,
  target_id    uuid NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_activity_log_target_idx ON owner_activity_log (target_table, target_id);

ALTER TABLE menu_packages ADD COLUMN archived_at timestamptz;
ALTER TABLE add_ons       ADD COLUMN archived_at timestamptz;
ALTER TABLE bookings      ADD COLUMN menu_price_per_head numeric(10, 2) CHECK (menu_price_per_head >= 0);

-- Down Migration
ALTER TABLE bookings      DROP COLUMN menu_price_per_head;
ALTER TABLE add_ons       DROP COLUMN archived_at;
ALTER TABLE menu_packages DROP COLUMN archived_at;
DROP TABLE owner_activity_log;
DROP TABLE venue_revisions;
