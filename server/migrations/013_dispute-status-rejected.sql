-- Up Migration
-- 013_dispute-status-rejected
-- [Design] REQ-48 / EUC-35 (srs-alignment #41): an admin can reject a dispute that isn't one (spam, wrong booking,
-- nothing to decide) without recording an outcome. REQ-48's Open / Under Review / Resolved stay as they are.
-- On its own because a new enum value can't be used in the transaction that adds it (same as 003).
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'rejected';

-- Down Migration
-- PostgreSQL can't drop an enum value. Forward-only; an unused 'rejected' value is harmless.
