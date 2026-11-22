-- Up Migration
-- 003_approval-status-suspended
-- [Design] srs-alignment #29: an admin can suspend an approved venue (hidden from the public); unsuspend sets it
-- back to 'approved'. On its own because a new enum value can't be used in the transaction that adds it.
ALTER TYPE approval_status ADD VALUE IF NOT EXISTS 'suspended';
