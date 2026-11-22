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
| Venues (public) | `GET /venues` (search), `GET /venues/:id`, `GET /venues/:id/slots?from&to`, `GET /venues/:id/reviews`, `POST /venues/compare` | public / customer |
| Recommendations | `GET /recommendations` | customer |
| Owner venues | `POST /owner/venues`, `PATCH /owner/venues/:id`, `POST /owner/venues/:id/deactivate`, images, walkthroughs, stage-photos, menus, add-ons, slots (create/block/unblock) | venue_owner (own venues) |
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
| Reviews | `POST /bookings/:id/review`, `POST /reviews/:id/flag` | customer |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | any user |
| Weather | `GET /bookings/:id/weather` | customer |
| Disputes | `POST /bookings/:id/disputes` | customer, venue_owner |
| Admin | `/admin/users` (+ suspend/unblock/remove), `/admin/admins` (create admin), `/admin/venues/pending` (+ approve/reject), `/admin/images/flagged`, `/admin/reviews/flagged`, `/admin/bookings`, `/admin/disputes` (+ take/resolve), `/admin/audit-log` | admin |

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
