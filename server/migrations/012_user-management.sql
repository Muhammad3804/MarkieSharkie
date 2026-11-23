-- Up Migration
-- 012_user-management
-- [SRS] REQ-47 / EUC-33 (srs-alignment #40): admin user management.
--   * suspension_reason / suspended_at: why and when an admin suspended the account (also in admin_audit_log).
--   * A deleted (anonymised, NFR-8) user keeps their row for bookings and the audit log, with
--     phone = 'deleted:<user_id>', so the Pakistani-mobile check only applies to accounts that aren't deleted.
ALTER TABLE users
  ADD COLUMN suspension_reason text CHECK (char_length(suspension_reason) <= 500),
  ADD COLUMN suspended_at timestamptz;

ALTER TABLE users DROP CONSTRAINT users_phone_pk_format;
ALTER TABLE users ADD CONSTRAINT users_phone_pk_format
  CHECK (deleted_at IS NOT NULL OR phone ~ '^\+923[0-9]{9}$');

-- Down Migration
-- (fails if anonymised users exist: their placeholder phone doesn't match the old check)
ALTER TABLE users DROP CONSTRAINT users_phone_pk_format;
ALTER TABLE users ADD CONSTRAINT users_phone_pk_format CHECK (phone ~ '^\+923[0-9]{9}$');
ALTER TABLE users
  DROP COLUMN suspended_at,
  DROP COLUMN suspension_reason;
