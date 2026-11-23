-- Up Migration
-- 014_disputes-and-venue-reports
-- [SRS] REQ-48 / EUC-35 (srs-alignment #41): disputes raised by the customer or the venue owner of a booking.
--   * category, raised_by_role, outcome + compensation_amount (recorded only: the platform moves no money, REQ-25).
--   * One open (open / under_review) dispute per booking per party.
--   * rejected needs the same admin, reason (resolution) and time as resolved.
--   * dispute_files: evidence images (uploaded first, attached when the dispute is opened). Never served publicly.
--   * dispute_notes: replies from either party (visible to both and the admin) and admin notes (internal or visible).
-- [Design] venue_reports (srs-alignment #41): "Report this listing" on the venue page, reviewed by an admin.
ALTER TABLE disputes
  ADD COLUMN category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('service_not_as_described', 'cancellation_refund', 'pricing', 'damage', 'conduct', 'other')),
  ADD COLUMN raised_by_role text NOT NULL DEFAULT 'customer' CHECK (raised_by_role IN ('customer', 'venue_owner')),
  ADD COLUMN outcome text CHECK (outcome IN ('upheld', 'partially_upheld', 'dismissed')),
  ADD COLUMN compensation_amount numeric(12, 2) CHECK (compensation_amount >= 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE disputes ADD CONSTRAINT disputes_reason_length CHECK (char_length(reason) BETWEEN 20 AND 2000);
ALTER TABLE disputes ADD CONSTRAINT disputes_outcome_when_resolved
  CHECK ((status = 'resolved') = (outcome IS NOT NULL));
-- status::text: 'rejected' is new in 013, and every pending migration runs in one transaction, where a new enum
-- value can't be used yet; the text comparison never creates an enum literal.
ALTER TABLE disputes ADD CONSTRAINT disputes_rejected_fields
  CHECK (status::text <> 'rejected' OR (resolution IS NOT NULL AND resolved_at IS NOT NULL AND admin_id IS NOT NULL));
ALTER TABLE disputes ADD CONSTRAINT disputes_compensation_only_when_upheld
  CHECK (compensation_amount IS NULL OR outcome IN ('upheld', 'partially_upheld'));

CREATE UNIQUE INDEX disputes_one_open_per_party ON disputes (booking_id, raised_by)
  WHERE status IN ('open', 'under_review');
CREATE INDEX disputes_booking_idx ON disputes (booking_id);
CREATE INDEX disputes_raised_by_idx ON disputes (raised_by);

CREATE TRIGGER disputes_updated_at BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE dispute_files (
  file_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid        NOT NULL REFERENCES users(user_id),
  dispute_id  uuid        REFERENCES disputes(dispute_id) ON DELETE CASCADE, -- NULL until the dispute is opened
  storage_key text        NOT NULL UNIQUE,
  mime_type   text        NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  size_bytes  int         NOT NULL CHECK (size_bytes > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispute_files_dispute_idx ON dispute_files (dispute_id);
CREATE INDEX dispute_files_uploader_idx ON dispute_files (uploaded_by, created_at);

CREATE TABLE dispute_notes (
  note_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id  uuid        NOT NULL REFERENCES disputes(dispute_id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES users(user_id),
  author_role text        NOT NULL CHECK (author_role IN ('customer', 'venue_owner', 'admin')),
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  internal    boolean     NOT NULL DEFAULT false,                         -- admin-only notes
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispute_notes_internal_admin CHECK (NOT internal OR author_role = 'admin')
);
CREATE INDEX dispute_notes_dispute_idx ON dispute_notes (dispute_id, created_at);

CREATE TABLE venue_reports (
  report_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL REFERENCES venues(venue_id),
  reporter_id uuid        NOT NULL REFERENCES users(user_id),
  reason      text        NOT NULL
    CHECK (reason IN ('inaccurate', 'fake_photos', 'not_real', 'pricing', 'offensive', 'other')),
  details     text        NOT NULL CHECK (char_length(details) BETWEEN 10 AND 1000),
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  admin_id    uuid        REFERENCES admins(user_id),
  resolution  text        CHECK (char_length(resolution) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT venue_reports_resolved_fields
    CHECK (status <> 'resolved' OR (resolution IS NOT NULL AND resolved_at IS NOT NULL AND admin_id IS NOT NULL))
);
CREATE UNIQUE INDEX venue_reports_one_open_per_reporter ON venue_reports (venue_id, reporter_id)
  WHERE status IN ('open', 'under_review');
CREATE INDEX venue_reports_status_idx ON venue_reports (status, created_at);
CREATE TRIGGER venue_reports_updated_at BEFORE UPDATE ON venue_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE venue_reports;
DROP TABLE dispute_notes;
DROP TABLE dispute_files;
DROP TRIGGER disputes_updated_at ON disputes;
DROP INDEX disputes_raised_by_idx;
DROP INDEX disputes_booking_idx;
DROP INDEX disputes_one_open_per_party;
ALTER TABLE disputes
  DROP CONSTRAINT disputes_compensation_only_when_upheld,
  DROP CONSTRAINT disputes_rejected_fields,
  DROP CONSTRAINT disputes_outcome_when_resolved,
  DROP CONSTRAINT disputes_reason_length,
  DROP COLUMN updated_at,
  DROP COLUMN compensation_amount,
  DROP COLUMN outcome,
  DROP COLUMN raised_by_role,
  DROP COLUMN category;
