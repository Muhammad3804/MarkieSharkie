# SRS alignment log

The SRS text (requirements, use cases) and its diagrams (ERD, state machine, class diagram) disagree in a few places. These are the decisions made so that the code, `db/schema.sql` and `CLAUDE.md` do **not** conflict with the SRS. When the SRS is next revised, these are the spots to tidy up.

Rule: the requirement text (REQ-x / EUC-xx) wins over a diagram, because it is the more specific contract. Every ERD table and column is kept as is; only additions were made.

| # | Where | Gap | Decision |
|---|---|---|---|
| 1 | REQ-19 vs REQ-21 vs State Machine (Fig. 18) | REQ-19 says the slot becomes Booked when the customer confirms. The state machine shows Requested → Held (awaiting advance) → Confirmed with the slot only Held. REQ-21 lists Requested, Held, Confirmed. | Slot hold (10 min) is a **slot** state. When the customer confirms, booking = `requested` and slot = `booked` (REQ-19, REQ-20: nobody else can take it). Owner accepts → `held` (awaiting advance). Owner confirms → `confirmed`. Reject/cancel → `cancelled`, slot freed. Satisfies all three. See `docs/booking-engine.md`. |
| 2 | ERD `Quotation.bookingId` vs REQ-24, EUC-18, State Machine | ERD requires a booking for every quotation, but the customer negotiates before booking. | `quotations.booking_id` is nullable. Added `customer_id`, `venue_id`, `slot_id`, `event_type`, `guest_count`, `previous_quotation_id`. Booking ID set once the accepted quote is booked. |
| 3 | ERD `WeatherAdvisory` | Has no FK; nothing links it to a booking. REQ-46 issues it per Confirmed booking. | Added `weather_advisories.booking_id`. |
| 4 | ERD `User` vs REQ-1, REQ-4 | `city` is required at registration for every role but only Decorator has it. | Added `users.city`. `decorators.city` kept (ERD) as the service city. |
| 5 | REQ-2 | Lockout after 5 failed logins, OTP reset, 30-min inactivity: no columns/tables in ERD. | Added `users.failed_login_attempts`, `users.locked_until`, `users.last_login_at`, tables `password_reset_codes`, `refresh_tokens`. |
| 6 | NFR-4 "administrator actions shall be recorded" | No table in ERD. | Added `admin_audit_log`. |
| 7 | REQ-7 reject with reason, REQ-5 deactivate | No columns in ERD. | Added `venues.rejection_reason`, `venues.is_active`. |
| 8 | REQ-37 delivery status per guest | `Guest` has no delivery field. | Added `guests.delivery_status`, `guests.delivery_error`. |
| 9 | REQ-3 attendants access only assigned events; Table 7 says attendants have no account | ERD `Attendant` has only name + booking. | Added `attendants.access_code_hash`, `is_active`, `created_at`. Customer creates an attendant and shares a code. |
| 10 | REQ-44 review removal | No removal field. | Added `reviews.removed_at`, `reviews.removed_by` (soft delete keeps the audit trail). |
| 11 | REQ-47 remove account, NFR-8 deletion request | No field. | Added `users.deleted_at`; on deletion personal fields are anonymized. |
| 12 | REQ-40 | QR choice is on `Invitation.qrEnabled`. | Kept. `bookings.qr_check_in_enabled` added as a convenience mirror; `invitations.qr_enabled` is the source of truth. |
| 13 | ERD `CheckIn.qrId` | An invalid scan matches no QR row but REQ-41 wants it shown/recorded. | `check_ins.qr_id` is nullable for `invalid` results. |
| 14 | REQ-30 "ask for a revision" | `QuotationStatus` has no "revision requested". | `decor_quotations.status = 'countered'` means the customer asked for a revision. |
| 15 | Enum values | ERD names enums but does not list values. | Values taken from SRS text (SlotStatus, BookingStatus, QuotationStatus, DisputeStatus, VenueType, ScanResult). Others (EventType, NotificationType, AssetType, Severity, PaymentStatus) chosen sensibly. Listed in `docs/database.md`. |
| 16 | 3D walkthrough approach | Planning chat discussed generating 3D from owner-entered dimensions; SRS REQ-11 / EUC-06 says owner **uploads** 3D/360° files. | Build REQ-11 as written (upload `model_3d` glTF/GLB or `panorama_360` image, render in browser). Dimension-based generator is an optional extra, not a replacement. |
| 17 | Halls (team design addition, **not** an SRS gap) | Neither the ERD nor the SRS text has halls: a venue has one `capacity` and one set of time slots. The UI and real marquees have several halls with their own capacities. | Added table `halls` (`hall_id`, `venue_id`, `name`, `capacity`, `created_at`) and nullable `bookings.hall_id` (NULL = whole venue), marked `-- [Design]`. A composite FK keeps the hall inside the booked venue. `venues.capacity` kept (ERD) as the largest capacity. Slots stay per venue, so the double-booking guard is unchanged: one active booking per venue slot, and two halls of one venue cannot be booked for overlapping times. Making halls independently bookable would need `time_slots.hall_id` and per-hall overlap/one-active-booking constraints; not done. Explain this to the panel as a deviation from Figure 6. |

## Open questions for the team

- Embedding model: schema uses `vector(1536)` (OpenAI `text-embedding-3-small`). If the team uses Gemini embeddings, switch to `vector(768)` before the first migration.
- Colour palette: confirm the one used in Figma before building the design tokens.
