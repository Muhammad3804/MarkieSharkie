-- Up Migration
-- 011_invitations-per-guest
-- [Design] srs-alignment #39 (EUC-25, 26, 27; supersedes the open-link idea of #21): one invitation per confirmed
-- booking, host-added guests (email and / or mobile), one link per guest. The link's token is random; only its
-- sha256 is stored (in the ERD column invite_token), with an expiry and a revoke. RSVP stays yes / no (REQ-38) with
-- a party size and a note. The builder's card fields (#21) plus dress code and notes.
ALTER TABLE invitations
  ADD COLUMN template text NOT NULL DEFAULT 'classic'
    CHECK (template IN ('classic', 'floral', 'modern', 'mehndi')),
  ADD COLUMN event_type event_type,
  ADD COLUMN host_names text CHECK (char_length(host_names) <= 120),
  ADD COLUMN rsvp_by date,
  ADD COLUMN contact_phone text CHECK (contact_phone ~ '^\+923[0-9]{9}$'),
  ADD COLUMN dress_code text CHECK (char_length(dress_code) <= 100),
  ADD COLUMN notes text CHECK (char_length(notes) <= 1000),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX invitations_one_per_booking ON invitations (booking_id);
CREATE TRIGGER invitations_updated_at BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE guests
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN email citext CHECK (char_length(email) <= 254),
  ADD COLUMN token_expires_at timestamptz,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT guests_contact CHECK (phone IS NOT NULL OR email IS NOT NULL),
  ADD CONSTRAINT guests_phone_format CHECK (phone IS NULL OR phone ~ '^\+923[0-9]{9}$'),
  ADD CONSTRAINT guests_email_per_invitation UNIQUE (invitation_id, email);
CREATE INDEX guests_invitation_idx ON guests (invitation_id);
COMMENT ON COLUMN guests.invite_token IS 'sha256 hex of the guest link token; the raw token is only in the link';

ALTER TABLE rsvps
  ADD COLUMN party_size smallint NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 0 AND 20),
  ADD COLUMN note text CHECK (char_length(note) <= 300),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT rsvps_party_matches CHECK ((response = 'no') = (party_size = 0));

-- Down Migration
ALTER TABLE rsvps
  DROP CONSTRAINT rsvps_party_matches,
  DROP COLUMN updated_at,
  DROP COLUMN note,
  DROP COLUMN party_size;
COMMENT ON COLUMN guests.invite_token IS NULL;
DROP INDEX guests_invitation_idx;
ALTER TABLE guests
  DROP CONSTRAINT guests_email_per_invitation,
  DROP CONSTRAINT guests_phone_format,
  DROP CONSTRAINT guests_contact,
  DROP COLUMN created_at,
  DROP COLUMN sent_at,
  DROP COLUMN revoked_at,
  DROP COLUMN token_expires_at,
  DROP COLUMN email;
DELETE FROM guests WHERE phone IS NULL; -- email-only guests can't exist before 011
ALTER TABLE guests ALTER COLUMN phone SET NOT NULL;
DROP TRIGGER invitations_updated_at ON invitations;
DROP INDEX invitations_one_per_booking;
ALTER TABLE invitations
  DROP COLUMN updated_at,
  DROP COLUMN notes,
  DROP COLUMN dress_code,
  DROP COLUMN contact_phone,
  DROP COLUMN rsvp_by,
  DROP COLUMN host_names,
  DROP COLUMN event_type,
  DROP COLUMN template;
