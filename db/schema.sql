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
CREATE TYPE approval_status     AS ENUM ('pending', 'approved', 'rejected', 'changes_requested');       -- REQ-7 (+ [Design] changes_requested, srs-alignment #18)
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
  CONSTRAINT users_phone_pk_format CHECK (phone ~ '^\+923[0-9]{9}$')
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
  updated_at            timestamptz     NOT NULL DEFAULT now()
);
CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX venues_owner_idx    ON venues(owner_id);
CREATE INDEX venues_search_idx   ON venues(city, approval_status, is_active, capacity);
CREATE INDEX venues_location_idx ON venues USING gist(location);
CREATE INDEX venues_events_idx   ON venues USING gin(supported_events);
CREATE INDEX venues_embedding_idx ON venues USING hnsw (description_embedding vector_cosine_ops);

-- [Design] Not in the ERD or SRS text (docs/srs-alignment.md #17): a marquee has one or more halls, each with
-- its own capacity. venues.capacity (ERD) stays as the venue's largest capacity.
CREATE TABLE halls (
  hall_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  name       text        NOT NULL,
  capacity   int         NOT NULL CHECK (capacity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
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
  -- REQ-9: only genuine (or admin-approved) images can be published
  CONSTRAINT venue_images_publish_rule
    CHECK (NOT is_published OR verification_status IN ('genuine', 'approved'))
);
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
  uploaded_at timestamptz NOT NULL DEFAULT now()
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
  min_guests      int            NOT NULL DEFAULT 1 CHECK (min_guests > 0)
);
CREATE INDEX menu_packages_venue_idx ON menu_packages(venue_id);

CREATE TABLE menu_items (
  item_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id     uuid    NOT NULL REFERENCES menu_packages(menu_id) ON DELETE CASCADE,
  name        text    NOT NULL,
  category    text    NOT NULL,                                              -- e.g. starter, main, dessert, drink
  is_optional boolean NOT NULL DEFAULT false
);
CREATE INDEX menu_items_menu_idx ON menu_items(menu_id);

CREATE TABLE add_ons (
  add_on_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid           NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  type         add_on_type    NOT NULL,
  name         text           NOT NULL,
  description  text           NOT NULL DEFAULT '',
  price        numeric(12, 2) NOT NULL CHECK (price >= 0),
  is_available boolean        NOT NULL DEFAULT true
);
CREATE INDEX add_ons_venue_idx ON add_ons(venue_id);

-- =====================================================================
-- Time slots and bookings (double-booking prevention: REQ-20, NFR-2)
-- =====================================================================
CREATE TABLE time_slots (
  slot_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
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
  -- Two slots of the same venue can never overlap on the same day.
  CONSTRAINT time_slots_no_overlap EXCLUDE USING gist (
    venue_id WITH =,
    tsrange(date + start_time, date + end_time) WITH &&
  )
);
CREATE INDEX time_slots_venue_date_idx ON time_slots(venue_id, date);
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
  -- The booked hall must belong to the booked venue (composite FK; skipped when hall_id is NULL).
  CONSTRAINT bookings_hall_same_venue FOREIGN KEY (venue_id, hall_id) REFERENCES halls(venue_id, hall_id),
  CONSTRAINT bookings_party CHECK (
    (source = 'online'  AND customer_id IS NOT NULL)
    OR (source = 'offline' AND client_name IS NOT NULL AND client_phone IS NOT NULL)
  ),
  CONSTRAINT bookings_cancel_reason CHECK (status <> 'cancelled' OR cancellation_reason IS NOT NULL)
);
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- THE double-booking guard: at most one non-cancelled booking per slot, enforced by the database.
CREATE UNIQUE INDEX bookings_one_active_per_slot ON bookings(slot_id) WHERE status <> 'cancelled';
CREATE INDEX bookings_customer_idx ON bookings(customer_id);
CREATE INDEX bookings_venue_idx ON bookings(venue_id, status);
CREATE INDEX bookings_hall_idx ON bookings(hall_id);

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
  removed_by  uuid REFERENCES admins(user_id)                                -- [SRS] REQ-44
);
CREATE INDEX reviews_venue_idx ON reviews(venue_id) WHERE removed_at IS NULL;

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
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_booking_idx ON invitations(booking_id);

CREATE TABLE guests (
  guest_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id   uuid            NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
  name            text            NOT NULL,
  phone           text            NOT NULL,
  invite_token    text            NOT NULL UNIQUE,                           -- secure random, used in the guest link (REQ-3)
  delivery_status delivery_status NOT NULL DEFAULT 'pending',                -- [SRS] REQ-37 delivery status per guest
  delivery_error  text,                                                      -- [SRS] EUC-25 step 5.1
  UNIQUE (invitation_id, phone)
);

CREATE TABLE rsvps (
  rsvp_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id     uuid          NOT NULL UNIQUE REFERENCES guests(guest_id) ON DELETE CASCADE, -- one current reply, updatable (EUC-26 4.1)
  response     rsvp_response NOT NULL,
  responded_at timestamptz   NOT NULL DEFAULT now()
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
