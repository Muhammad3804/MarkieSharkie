-- =====================================================================
-- MarkieSharkie database schema (PostgreSQL 15+)
--
-- Source of truth: SRS Figure 6 (Entity Relationship Diagram).
-- Every ERD table and column is here, renamed to snake_case
-- (ERD `userId` -> `user_id`, `Venue` -> `venues`).
--
-- Anything NOT in the ERD is marked with `-- [SRS]` and the requirement
-- that needs it. These are additions the SRS text requires but the
-- diagram does not show. See docs/database.md for the full list.
--
-- Anything marked `-- [Design]` is a team design addition that neither the
-- ERD nor the SRS text asks for (logged in docs/srs-alignment.md).
--
-- Do not rename or drop ERD columns without updating docs/database.md.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector: embeddings for RAG + recommendations
CREATE EXTENSION IF NOT EXISTS postgis;     -- Venue.location: GeoPoint
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint on overlapping time slots
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email

-- Embedding size. 1536 = OpenAI text-embedding-3-small.
-- If you switch to Gemini text-embedding-004 change every vector(1536) to vector(768).

-- ---------------------------------------------------------------------
-- Enums (names match the ERD / class diagram enum types)
-- ---------------------------------------------------------------------
CREATE TYPE role                AS ENUM ('customer', 'venue_owner', 'decorator', 'admin');
CREATE TYPE venue_type          AS ENUM ('indoor', 'outdoor', 'semi_outdoor');                         -- REQ-5
CREATE TYPE event_type          AS ENUM ('wedding', 'mehndi', 'barat', 'walima', 'engagement',
                                         'birthday', 'corporate', 'conference', 'religious', 'other');
