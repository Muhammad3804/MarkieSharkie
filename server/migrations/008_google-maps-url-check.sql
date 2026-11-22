-- Up Migration
-- 008_google-maps-url-check
-- [SRS] REQ-43 / EUC-30, srs-alignment #37: the venue's Google Maps link is the only Google feature (a link-out; no
-- Google API, no stored Google reviews or ratings). venues.google_maps_url already exists (migration 004), so this
-- only cleans empty strings and adds the CHECK. The unused google_place_id column and google_reviews table (ERD) are
-- left as they are.
UPDATE venues SET google_maps_url = NULL WHERE btrim(google_maps_url) = '';
ALTER TABLE venues ADD CONSTRAINT venues_google_maps_url_check
  CHECK (google_maps_url IS NULL OR (google_maps_url LIKE 'https://%' AND char_length(google_maps_url) <= 500));

-- Down Migration
ALTER TABLE venues DROP CONSTRAINT venues_google_maps_url_check;
