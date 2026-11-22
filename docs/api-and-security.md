# API and security

## REST conventions

- Base path `/api`. JSON in/out, camelCase.
- Resource style: `GET /api/venues`, `POST /api/venues`, `PATCH /api/venues/:id`, `POST /api/bookings/:id/cancel` (actions as sub-resources).
- Pagination: `?page=1&pageSize=20` → `{ data, page, pageSize, total }`.
- Errors: `{ error: { code: 'SLOT_UNAVAILABLE', message: 'This slot was just taken. Pick another time.', details? } }`. Messages are user-facing and say how to fix the problem (NFR-3).
- Status codes: 400 validation, 401 not logged in, 403 wrong role/ownership, 404, 409 state conflict (slot taken, invalid transition), 422 business rule (amount > balance), 423 account locked, 429 rate limit, 502/503 external service down.
- Error codes in use (full list: `ErrorCode` in `server/openapi.yaml`, checked by a test): `VALIDATION_ERROR` (details = `[{ field, message }]`), `INVALID_JSON`, `BAD_REQUEST`, `EMAIL_TAKEN`, `PHONE_TAKEN`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED` (details = `{ minutesRemaining }`), `ACCOUNT_SUSPENDED`, `SESSION_EXPIRED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `INTERNAL_ERROR`.
- Document every route in `server/openapi.yaml` (NFR-6). Update it in the same change as the route.

## Route map (by role)