CREATE TYPE approval_status     AS ENUM ('pending', 'approved', 'rejected', 'changes_requested', 'suspended'); -- REQ-7 (+ [Design] changes_requested #18, suspended #29)
CREATE TYPE slot_status         AS ENUM ('available', 'held', 'booked', 'blocked');                     -- REQ-16
CREATE TYPE booking_status      AS ENUM ('requested', 'held', 'confirmed', 'completed', 'cancelled');   -- REQ-21
CREATE TYPE booking_source      AS ENUM ('online', 'offline');                                          -- REQ-23
CREATE TYPE quotation_status    AS ENUM ('proposed', 'countered', 'accepted', 'rejected', 'expired');   -- REQ-24
CREATE TYPE payment_type        AS ENUM ('advance', 'balance');                                         -- REQ-25
CREATE TYPE payment_status      AS ENUM ('recorded', 'received', 'void');
CREATE TYPE add_on_type         AS ENUM ('sound_system', 'smd');                                        -- REQ-34
CREATE TYPE verification_status AS ENUM ('pending', 'genuine', 'flagged', 'approved', 'rejected');      -- REQ-9, REQ-10
CREATE TYPE asset_type          AS ENUM ('model_3d', 'panorama_360', 'video_360');                      -- REQ-11
CREATE TYPE notification_type   AS ENUM ('booking', 'quotation', 'payment', 'venue_approval',
                                         'image_verification', 'decor', 'invitation', 'weather',
                                         'review', 'dispute', 'account', 'system');                     -- REQ-45
CREATE TYPE sender_type         AS ENUM ('customer', 'assistant');
CREATE TYPE rsvp_response       AS ENUM ('yes', 'no');                                                  -- REQ-38
CREATE TYPE scan_result         AS ENUM ('valid', 'invalid', 'duplicate');                              -- REQ-41
CREATE TYPE severity            AS ENUM ('low', 'moderate', 'high', 'severe');                          -- REQ-46
CREATE TYPE dispute_status      AS ENUM ('open', 'under_review', 'resolved');                           -- REQ-48
CREATE TYPE delivery_status     AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');             -- [SRS] REQ-37

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Users and roles (ERD: User + role tables that share the User PK)
-- =====================================================================
CREATE TABLE users (
  user_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  email                 citext      NOT NULL UNIQUE,                         -- REQ-1 unique email
  phone                 text        NOT NULL UNIQUE,                         -- REQ-1 unique mobile, stored as +923XXXXXXXXX
  password_hash         text        NOT NULL,                                -- NFR-4 (argon2id / bcrypt)
  role                  role        NOT NULL,
  is_active             boolean     NOT NULL DEFAULT true,                   -- false = suspended (REQ-3, REQ-47)
  created_at            timestamptz NOT NULL DEFAULT now(),
  city                  text        NOT NULL,                                -- [SRS] REQ-1, REQ-4
  failed_login_attempts int         NOT NULL DEFAULT 0,                      -- [SRS] REQ-2 lockout
  locked_until          timestamptz,                                         -- [SRS] REQ-2 lockout (15 min after 5 fails)
  last_login_at         timestamptz,                                         -- [SRS] REQ-2
  deleted_at            timestamptz,                                         -- [SRS] REQ-47 remove, NFR-8 deletion request
  updated_at            timestamptz NOT NULL DEFAULT now(),
  suspension_reason     text CHECK (char_length(suspension_reason) <= 500),  -- [SRS] #40 (migration 012) REQ-47
  suspended_at          timestamptz,                                         -- [SRS] #40 (migration 012)
  -- #40: a deleted (anonymised) user's phone is 'deleted:<user_id>'
  CONSTRAINT users_phone_pk_format CHECK (deleted_at IS NOT NULL OR phone ~ '^\+923[0-9]{9}$')
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE customers (
  user_id              uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  preferences          jsonb NOT NULL DEFAULT '{}'::jsonb,
  preference_embedding vector(1536)                                          -- REQ-15
);

CREATE TABLE venue_owners (
  user_id        uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  business_name  text NOT NULL,
  contact_number text NOT NULL
);

CREATE TABLE decorators (
  user_id       uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  business_name text NOT NULL,
  bio           text NOT NULL,                                               -- REQ-1 "short description"
  city          text NOT NULL
);

CREATE TABLE admins (
  user_id     uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  permissions text[] NOT NULL DEFAULT '{}'
);

-- [SRS] REQ-2: one-time code for password reset, sent by email or SMS.
CREATE TABLE password_reset_codes (
  reset_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_hash   text        NOT NULL,                                          -- never store the raw code
  channel     text        NOT NULL CHECK (channel IN ('email', 'sms')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  attempts    int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_codes_user_idx ON password_reset_codes(user_id);

-- [SRS] REQ-2 / NFR-4: refresh tokens so logout and 30-min inactivity can revoke a session.
CREATE TABLE refresh_tokens (
  token_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash    text        NOT NULL UNIQUE,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

-- [SRS] NFR-4 "administrator actions shall be recorded", REQ-47.
CREATE TABLE admin_audit_log (
  log_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid        NOT NULL REFERENCES admins(user_id),
  action       text        NOT NULL,                                         -- e.g. 'user.suspend', 'venue.approve'
  target_table text        NOT NULL,
  target_id    uuid        NOT NULL,
  details      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_target_idx ON admin_audit_log(target_table, target_id);

-- =====================================================================
-- Venues
-- =====================================================================
CREATE TABLE venues (
  venue_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid            NOT NULL REFERENCES venue_owners(user_id),
  approved_by           uuid            REFERENCES admins(user_id),          -- nullable
  name                  text            NOT NULL,
  address               text            NOT NULL,
  city                  text            NOT NULL,
  location              geography(Point, 4326),                              -- GeoPoint (lng, lat)
  venue_type            venue_type      NOT NULL,
  supported_events      event_type[]    NOT NULL DEFAULT '{}',
  capacity              int             NOT NULL CHECK (capacity > 0),
  base_price            numeric(12, 2)  NOT NULL CHECK (base_price >= 0),     -- PKR
  facilities            text[]          NOT NULL DEFAULT '{}',
  description           text            NOT NULL DEFAULT '',
  avg_rating            real            NOT NULL DEFAULT 0 CHECK (avg_rating BETWEEN 0 AND 5),
  google_place_id       text,
  approval_status       approval_status NOT NULL DEFAULT 'pending',
  description_embedding vector(1536),                                        -- REQ-15, REQ-27
  rejection_reason      text,                                                -- [SRS] REQ-7 reject with a reason
  changes_note          text,                                                -- [Design] what to fix when approval_status = 'changes_requested' (srs-alignment #18)
  is_active             boolean         NOT NULL DEFAULT true,               -- [SRS] REQ-5 deactivate
  created_at            timestamptz     NOT NULL DEFAULT now(),
  updated_at            timestamptz     NOT NULL DEFAULT now(),
  -- [Design] srs-alignment #30 (migration 004): Become-a-host wizard fields
  category              text CHECK (category IN ('marquee','banquet_hall','lawn','farmhouse','hotel_ballroom','rooftop')),
  headline              text CHECK (char_length(headline) <= 60),
  area                  text,                                                -- card subtitle ("Johar Town")
  postal_code           text CHECK (postal_code ~ '^[0-9]{5}$'),
  google_maps_url       text CONSTRAINT venues_google_maps_url_check            -- [SRS] #37 (migration 008): link-out only
                        CHECK (google_maps_url IS NULL OR (google_maps_url LIKE 'https://%' AND char_length(google_maps_url) <= 500)),
  hosting_since         smallint CHECK (hosting_since BETWEEN 1947 AND 2100),
  landmark              text,                                                -- "15 min from Clock Tower"
  landmark_minutes      smallint CHECK (landmark_minutes BETWEEN 1 AND 180),
  directions            text,
  parking_spaces        int CHECK (parking_spaces >= 0),
  house_rules           text[]          NOT NULL DEFAULT '{}',
  custom_menu_note      text,
  advance_percent       smallint        NOT NULL DEFAULT 25 CHECK (advance_percent BETWEEN 0 AND 100),
  cancellation_policy   text            NOT NULL DEFAULT 'moderate'
                        CHECK (cancellation_policy IN ('flexible','moderate','strict','custom')),
  cancellation_note     text,
  booking_days          text[]          NOT NULL DEFAULT '{mon,tue,wed,thu,fri,sat,sun}'
                        CHECK (booking_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']),
  suspension_reason     text,                                                -- [Design] #29 admin's reason
  submitted_at          timestamptz,                                         -- last (re)submission for review
  reviewed_at           timestamptz                                          -- last admin decision
);
CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX venues_owner_idx    ON venues(owner_id);
CREATE INDEX venues_search_idx   ON venues(city, approval_status, is_active, capacity);
CREATE INDEX venues_location_idx ON venues USING gist(location);
CREATE INDEX venues_events_idx   ON venues USING gin(supported_events);
CREATE INDEX venues_embedding_idx ON venues USING hnsw (description_embedding vector_cosine_ops);
CREATE INDEX venues_admin_queue_idx ON venues (approval_status, submitted_at);
CREATE INDEX venues_facilities_idx  ON venues USING gin (facilities);

-- [Design] Not in the ERD or SRS text (docs/srs-alignment.md #17): a marquee has one or more halls, each with
-- its own capacity. venues.capacity (ERD) stays as the venue's largest capacity.
CREATE TABLE halls (
  hall_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  name       text        NOT NULL,
  capacity   int         NOT NULL CHECK (capacity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- [Design] srs-alignment #30 (migration 004): hall details from the wizard
  standing_capacity int CHECK (standing_capacity > 0),
  setting           venue_type NOT NULL DEFAULT 'indoor',
  has_ac            boolean    NOT NULL DEFAULT true,
  length_ft         smallint CHECK (length_ft BETWEEN 10 AND 1000),
  width_ft          smallint CHECK (width_ft BETWEEN 10 AND 1000),
  ceiling_ft        smallint CHECK (ceiling_ft BETWEEN 8 AND 100),
  description       text     NOT NULL DEFAULT '',
  floor_plan_url    text,
  floor_plan_type   text CHECK (floor_plan_type IN ('image','pdf')),
  zone_stage        smallint CHECK (zone_stage BETWEEN 0 AND 8),           -- cell of a 3 x 3 grid, row 0 = back
  zone_entrance     smallint CHECK (zone_entrance BETWEEN 0 AND 8),
  zone_seating      smallint CHECK (zone_seating BETWEEN 0 AND 8),
  walkthrough_mode  text     NOT NULL DEFAULT 'generate' CHECK (walkthrough_mode IN ('generate','upload','link','skip')),
  walkthrough_url   text,
  sort_order        smallint NOT NULL DEFAULT 0,
  CONSTRAINT halls_name_per_venue UNIQUE (venue_id, name),
  CONSTRAINT halls_venue_hall UNIQUE (venue_id, hall_id)   -- target of bookings_hall_same_venue; also the venue_id index
);

CREATE TABLE venue_images (
  image_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id            uuid                NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  image_url           text                NOT NULL,
  uploaded_at         timestamptz         NOT NULL DEFAULT now(),
  verification_status verification_status NOT NULL DEFAULT 'pending',
  is_published        boolean             NOT NULL DEFAULT false,
  -- [Design] srs-alignment #30 (migration 004)
  hall_id             uuid,                                                -- NULL = venue-wide photo
  category            text                NOT NULL DEFAULT 'main_hall' CHECK (category IN
                      ('main_hall','stage','seating','bridal_room','washrooms','entrance','exterior','parking','hallway','tour')),
  is_cover            boolean             NOT NULL DEFAULT false,
  sort_order          smallint            NOT NULL DEFAULT 0,
  mime_type           text,
  size_bytes          int CHECK (size_bytes > 0),
  CONSTRAINT venue_images_hall_same_venue FOREIGN KEY (venue_id, hall_id)
    REFERENCES halls (venue_id, hall_id) ON DELETE SET NULL (hall_id),
  -- REQ-9: only genuine (or admin-approved) images can be published
  CONSTRAINT venue_images_publish_rule
    CHECK (NOT is_published OR verification_status IN ('genuine', 'approved'))
);
CREATE UNIQUE INDEX venue_images_one_cover ON venue_images (venue_id) WHERE is_cover;
CREATE INDEX venue_images_venue_idx ON venue_images(venue_id);
CREATE INDEX venue_images_flagged_idx ON venue_images(verification_status) WHERE verification_status = 'flagged';

CREATE TABLE image_verifications (
  verification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id        uuid                NOT NULL REFERENCES venue_images(image_id) ON DELETE CASCADE,
  ai_score        real,                                                      -- probability the image is AI-generated
  result          verification_status NOT NULL,
  reviewed_by     uuid                REFERENCES admins(user_id),            -- set when an admin decides (REQ-10)
  checked_at      timestamptz         NOT NULL DEFAULT now()
);
CREATE INDEX image_verifications_image_idx ON image_verifications(image_id);

CREATE TABLE walkthrough_assets (
  asset_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  asset_type  asset_type  NOT NULL,
  file_url    text        NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  hall_id     uuid,                                                          -- [Design] #30 the hall it shows
  CONSTRAINT walkthrough_assets_hall_same_venue FOREIGN KEY (venue_id, hall_id)
    REFERENCES halls (venue_id, hall_id) ON DELETE CASCADE
);
CREATE INDEX walkthrough_assets_venue_idx ON walkthrough_assets(venue_id);

CREATE TABLE stage_photos (
  stage_photo_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  image_url      text        NOT NULL,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stage_photos_venue_idx ON stage_photos(venue_id);

CREATE TABLE menu_packages (
  menu_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid           NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  name            text           NOT NULL,
  description     text           NOT NULL DEFAULT '',
  price_per_head  numeric(10, 2) NOT NULL CHECK (price_per_head >= 0),
  is_customizable boolean        NOT NULL DEFAULT false,
  min_guests      int            NOT NULL DEFAULT 1 CHECK (min_guests > 0),
  sort_order      smallint       NOT NULL DEFAULT 0,                         -- [Design] #30
  archived_at     timestamptz                                                -- [Design] #35 (migration 006): replaced or removed; kept for bookings
);
CREATE INDEX menu_packages_venue_idx ON menu_packages(venue_id);

CREATE TABLE menu_items (
  item_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id     uuid    NOT NULL REFERENCES menu_packages(menu_id) ON DELETE CASCADE,
  name        text    NOT NULL,
  category    text    NOT NULL,                                              -- e.g. starter, main, dessert, drink
  is_optional boolean NOT NULL DEFAULT false,
  sort_order  smallint NOT NULL DEFAULT 0                                    -- [Design] #30
);
CREATE INDEX menu_items_menu_idx ON menu_items(menu_id);

CREATE TABLE add_ons (
  add_on_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid           NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  type         add_on_type    NOT NULL,
  name         text           NOT NULL,
  description  text           NOT NULL DEFAULT '',
  price        numeric(12, 2) NOT NULL CHECK (price >= 0),
  is_available boolean        NOT NULL DEFAULT true,
  archived_at  timestamptz                                                   -- [Design] #35 (migration 006): replaced or removed; kept for bookings
);
CREATE INDEX add_ons_venue_idx ON add_ons(venue_id);

-- [Design] srs-alignment #30 (migration 004): bridal suite (a preparation room, not a bookable hall).
CREATE TABLE bridal_suites (
  venue_id    uuid PRIMARY KEY REFERENCES venues(venue_id) ON DELETE CASCADE,
  name        text NOT NULL,
  capacity    int  NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  length_ft   smallint CHECK (length_ft BETWEEN 5 AND 200),
  width_ft    smallint CHECK (width_ft BETWEEN 5 AND 200),
  description text NOT NULL DEFAULT ''
);

-- [Design] #30: booking rules, which slots the venue offers (time_slots are generated from these).
CREATE TABLE venue_slot_templates (
  venue_id   uuid NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  slot_type  text NOT NULL CHECK (slot_type IN ('lunch','dinner')),
  start_time time NOT NULL,
  end_time   time NOT NULL,
  PRIMARY KEY (venue_id, slot_type),
  CONSTRAINT venue_slot_templates_order CHECK (end_time > start_time)
);

-- [Design] #30: custom cancellation policy rows (to_days NULL = "or more").
CREATE TABLE venue_cancellation_tiers (
  tier_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  from_days      smallint NOT NULL CHECK (from_days BETWEEN 0 AND 365),
  to_days        smallint CHECK (to_days <= 366),
  refund_percent smallint NOT NULL CHECK (refund_percent BETWEEN 0 AND 100),
  CONSTRAINT venue_cancellation_tiers_range CHECK (to_days IS NULL OR to_days > from_days)
);
CREATE INDEX venue_cancellation_tiers_venue_idx ON venue_cancellation_tiers (venue_id);

-- [Design] srs-alignment #31 (migration 005): server-side wizard autosave, one draft per owner and listing.
CREATE TABLE venue_drafts (
  draft_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES venue_owners(user_id) ON DELETE CASCADE,
  venue_id   uuid REFERENCES venues(venue_id) ON DELETE CASCADE,          -- NULL = new listing
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_drafts_one_per_listing UNIQUE NULLS NOT DISTINCT (owner_id, venue_id),
  CONSTRAINT venue_drafts_size CHECK (pg_column_size(data) <= 262144)
);

-- [Design] #31: files uploaded before the listing exists; attached to the venue on submit.
CREATE TABLE media_uploads (
  upload_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES venue_owners(user_id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('photo','floor_plan','walkthrough')),
  storage_key text NOT NULL UNIQUE,
  mime_type   text NOT NULL,
  size_bytes  int  NOT NULL CHECK (size_bytes > 0),
  venue_id    uuid REFERENCES venues(venue_id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_uploads_owner_idx ON media_uploads (owner_id, created_at);

-- [Design] srs-alignment #35 (migration 006): REQ-5 "a changed venue goes to Admin approval before customers see
-- it". Edits to a live venue's approval fields wait here; the live version stays public until an admin approves.
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

-- [Design] #35: owner actions (live edits, deactivate / reactivate). admin_audit_log.admin_id must be an admin.
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

-- =====================================================================
-- Time slots and bookings (double-booking prevention: REQ-20, NFR-2)
-- =====================================================================
CREATE TABLE time_slots (
  slot_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  hall_id    uuid        NOT NULL,                                           -- [Design] srs-alignment #19 (migration 002)
  date       date        NOT NULL,
  start_time time        NOT NULL,
  end_time   time        NOT NULL,
  status     slot_status NOT NULL DEFAULT 'available',
  held_by    uuid        REFERENCES customers(user_id),                      -- set only while status = 'held'
  held_until timestamptz,                                                    -- REQ-18 hold timer (default 10 min)
  CONSTRAINT time_slots_time_order CHECK (end_time > start_time),
  CONSTRAINT time_slots_hold_fields CHECK (
    (status = 'held' AND held_by IS NOT NULL AND held_until IS NOT NULL)
    OR (status <> 'held' AND held_by IS NULL AND held_until IS NULL)
  ),
  CONSTRAINT time_slots_hall_same_venue FOREIGN KEY (venue_id, hall_id)
    REFERENCES halls (venue_id, hall_id) ON DELETE CASCADE,
  -- Two slots of the same hall can never overlap on the same day (srs-alignment #19: halls book independently).
  CONSTRAINT time_slots_no_overlap EXCLUDE USING gist (
    hall_id WITH =,
    tsrange(date + start_time, date + end_time) WITH &&
  )
);
CREATE INDEX time_slots_venue_date_idx ON time_slots(venue_id, date, hall_id);
CREATE INDEX time_slots_expired_holds_idx ON time_slots(held_until) WHERE status = 'held';

CREATE TABLE bookings (
  booking_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id             uuid           NOT NULL REFERENCES time_slots(slot_id),
  customer_id         uuid           REFERENCES customers(user_id),          -- nullable: offline bookings
  venue_id            uuid           NOT NULL REFERENCES venues(venue_id),
  menu_package_id     uuid           REFERENCES menu_packages(menu_id),      -- nullable
  event_type          event_type     NOT NULL,
  guest_count         int            NOT NULL CHECK (guest_count > 0),
  status              booking_status NOT NULL DEFAULT 'requested',
  source              booking_source NOT NULL DEFAULT 'online',
  client_name         text,                                                  -- offline bookings (REQ-23)
  client_phone        text,                                                  -- offline bookings (REQ-23)
  total_amount        numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  advance_amount      numeric(12, 2) NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
  cancellation_reason text,                                                  -- REQ-22
  created_at          timestamptz    NOT NULL DEFAULT now(),
  qr_check_in_enabled boolean        NOT NULL DEFAULT false,                 -- [SRS] REQ-40 (mirrors invitation.qr_enabled)
  updated_at          timestamptz    NOT NULL DEFAULT now(),                 -- [SRS] audit of status changes
  hall_id             uuid,                                                  -- [Design] nullable: NULL = whole venue / no halls listed
  menu_price_per_head numeric(10, 2) CHECK (menu_price_per_head >= 0),       -- [Design] #35 (migration 006): price snapshot at booking time
  -- [Design] #38 (migration 009): price + policy snapshot at booking time, why it closed, the recorded refund
  hall_charge         numeric(12, 2) NOT NULL DEFAULT 0 CHECK (hall_charge >= 0),
  billable_guests     int CHECK (billable_guests > 0),
  advance_percent     smallint CHECK (advance_percent BETWEEN 0 AND 100),
  advance_due         numeric(12, 2) NOT NULL DEFAULT 0 CHECK (advance_due >= 0),
  policy_snapshot     jsonb,                                                 -- { policy, tiers: [{fromDays,toDays,percent}], note }
  customer_notes      text CHECK (char_length(customer_notes) <= 500),
  closed_as           text CHECK (closed_as IN ('cancelled', 'rejected', 'expired')),
  refund_percent      smallint CHECK (refund_percent BETWEEN 0 AND 100),
  refund_amount       numeric(12, 2) CHECK (refund_amount >= 0),
  -- [Design] #38 (migration 010): the booking flow's event details
  event_name          text CHECK (char_length(event_name) <= 80),
  host_name           text CHECK (char_length(host_name) <= 60),
  host_phone          text CHECK (host_phone ~ '^\+923[0-9]{9}$'),
  -- The booked hall must belong to the booked venue (composite FK; skipped when hall_id is NULL).
  CONSTRAINT bookings_hall_same_venue FOREIGN KEY (venue_id, hall_id) REFERENCES halls(venue_id, hall_id),
  CONSTRAINT bookings_party CHECK (
    (source = 'online'  AND customer_id IS NOT NULL)
    OR (source = 'offline' AND client_name IS NOT NULL AND client_phone IS NOT NULL)
  ),
  CONSTRAINT bookings_cancel_reason CHECK (status <> 'cancelled' OR cancellation_reason IS NOT NULL),
  CONSTRAINT bookings_closed_as_status CHECK ((status = 'cancelled') = (closed_as IS NOT NULL))
);
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- THE double-booking guard: at most one non-cancelled booking per slot, enforced by the database.
CREATE UNIQUE INDEX bookings_one_active_per_slot ON bookings(slot_id) WHERE status <> 'cancelled';
CREATE INDEX bookings_customer_idx ON bookings(customer_id);
CREATE INDEX bookings_venue_idx ON bookings(venue_id, status);
CREATE INDEX bookings_hall_idx ON bookings(hall_id);

-- [Design] #38 (migration 009): every booking status change, with who did it and when (NULL actor = system job).
CREATE TABLE booking_events (
  event_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  from_status booking_status,
  to_status   booking_status NOT NULL,
  actor_id    uuid REFERENCES users(user_id),
  actor_role  text NOT NULL CHECK (actor_role IN ('customer', 'venue_owner', 'admin', 'system')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_events_booking_idx ON booking_events (booking_id, created_at);

CREATE TABLE booking_add_ons (
  booking_id uuid           NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  add_on_id  uuid           NOT NULL REFERENCES add_ons(add_on_id),
  quantity   int            NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),               -- price snapshot at booking time
  PRIMARY KEY (booking_id, add_on_id)
);

-- =====================================================================
-- Quotations and payments
-- =====================================================================
-- ERD: Quotation.bookingId (required). The SRS (REQ-24, EUC-18, state machine) lets a customer
-- negotiate BEFORE a booking exists, so booking_id is nullable here and the [SRS] columns
-- carry the venue/slot/customer until the accepted quote is turned into a booking.
CREATE TABLE quotations (
  quotation_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid             REFERENCES bookings(booking_id),      -- set once accepted -> booked
  amount              numeric(12, 2)   NOT NULL CHECK (amount >= 0),
  terms               text             NOT NULL DEFAULT '',
  valid_until         date             NOT NULL,
  status              quotation_status NOT NULL DEFAULT 'proposed',
  round               int              NOT NULL DEFAULT 1 CHECK (round >= 1),
  proposed_by         role             NOT NULL CHECK (proposed_by IN ('customer', 'venue_owner')),
  created_at          timestamptz      NOT NULL DEFAULT now(),
  customer_id         uuid             NOT NULL REFERENCES customers(user_id), -- [SRS] REQ-24
  venue_id            uuid             NOT NULL REFERENCES venues(venue_id),   -- [SRS] REQ-24
  slot_id             uuid             REFERENCES time_slots(slot_id),         -- [SRS] REQ-24 "venue, date"
  event_type          event_type,                                              -- [SRS] REQ-24 "event details"
  guest_count         int CHECK (guest_count > 0),                             -- [SRS] REQ-24 "event details"
  previous_quotation_id uuid           REFERENCES quotations(quotation_id)     -- [SRS] links counter-offer rounds
);
CREATE INDEX quotations_customer_idx ON quotations(customer_id);
CREATE INDEX quotations_venue_idx    ON quotations(venue_id, status);
CREATE INDEX quotations_booking_idx  ON quotations(booking_id);

CREATE TABLE payments (
  payment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid           NOT NULL REFERENCES bookings(booking_id),
  amount     numeric(12, 2) NOT NULL CHECK (amount > 0),
  type       payment_type   NOT NULL,
  method     text           NOT NULL,                                        -- cash, bank transfer, JazzCash, Easypaisa...
  status     payment_status NOT NULL DEFAULT 'recorded',
  reference  text,
  paid_at    timestamptz    NOT NULL
);
CREATE INDEX payments_booking_idx ON payments(booking_id);
-- REQ-25 "reject an amount larger than the balance" is checked in the service inside the same
-- transaction that locks the booking row (SELECT ... FOR UPDATE). See docs/booking-engine.md.

-- =====================================================================
-- Reviews
-- =====================================================================
CREATE TABLE reviews (
  review_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid        NOT NULL REFERENCES customers(user_id),
  booking_id  uuid        NOT NULL UNIQUE REFERENCES bookings(booking_id),  -- REQ-42 once per booking
  venue_id    uuid        NOT NULL REFERENCES venues(venue_id),
  rating      int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  is_flagged  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz,                                                   -- [SRS] REQ-44 admin removal (soft)
  removed_by  uuid REFERENCES admins(user_id),                               -- [SRS] REQ-44
  removal_reason text                                                        -- [SRS] #36 (migration 007): why the admin hid it
);
CREATE INDEX reviews_venue_idx ON reviews(venue_id) WHERE removed_at IS NULL;
CREATE INDEX reviews_flagged_idx ON reviews (created_at) WHERE is_flagged;

-- [SRS] REQ-44 / EUC-34, srs-alignment #36 (migration 007): a logged-in user reports a review, once per review.
-- Reporting sets reviews.is_flagged; the admin's decision resolves the open reports.
CREATE TABLE review_reports (
  report_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(user_id),
  reason      text NOT NULL CHECK (reason IN ('spam', 'offensive', 'fake', 'off_topic', 'personal_info', 'other')),
  note        text CHECK (char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT review_reports_one_per_user UNIQUE (review_id, reporter_id)
);
CREATE INDEX review_reports_open_idx ON review_reports (review_id) WHERE resolved_at IS NULL;

CREATE TABLE google_reviews (
  google_review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  author_name      text        NOT NULL,
  rating           real        NOT NULL CHECK (rating BETWEEN 0 AND 5),
  text             text,
  review_date      date,
  fetched_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX google_reviews_venue_idx ON google_reviews(venue_id);

-- =====================================================================
-- Notifications
-- =====================================================================
CREATE TABLE notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid              NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  booking_id      uuid              REFERENCES bookings(booking_id),         -- nullable
  type            notification_type NOT NULL,
  title           text              NOT NULL,
  message         text              NOT NULL,
  is_read         boolean           NOT NULL DEFAULT false,
  sent_at         timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, sent_at DESC) WHERE NOT is_read;

-- =====================================================================
-- AI chatbot and search history
-- =====================================================================
CREATE TABLE chat_sessions (
  session_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid        NOT NULL REFERENCES customers(user_id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  context     jsonb       NOT NULL DEFAULT '{}'::jsonb                      -- extracted filters, shortlisted venue ids
);
CREATE INDEX chat_sessions_customer_idx ON chat_sessions(customer_id);

CREATE TABLE chat_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  sender     sender_type NOT NULL,
  content    text        NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_session_idx ON chat_messages(session_id, sent_at);

CREATE TABLE search_history (
  search_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid        NOT NULL REFERENCES customers(user_id) ON DELETE CASCADE,
  query_text    text,
  filters       jsonb       NOT NULL DEFAULT '{}'::jsonb,                    -- location, event_type, date, guests, budget
  results_count int         NOT NULL DEFAULT 0,
  searched_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_history_customer_idx ON search_history(customer_id, searched_at DESC);

-- =====================================================================
-- Invitations, RSVP and QR check-in
-- =====================================================================
CREATE TABLE invitations (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid        NOT NULL REFERENCES bookings(booking_id),        -- only Confirmed bookings (REQ-36, checked in service)
  title         text        NOT NULL,
  message       text        NOT NULL DEFAULT '',
  event_date    date        NOT NULL,
  event_time    time        NOT NULL,
  share_link    text        NOT NULL UNIQUE,
  qr_enabled    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- [Design] #39 (migration 011): the card builder's fields (#21) plus dress code and notes
  template      text        NOT NULL DEFAULT 'classic' CHECK (template IN ('classic', 'floral', 'modern', 'mehndi')),
  event_type    event_type,
  host_names    text CHECK (char_length(host_names) <= 120),
  rsvp_by       date,
  contact_phone text CHECK (contact_phone ~ '^\+923[0-9]{9}$'),
  dress_code    text CHECK (char_length(dress_code) <= 100),
  notes         text CHECK (char_length(notes) <= 1000),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_booking_idx ON invitations(booking_id);
CREATE UNIQUE INDEX invitations_one_per_booking ON invitations (booking_id);   -- [Design] #39 one per booking
CREATE TRIGGER invitations_updated_at BEFORE UPDATE ON invitations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE guests (
  guest_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id   uuid            NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
  name            text            NOT NULL,
  phone           text,                                                      -- [Design] #39 nullable: email and / or mobile
  invite_token    text            NOT NULL UNIQUE,                           -- [Design] #39: sha256 of the link token (REQ-3)
  delivery_status delivery_status NOT NULL DEFAULT 'pending',                -- [SRS] REQ-37 delivery status per guest
  delivery_error  text,                                                      -- [SRS] EUC-25 step 5.1
  -- [Design] #39 (migration 011)
  email            citext CHECK (char_length(email) <= 254),
  token_expires_at timestamptz,
  revoked_at       timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, phone),
  CONSTRAINT guests_contact CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT guests_phone_format CHECK (phone IS NULL OR phone ~ '^\+923[0-9]{9}$'),
  CONSTRAINT guests_email_per_invitation UNIQUE (invitation_id, email)
);
CREATE INDEX guests_invitation_idx ON guests (invitation_id);

CREATE TABLE rsvps (
  rsvp_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id     uuid          NOT NULL UNIQUE REFERENCES guests(guest_id) ON DELETE CASCADE, -- one current reply, updatable (EUC-26 4.1)
  response     rsvp_response NOT NULL,
  responded_at timestamptz   NOT NULL DEFAULT now(),
  -- [Design] #39 (migration 011): how many people the reply is for (0 for "no") and a note
  party_size   smallint NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 0 AND 20),
  note         text CHECK (char_length(note) <= 300),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rsvps_party_matches CHECK ((response = 'no') = (party_size = 0))
);

CREATE TABLE qr_codes (
  qr_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id  uuid        NOT NULL UNIQUE REFERENCES guests(guest_id) ON DELETE CASCADE,
  code      text        NOT NULL UNIQUE,                                     -- signed, unguessable
  issued_at timestamptz NOT NULL DEFAULT now(),
  is_used   boolean     NOT NULL DEFAULT false
);

-- Attendants have no user account (SRS Table 7). They reach check-in through an access code
-- the customer shares, limited to the booking they are assigned to (REQ-3).
CREATE TABLE attendants (
  attendant_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid        NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  name             text        NOT NULL,
  access_code_hash text        NOT NULL,                                     -- [SRS] REQ-3 attendant access
  is_active        boolean     NOT NULL DEFAULT true,                        -- [SRS] REQ-3
  created_at       timestamptz NOT NULL DEFAULT now()                        -- [SRS]
);
CREATE INDEX attendants_booking_idx ON attendants(booking_id);

CREATE TABLE check_ins (
  check_in_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id        uuid        REFERENCES qr_codes(qr_id),                       -- null when the scanned code matched nothing (invalid)
  attendant_id uuid        NOT NULL REFERENCES attendants(attendant_id),
  scanned_at   timestamptz NOT NULL DEFAULT now(),
  result       scan_result NOT NULL
);
-- Only one VALID check-in per QR code, enforced by the database (REQ-41 duplicate rule).
CREATE UNIQUE INDEX check_ins_one_valid_per_qr ON check_ins(qr_id) WHERE result = 'valid';

-- =====================================================================
-- Weather advisory
-- =====================================================================
-- ERD shows WeatherAdvisory with no link. REQ-46 issues it for a specific Confirmed booking,
-- so booking_id is added.
CREATE TABLE weather_advisories (
  advisory_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid        NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE, -- [SRS] REQ-46
  forecast_date    date        NOT NULL,
  condition        text        NOT NULL,                                     -- e.g. 'heavy_rain', 'thunderstorm'
  rain_probability real        CHECK (rain_probability BETWEEN 0 AND 1),
  severity         severity    NOT NULL,
  message          text        NOT NULL,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, forecast_date, condition)                              -- don't spam the same warning
);

-- =====================================================================
-- Decor marketplace and AI decor preview
-- =====================================================================
CREATE TABLE decor_packages (
  package_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decorator_id     uuid           NOT NULL REFERENCES decorators(user_id) ON DELETE CASCADE,
  name             text           NOT NULL,
  description      text           NOT NULL DEFAULT '',
  price            numeric(12, 2) NOT NULL CHECK (price >= 0),
  theme_style      text,
  portfolio_images text[]         NOT NULL DEFAULT '{}'
);
CREATE INDEX decor_packages_decorator_idx ON decor_packages(decorator_id);

CREATE TABLE decor_quotations (
  decor_quotation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decorator_id       uuid             NOT NULL REFERENCES decorators(user_id),
  package_id         uuid             REFERENCES decor_packages(package_id), -- nullable
  booking_id         uuid             NOT NULL REFERENCES bookings(booking_id),
  amount             numeric(12, 2)   CHECK (amount >= 0),                   -- null until the decorator quotes
  notes              text,                                                   -- customer brief / decorator notes
  status             quotation_status NOT NULL DEFAULT 'proposed',           -- 'countered' = customer asked for a revision
  created_at         timestamptz      NOT NULL DEFAULT now()
);
CREATE INDEX decor_quotations_decorator_idx ON decor_quotations(decorator_id, status);
CREATE INDEX decor_quotations_booking_idx   ON decor_quotations(booking_id);

CREATE TABLE decor_previews (
  preview_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decor_quotation_id  uuid        REFERENCES decor_quotations(decor_quotation_id), -- nullable, set when shared (REQ-33)
  stage_photo_id      uuid        NOT NULL REFERENCES stage_photos(stage_photo_id),
  booking_id          uuid        NOT NULL REFERENCES bookings(booking_id),
  concept_style       text        NOT NULL,
  prompt              text        NOT NULL,
  generated_image_url text        NOT NULL,
  is_shortlisted      boolean     NOT NULL DEFAULT false,
  generated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decor_previews_booking_idx ON decor_previews(booking_id);

CREATE TABLE decor_bookings (
  decor_booking_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decor_quotation_id uuid           NOT NULL UNIQUE REFERENCES decor_quotations(decor_quotation_id),
  agreed_amount      numeric(12, 2) NOT NULL CHECK (agreed_amount >= 0),
  advance_paid       numeric(12, 2) NOT NULL DEFAULT 0 CHECK (advance_paid >= 0),
  status             booking_status NOT NULL DEFAULT 'confirmed',
  CONSTRAINT decor_bookings_advance_le_total CHECK (advance_paid <= agreed_amount)
);

-- =====================================================================
-- Disputes
-- =====================================================================
CREATE TABLE disputes (
  dispute_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid           NOT NULL REFERENCES bookings(booking_id),
  admin_id    uuid           REFERENCES admins(user_id),                     -- nullable until an admin takes the case
  reason      text           NOT NULL,
  raised_by   uuid           NOT NULL REFERENCES users(user_id),            -- customer or venue owner
  status      dispute_status NOT NULL DEFAULT 'open',
  resolution  text,
  created_at  timestamptz    NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT disputes_resolved_fields CHECK (
    status <> 'resolved' OR (resolution IS NOT NULL AND resolved_at IS NOT NULL AND admin_id IS NOT NULL)
  )
);
CREATE INDEX disputes_status_idx ON disputes(status);
