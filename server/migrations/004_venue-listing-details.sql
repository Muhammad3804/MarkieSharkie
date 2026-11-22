-- Up Migration
-- 004_venue-listing-details
-- [Design] srs-alignment #30: the Become-a-host wizard fields that had no column (client/src/features/host/draft.js,
-- toListingPayload()). Nothing existing is renamed or removed.
ALTER TABLE venues
  ADD COLUMN category            text CHECK (category IN ('marquee','banquet_hall','lawn','farmhouse','hotel_ballroom','rooftop')),
  ADD COLUMN headline            text CHECK (char_length(headline) <= 60),
  ADD COLUMN area                text,
  ADD COLUMN postal_code         text CHECK (postal_code ~ '^[0-9]{5}$'),
  ADD COLUMN google_maps_url     text,
  ADD COLUMN hosting_since       smallint CHECK (hosting_since BETWEEN 1947 AND 2100),
  ADD COLUMN landmark            text,
  ADD COLUMN landmark_minutes    smallint CHECK (landmark_minutes BETWEEN 1 AND 180),
  ADD COLUMN directions          text,
  ADD COLUMN parking_spaces      int CHECK (parking_spaces >= 0),
  ADD COLUMN house_rules         text[] NOT NULL DEFAULT '{}',
  ADD COLUMN custom_menu_note    text,
  ADD COLUMN advance_percent     smallint NOT NULL DEFAULT 25 CHECK (advance_percent BETWEEN 0 AND 100),
  ADD COLUMN cancellation_policy text NOT NULL DEFAULT 'moderate'
                                 CHECK (cancellation_policy IN ('flexible','moderate','strict','custom')),
  ADD COLUMN cancellation_note   text,
  ADD COLUMN booking_days        text[] NOT NULL DEFAULT '{mon,tue,wed,thu,fri,sat,sun}'
                                 CHECK (booking_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']),
  ADD COLUMN suspension_reason   text,
  ADD COLUMN submitted_at        timestamptz,
  ADD COLUMN reviewed_at         timestamptz;
CREATE INDEX venues_admin_queue_idx ON venues (approval_status, submitted_at);
CREATE INDEX venues_facilities_idx  ON venues USING gin (facilities);

ALTER TABLE halls
  ADD COLUMN standing_capacity int CHECK (standing_capacity > 0),
  ADD COLUMN setting           venue_type NOT NULL DEFAULT 'indoor',
  ADD COLUMN has_ac            boolean NOT NULL DEFAULT true,
  ADD COLUMN length_ft         smallint CHECK (length_ft BETWEEN 10 AND 1000),
  ADD COLUMN width_ft          smallint CHECK (width_ft BETWEEN 10 AND 1000),
  ADD COLUMN ceiling_ft        smallint CHECK (ceiling_ft BETWEEN 8 AND 100),
  ADD COLUMN description       text NOT NULL DEFAULT '',
  ADD COLUMN floor_plan_url    text,
  ADD COLUMN floor_plan_type   text CHECK (floor_plan_type IN ('image','pdf')),
  ADD COLUMN zone_stage        smallint CHECK (zone_stage BETWEEN 0 AND 8),
  ADD COLUMN zone_entrance     smallint CHECK (zone_entrance BETWEEN 0 AND 8),
  ADD COLUMN zone_seating      smallint CHECK (zone_seating BETWEEN 0 AND 8),
  ADD COLUMN walkthrough_mode  text NOT NULL DEFAULT 'generate' CHECK (walkthrough_mode IN ('generate','upload','link','skip')),
  ADD COLUMN walkthrough_url   text,
  ADD COLUMN sort_order        smallint NOT NULL DEFAULT 0;

ALTER TABLE venue_images
  ADD COLUMN hall_id    uuid,
  ADD COLUMN category   text NOT NULL DEFAULT 'main_hall' CHECK (category IN
             ('main_hall','stage','seating','bridal_room','washrooms','entrance','exterior','parking','hallway','tour')),
  ADD COLUMN is_cover   boolean NOT NULL DEFAULT false,
  ADD COLUMN sort_order smallint NOT NULL DEFAULT 0,
  ADD COLUMN mime_type  text,
  ADD COLUMN size_bytes int CHECK (size_bytes > 0),
  ADD CONSTRAINT venue_images_hall_same_venue FOREIGN KEY (venue_id, hall_id)
      REFERENCES halls (venue_id, hall_id) ON DELETE SET NULL (hall_id);
CREATE UNIQUE INDEX venue_images_one_cover ON venue_images (venue_id) WHERE is_cover;

ALTER TABLE walkthrough_assets
  ADD COLUMN hall_id uuid,
  ADD CONSTRAINT walkthrough_assets_hall_same_venue FOREIGN KEY (venue_id, hall_id)
      REFERENCES halls (venue_id, hall_id) ON DELETE CASCADE;

ALTER TABLE menu_packages ADD COLUMN sort_order smallint NOT NULL DEFAULT 0;
ALTER TABLE menu_items    ADD COLUMN sort_order smallint NOT NULL DEFAULT 0;

-- Preparation room, not a bookable hall.
CREATE TABLE bridal_suites (
  venue_id    uuid PRIMARY KEY REFERENCES venues(venue_id) ON DELETE CASCADE,
  name        text NOT NULL,
  capacity    int  NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  length_ft   smallint CHECK (length_ft BETWEEN 5 AND 200),
  width_ft    smallint CHECK (width_ft BETWEEN 5 AND 200),
  description text NOT NULL DEFAULT ''
);

-- Booking rules: which slots the venue offers (time_slots are generated from these).
CREATE TABLE venue_slot_templates (
  venue_id   uuid NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  slot_type  text NOT NULL CHECK (slot_type IN ('lunch','dinner')),
  start_time time NOT NULL,
  end_time   time NOT NULL,
  PRIMARY KEY (venue_id, slot_type),
  CONSTRAINT venue_slot_templates_order CHECK (end_time > start_time)
);

-- Custom cancellation policy rows: refund % by days before the event (to_days NULL = "or more").
CREATE TABLE venue_cancellation_tiers (
  tier_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  from_days      smallint NOT NULL CHECK (from_days BETWEEN 0 AND 365),
  to_days        smallint CHECK (to_days <= 366),
  refund_percent smallint NOT NULL CHECK (refund_percent BETWEEN 0 AND 100),
  CONSTRAINT venue_cancellation_tiers_range CHECK (to_days IS NULL OR to_days > from_days)
);
CREATE INDEX venue_cancellation_tiers_venue_idx ON venue_cancellation_tiers (venue_id);
