-- Up Migration
-- 005_owner-drafts-and-uploads
-- [Design] srs-alignment #31: the wizard autosaves on the server (replaces localStorage), and files are uploaded
-- before the listing exists, then attached to it on submit.
CREATE TABLE venue_drafts (
  draft_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES venue_owners(user_id) ON DELETE CASCADE,
  venue_id   uuid REFERENCES venues(venue_id) ON DELETE CASCADE,  -- NULL = new listing; set = editing for resubmit
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_drafts_one_per_listing UNIQUE NULLS NOT DISTINCT (owner_id, venue_id),
  CONSTRAINT venue_drafts_size CHECK (pg_column_size(data) <= 262144)
);

CREATE TABLE media_uploads (
  upload_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES venue_owners(user_id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('photo','floor_plan','walkthrough')),
  storage_key text NOT NULL UNIQUE,
  mime_type   text NOT NULL,
  size_bytes  int  NOT NULL CHECK (size_bytes > 0),
  venue_id    uuid REFERENCES venues(venue_id) ON DELETE SET NULL,  -- set when attached on submit
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_uploads_owner_idx ON media_uploads (owner_id, created_at);
