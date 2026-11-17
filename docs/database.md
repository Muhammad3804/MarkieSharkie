# Database

`db/schema.sql` is the full schema. It loads cleanly on PostgreSQL 16 with pgvector and PostGIS, and the double-booking, slot-overlap, hold-field, offline-booking and phone-format constraints were tested.

Source: SRS Figure 6 (ERD). All 36 ERD tables and every ERD column are present. Extra columns/tables required by SRS text are marked `-- [SRS]` and explained in `docs/srs-alignment.md`.

## Extensions

`pgcrypto` (UUIDs), `vector` (pgvector), `postgis` (venue location), `btree_gist` (slot overlap exclusion), `citext` (emails). Managed hosts that support all of them: Neon, Supabase, Render, AWS RDS.

## ERD → table names

| ERD entity | Table | | ERD entity | Table |
|---|---|---|---|---|
| User | `users` | | Invitation | `invitations` |
| Customer | `customers` | | Guest | `guests` |
| VenueOwner | `venue_owners` | | RSVP | `rsvps` |
| Decorator | `decorators` | | QRCode | `qr_codes` |
| Admin | `admins` | | CheckIn | `check_ins` |
| Venue | `venues` | | Attendant | `attendants` |
| TimeSlot | `time_slots` | | WeatherAdvisory | `weather_advisories` |
| Booking | `bookings` | | DecorPackage | `decor_packages` |
| Quotation | `quotations` | | DecorQuotation | `decor_quotations` |
| Payment | `payments` | | DecorPreview | `decor_previews` |
| MenuPackage | `menu_packages` | | DecorBooking | `decor_bookings` |
| MenuItem | `menu_items` | | Dispute | `disputes` |
| AddOn | `add_ons` | | Review | `reviews` |
| BookingAddOn | `booking_add_ons` | | GoogleReview | `google_reviews` |
| VenueImage | `venue_images` | | Notification | `notifications` |
| ImageVerification | `image_verifications` | | ChatSession | `chat_sessions` |
| WalkthroughAsset | `walkthrough_assets` | | ChatMessage | `chat_messages` |
| StagePhoto | `stage_photos` | | SearchHistory | `search_history` |

Added by SRS text: `password_reset_codes`, `refresh_tokens`, `admin_audit_log`.