| Area | Routes | Who |
|---|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/verify-reset-code`, `/auth/reset-password` | public |
| Me | `GET /me` | any user |
| Me | `PATCH /me` | customer, venue_owner, decorator (EUC-03 actors, srs-alignment #24) |
| Me | `GET /me/searches`, `GET /me/bookings` | customer (REQ-4) |
| Venues (public) | **Built:** `GET /venues/landing`, `GET /venues` (search, saves a customer's history), `GET /venues/:id`, `GET /venues/:id/availability?from&to`, `GET /venues/:id/reviews` (platform reviews + rating, hidden ones left out), `GET /stats`. Planned: `POST /venues/compare` | public (optional customer token) |
| Recommendations | `GET /recommendations` | customer |
| Owner venues | **Built:** `GET/PUT/DELETE /owner/draft`, `POST /owner/uploads` (multipart), `GET/POST /owner/venues`, `GET/PUT /owner/venues/:id` (resubmit), `POST /owner/venues/:id/images/verify`; live venues (2026-11-22, #35): `PUT /owner/venues/:id/edit`, `GET/DELETE /owner/venues/:id/revision`, `POST /owner/venues/:id/deactivate|reactivate`, `POST /owner/venues/:id/menus`, `PUT/DELETE /owner/venues/:id/menus/:menuId`, `POST /owner/venues/:id/add-ons`, `PUT/DELETE /owner/venues/:id/add-ons/:addOnId`. Planned: stage photos, slots (create/block/unblock) | venue_owner (own venues; another owner's id is 404) |
| Holds and bookings | `POST /slots/:id/hold`, `DELETE /slots/:id/hold`, `POST /bookings`, `POST /bookings/:id/cancel`, `PUT /bookings/:id/add-ons`, `PUT /bookings/:id/menu` | customer |
| Owner bookings | `GET /owner/bookings`, `POST /owner/bookings/:id/accept|confirm|reject`, `POST /owner/bookings/offline` | venue_owner |
| Quotations | `POST /quotations`, `POST /quotations/:id/accept|reject|counter`, `GET /quotations` | customer, venue_owner |
| Payments | `POST /bookings/:id/payments` (owner), `GET /bookings/:id/payments` (both) | |
| Chatbot | `POST /chat/sessions`, `POST /chat/sessions/:id/messages`, `GET /chat/sessions` | customer |
| Decor | `GET /decorators`, `GET /decorators/:id`, `PATCH /decorator/profile`, `/decorator/packages`, `POST /decor-quotations`, `POST /decor-quotations/:id/quote|accept|reject|revise`, `POST /bookings/:id/decor-previews`, `PATCH /decor-previews/:id/shortlist`, `POST /decor-previews/share` | customer, decorator |
| Invitations | `POST /bookings/:id/invitation`, `POST /invitations/:id/guests`, `POST /invitations/:id/send`, `GET /invitations/:id/rsvp-summary`, `GET /invitations/:id/attendance`, `POST /bookings/:id/attendants` | customer |
| Guest | `GET /i/:token`, `POST /i/:token/rsvp` | guest (token) |
| Check-in | `POST /checkin/session` (event code), `POST /checkin/scan` | attendant (code) |
| Webhooks | `POST /webhooks/whatsapp` (delivery status + RSVP button replies) | Meta, signature verified |
| Reviews | **Built (2026-11-22, #36):** `POST /venues/:id/reviews/:reviewId/report` (customer, venue_owner, decorator; once per user per review). Planned: `POST /bookings/:id/review` (customer, after a completed booking) | logged in, not admin |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | any user |
| Weather | `GET /bookings/:id/weather` | customer |
| Disputes | `POST /bookings/:id/disputes` | customer, venue_owner |
| Admin | **Built:** `GET /admin/venues` (status, search, filters, sort, pages), `GET /admin/venues/:id`, `POST /admin/venues/:id/approve|reject|request-changes|suspend|unsuspend`, `POST /admin/venues/approve` (bulk), `GET /admin/images`, `POST /admin/images/:id/decision`, `GET /admin/stats`, `GET /admin/audit`, `GET /admin/revisions[/:id]`, `POST /admin/revisions/:id/approve|reject`, `GET /admin/reviews`, `POST /admin/reviews/:id/hide|restore|dismiss`, `DELETE /admin/reviews/:id` (reason required). Planned: `/admin/users` (+ suspend/unblock/remove), `/admin/admins`, `/admin/bookings`, `/admin/disputes` | admin (every write audited) |

## Authentication (REQ-2, NFR-4)

- Passwords: **argon2id** (or bcrypt cost 12). Never log or return hashes.
- Login by email or phone. On wrong password: `failed_login_attempts++`; at 5 set `locked_until = now() + 15 min` → 423. Reset counter on success. Same generic error for unknown user and wrong password.
- **Access token**: JWT, 15 min, payload `{ sub, role }`, sent as `Authorization: Bearer`.
- **Refresh token**: random 256-bit, stored hashed in `refresh_tokens`, sent as `httpOnly; Secure; SameSite=Strict` cookie. Rotated on each refresh. Rejected if `last_used_at` older than **30 min** (inactivity, REQ-2) or revoked. Logout revokes it.
- Password reset (built 2026-11-22): `POST /auth/forgot-password {email}` emails a 6-digit code (`crypto.randomInt`;
  stored in `password_reset_codes` only as an HMAC-SHA256 keyed with a server secret; 10 min; single use; a new
  request spends earlier codes; 30 s resend cooldown). Same 200 answer whether or not the email exists; rate limited
  10 / 15 min per IP and 3 / 15 min per email. `POST /auth/verify-reset-code {email, code}` checks without spending;
  `POST /auth/reset-password {email, code, newPassword}` (signup password rules) sets the argon2id hash, spends the
  code, clears the login lock and revokes all refresh tokens. 5 wrong codes -> `RESET_CODE_LOCKED` (423); expired /
  used / replaced -> `RESET_CODE_EXPIRED`; wrong (or unknown email) -> `RESET_CODE_INVALID` with `attemptsLeft`.
  Email via nodemailer (`integrations/mailer.js`, SMTP_* in `.env`); without SMTP, development prints the code in the
  server console and production refuses to send (never logs the code).
- Login response has `firstLogin` (true when `users.last_login_at` was empty before), for the client's welcome toast.
- First admin: `npm run seed:admin` (SEED_ADMIN_* in `.env`, idempotent; `-- --reset-password` to change the
  password) or the interactive `npm run create-admin`.
- Public registration only allows `customer`, `venue_owner`, `decorator`. Admins are created by an existing admin (REQ-1); the very first admin comes from a seed/CLI script (`npm run create-admin`), never from an API route.
- Suspended (`is_active=false`) or deleted users: block at login **and** in the auth middleware on every request (REQ-3).

## Venues, uploads and moderation (Phase 2, built 2026-11-22)

- **Visibility:** public routes return only `approval_status = 'approved' AND is_active`; anything else is 404 (never
  says why). Venue lists are `Cache-Control: no-store` so an approval or suspension shows at once.
- **Ownership:** every owner route checks `venues.owner_id = req.user.id` in the service; another owner's venue or
  draft is 404. Upload ids in a submission must be the owner's own, of the right kind, unused (or already this
  venue's), else 400 with the field path.
- **Uploads (REQ-8, REQ-11):** multipart, one file, the type is read from the first bytes (JPEG / PNG / PDF / glTF),
  never the name or Content-Type: photo JPEG/PNG ≤ 5 MB, floor plan JPEG/PNG/PDF ≤ 10 MB, walkthrough `.glb` ≤ 50 MB
  or 360° JPEG ≤ 20 MB (415 / 413 otherwise). 128-bit random names under `venues/owner-<id>/`, 300 uploads a day per
  owner, at most 60 photos per listing. Stored through `integrations/storage.js` (local disk `server/uploads/`,
  git-ignored; S3 / Cloudinary can replace it). Served at `/uploads/*` with `nosniff`, no directory listing, no
  dotfiles, CORP `cross-origin` (the PWA is on another origin), non-images as downloads (`Content-Disposition:
  attachment`; `.glb` as `model/gltf-binary` so the 3D viewer can fetch it). `../` paths are refused (tested). File URLs are unguessable
  but not secret: an unapproved listing's photos can be fetched by anyone who has the URL.
- **AI image check (REQ-9, REQ-10):** after the submission commits, each photo goes to `integrations/imageDetection.js`
  (Sightengine `genai`; fake when no API user / secret). Score ≤ `IMAGE_DETECTION_GENUINE_THRESHOLD` → genuine,
  above → flagged (never published automatically, never deleted; admin keeps or removes it). Detector down → stays
  pending, the owner can retry. Every check is a row in `image_verifications`. Approving a venue publishes genuine
  photos and the still-unchecked ones (the admin reviewed them, srs-alignment #28); flagged ones wait for a decision.
- **AI check test (demo):** `GET /admin/image-detection` (which detector, thresholds) and
  `POST /admin/image-detection/test` (one JPEG / PNG ≤ 5 MB through the same detector and rules; nothing stored but
  an audit row; 30 an hour per IP because it may call the paid API).
- **Editing a live venue (EUC-04, EUC-07, srs-alignment #35):** approved venues only (409 otherwise). Live at
  once: headline, directions, landmark, parking, house rules, Google Maps link, hosting since, custom menu note,
  photos (new ones still pass the AI check), menu packages, add-ons. The REQ-5 fields (name, type, address, pin,
  events, amenities, description, halls, bridal suite, booking rules) go into one pending `venue_revisions` row; the
  live version stays public until `POST /admin/revisions/:id/approve` applies it in one transaction (halls updated in
  place, so slots and bookings stay attached) or `/reject` (reason required). Packages / add-ons a booking uses are
  archived and replaced, never changed. A hall with bookings can't be removed. Every id in an edit (photos, files,
  packages, add-ons, uploads) must belong to that venue / owner. Owner actions go to `owner_activity_log`; admin
  decisions to `admin_audit_log`.
- **Review moderation (REQ-44, EUC-34, srs-alignment #36):** reporting needs a login (admins can't; not your own
  review, 403; once per user per review, 409 `ALREADY_REPORTED`; 30 an hour per IP) and only works for reviews on a
  public venue page. A report sets `reviews.is_flagged`. The admin hides (soft: `removed_at`, `removed_by`,
  `removal_reason`), restores, keeps ("dismiss", reports closed) or deletes (row gone, its text kept in the audit
  row). Each decision locks the review, closes its open reports, recomputes `venues.avg_rating` from visible reviews
  and writes `admin_audit_log` in one transaction. Hidden reviews never reach public responses.
- **Google Maps link (REQ-43, EUC-30, srs-alignment #37):** `venues.google_maps_url` is the only Google feature. No
  Google API, key or network call; no Google review text or rating is stored or shown. Zod (create and edit): optional,
  trimmed, `''` -> null, `https:` only (http, javascript:, data: refused), host exactly one of `google.com`,
  `www.google.com`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl`, `g.page`, no credentials, ≤ 500 characters;
  the DB CHECK (migration 008) repeats https + length. Only the owner (ownership check) sets it; it goes live at once.
  The client re-checks the URL before rendering the `<a target="_blank" rel="noopener noreferrer">`.
- **Deactivate (REQ-5):** `is_active = false` hides the venue from search, its page and new bookings; confirmed
  bookings stay valid; requests already made stay with the owner (docs/booking-engine.md).
- **Admin writes:** lock the venue row, check the transition (409 `INVALID_STATUS`), change, write `admin_audit_log`
  (who, what, when, reason / note / checklist) in one transaction. Bulk approve is all or nothing.
- **Rate limits (per IP):** public reads 1500 / 15 min, owner writes 600 / 15 min, uploads 400 / hour, admin writes
  600 / 15 min (`middleware/rateLimit.js`).

## Authorization (REQ-3, SYS-04)

Two checks on every protected route:
1. `requireRole('venue_owner')` middleware.
2. Ownership check in the service: e.g. `venue.owner_id === req.user.id`, `booking.customer_id === req.user.id`. Return 404 (not 403) for other people's resources so IDs can't be probed.

| Capability | customer | venue_owner | decorator | admin | guest | attendant |
|---|---|---|---|---|---|---|
| Search/view approved venues | ✓ | ✓ | ✓ | ✓ | public | |
| Hold/book/cancel, quotations, chatbot, reviews, invitations | own | | | | | |
| Manage venues, slots, menus, add-ons, offline bookings, record payments | | own venues | | | | |
| Decor profile, packages, reply to decor requests | | | own | | | |
| Approve venues, flagged images/reviews, users, disputes | | | | ✓ | | |
| View invitation + RSVP | | | | | own token | |
| Scan QR | | | | | | assigned event |

Guests: `invite_token` (32+ random bytes, base64url). Attendants: access code → short-lived JWT `{ attendantId, bookingId, scope:'checkin' }` valid on event day only.

## Input validation

- Zod schema per route for `body`, `params`, `query`. Reject unknown keys.
- Phone: normalize `03XX-XXXXXXX` / `+92 3XX XXXXXXX` → `+923XXXXXXXXX`.
- Uploads (multer): images JPEG/PNG ≤ 5 MB (REQ-8); 3D: `.glb/.gltf` ≤ 50 MB, 360: JPEG ≤ 20 MB (REQ-11). Check magic bytes, not just extension. Random file names. Never serve uploads from the API origin with executable types.
- All SQL parameterized. No string-built SQL, ever.

## Hardening checklist

- `helmet`, strict CORS (frontend origin only), `express-rate-limit` on auth, OTP, chatbot, and guest RSVP routes.
- HTTPS only in production; `trust proxy` set correctly.
- Request body size limit (e.g. 1 MB JSON).
- Secrets only from env, validated at startup with Zod; app refuses to start if required ones are missing.
- WhatsApp webhook: verify `X-Hub-Signature-256`.
- QR codes: random token (not guessable IDs); validation checks event + `is_used` inside a transaction with `FOR UPDATE`.
- LLM: user text never concatenated into system instructions; treat model output as untrusted (render as text, no HTML).
- Admin actions → `admin_audit_log` in the same transaction as the action.
- Logs: no passwords, tokens, OTPs or full phone numbers.
- Account deletion (NFR-8): anonymize name/email/phone, set `deleted_at`, revoke tokens; keep bookings for owners' records.