Team design additions (`-- [Design]`, not in the ERD or SRS, see `docs/srs-alignment.md` #17): `halls` (`hall_id`, `venue_id`, `name`, `capacity`, `created_at`) and `bookings.hall_id` (nullable; NULL = whole venue). `venues.capacity` stays as the largest capacity. Also `[Design]` (#18): `approval_status` value `changes_requested` and `venues.changes_note` (admin asks the owner for fixes; resubmit sets `pending` again).

Columns: ERD camelCase → snake_case (`heldUntil` → `held_until`, `menuPackageId` → `menu_package_id`). Exceptions: `MenuPackage.menuId` stays `menu_id`, `Booking.menuPackageId` → `menu_package_id` (FK to `menu_packages.menu_id`).

## Role tables

`customers`, `venue_owners`, `decorators`, `admins` share `users.user_id` as PK + FK (ERD note). Registration inserts `users` + the role row in one transaction. `users.role` must match the role table the user has a row in.

## Enums

| Enum | Values | From |
|---|---|---|
| role | customer, venue_owner, decorator, admin | REQ-3 |
| venue_type | indoor, outdoor, semi_outdoor | REQ-5 |
| event_type | wedding, mehndi, barat, walima, engagement, birthday, corporate, conference, religious, other | chosen |
| approval_status | pending, approved, rejected, changes_requested | REQ-7 (`changes_requested` is a [Design] addition, srs-alignment #18) |
| slot_status | available, held, booked, blocked | REQ-16 |
| booking_status | requested, held, confirmed, completed, cancelled | REQ-21 |
| booking_source | online, offline | REQ-23 |
| quotation_status | proposed, countered, accepted, rejected, expired | REQ-24 |
| payment_type | advance, balance | REQ-25 |
| payment_status | recorded, received, void | chosen |
| add_on_type | sound_system, smd | REQ-34 |
| verification_status | pending, genuine, flagged, approved, rejected | REQ-9, REQ-10 |
| asset_type | model_3d, panorama_360, video_360 | REQ-11 |
| notification_type | booking, quotation, payment, venue_approval, image_verification, decor, invitation, weather, review, dispute, account, system | REQ-45 |
| sender_type | customer, assistant | chat |
| rsvp_response | yes, no | REQ-38 |
| scan_result | valid, invalid, duplicate | REQ-41 |
| severity | low, moderate, high, severe | REQ-46 |
| dispute_status | open, under_review, resolved | REQ-48 |
| delivery_status | pending, sent, delivered, read, failed | REQ-37 |

Adding an enum value: `ALTER TYPE x ADD VALUE 'y';` in a migration. Never remove values.

## Integrity the database enforces

| Constraint | Protects |
|---|---|
| `bookings_one_active_per_slot` (partial unique on `slot_id` where not cancelled) | REQ-20 double booking |
| `time_slots_no_overlap` (exclusion, gist) | overlapping slots for one venue |
| `time_slots_hold_fields` | `held` ⇔ `held_by` + `held_until` set |
| `bookings_party` | online needs `customer_id`; offline needs client name + phone |
| `bookings_cancel_reason` | REQ-22 reason required |
| `bookings_hall_same_venue` (composite FK `(venue_id, hall_id)` → `halls`) | a booking's hall belongs to the booked venue |
| `halls_name_per_venue` | no two halls with the same name in one venue |
| `venue_images_publish_rule` | REQ-9 only genuine/approved images published |
| `reviews.booking_id UNIQUE` | REQ-42 one review per booking |
| `rsvps.guest_id UNIQUE` | one current reply per guest, updated on change |
| `qr_codes.guest_id UNIQUE`, `check_ins_one_valid_per_qr` | REQ-40/41 one QR per guest, no double entry |
| `users_phone_pk_format` | REQ-1 phone stored as `+923XXXXXXXXX` |
| `disputes_resolved_fields` | resolved disputes have resolution, time, admin |

Rules enforced in services (need data from several tables): review only after `completed` booking; invitation only for `confirmed` booking; payment ≤ balance; menu `min_guests`; guest count ≤ capacity (the booked hall's `capacity` when `hall_id` is set, else `venues.capacity`); add-on available on the date; slot state transitions; quotation turn-taking.

## Derived values (do not store separately)

- Remaining balance = `bookings.total_amount - SUM(payments.amount where status <> 'void')`.
- Attendance count = `COUNT(check_ins WHERE result='valid')` for the booking's invitation guests.
- RSVP summary = counts of `rsvps.response` grouped, plus guests with no RSVP row.
- `venues.avg_rating` IS stored (ERD) and recalculated in the same transaction that inserts/removes a review.

## Embeddings

- `venues.description_embedding`: built from name + city + type + events + facilities + description + capacity + price. Recompute when any of those change.
- `customers.preference_embedding`: average of embeddings of venues the customer viewed/booked plus their recent search text.
- Similarity: `ORDER BY description_embedding <=> $1 LIMIT k` (cosine; HNSW index exists).

## Location

`venues.location` is `geography(Point, 4326)`. Insert with `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`. Distance search: `ST_DWithin(location, ST_MakePoint($lng,$lat)::geography, $meters)`.

## Migrations and seeds

- `db/schema.sql` = full current schema (for reading and fresh setup).
- `server/migrations/` (node-pg-migrate, SQL files) = how the live DB gets there. The first migration is a copy of `schema.sql`. Every later change = new migration + update `schema.sql` + update this doc.
- No migration exists yet (no `server/`), so changes made before the first migration (e.g. `halls`, `bookings.hall_id`) go straight into `schema.sql` and ship in that first migration. Separate migrations start after it.
- `db/seeds/`: 15-20 real local marquees (with permission) + 50-100 synthetic venues around Faisalabad, Lahore, Islamabad, Karachi; one demo user per role; slots for the next 60 days. Seeds must be idempotent.
