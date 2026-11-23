# Build plan

Build in this order. Each phase ends with working, tested features that can be demoed. Tick boxes as you go and keep this file current; it's how a fresh Claude Code session knows where the project is.

Protect the core differentiators first: booking engine (hold + no double booking + live calendar), RAG chatbot, 3D walkthrough, WhatsApp RSVP + QR check-in, trust (reviews + image verification). If time runs short, cut in this order: AI decor preview → decorator marketplace depth → Google reviews sync.

## Phase 0: Setup
- [ ] Monorepo layout from `docs/architecture.md`, ESLint + Prettier, `.env.example`, `.gitignore` (server side done 2026-11-21: `server/` layout, ESLint + Prettier, env vars, `.gitignore`; the client still uses oxlint and there is no root workspace)
- [x] Postgres with pgvector + PostGIS locally (Docker compose), first migration = `db/schema.sql`
- [x] Express skeleton: config validation, pg pool, `withTransaction`, error handler, health route, Vitest + Supertest against a test DB
- [ ] Vite + React + Tailwind + PWA plugin, router with role layouts, design tokens
- [x] Seed script: demo user per role, ~20 venues, slots for 60 days (`npm run seed`, 2026-11-22: 25 venues from the mock catalogue, per-hall slots, past reviews)

## Phase 1: Auth and users (REQ-1 to REQ-4, EUC-01 to 03)
- [ ] Register (role-specific fields), login (email or phone), lockout, refresh/logout, inactivity timeout, OTP reset (API done 2026-11-21 for all but OTP reset)
- [ ] RBAC middleware + ownership helpers, suspended-user block (`authenticate`, `requireRole` and the suspended/deleted block done 2026-11-21; ownership helpers come with the venue/booking modules)
- [x] Profile page per role (API 2026-11-21; client `/me` 2026-11-22. Change password while logged in still missing)

## Phase 2: Venues (REQ-5 to REQ-11, EUC-04 to 08)
- [x] Owner submit / resubmit, drafts, approval workflow (approve, reject with reason, request changes, suspend,
      bulk approve), audit log, admin stats (2026-11-22, branch `feat/server-venues`). Editing a live venue with
      admin-approved revisions and deactivate / reactivate (REQ-5, 2026-11-22, migration 006)
- [x] Image upload (content-checked) + AI detection adapter (Sightengine, fake without keys) + flagged queue (REQ-9, 10)
- [x] Menus, menu items, add-ons (created with the listing; edited live with copy-on-write for booked ones, 2026-11-22)
- [x] Walkthrough upload (.glb / 360° JPEG) stored per hall, shown in the browser (.glb viewer, 360° viewer, 2026-11-22). Stage photos still to do
- [x] Public venue API: landing rows, search with the Explore filters, venue page, per-hall availability, stats

## Phase 3: Search and discovery (REQ-12 to REQ-15, EUC-09 to 12)
- [ ] Search with filters + free-on-date + ranking + history
- [ ] Venue page, compare page
- [ ] Embeddings pipeline + recommendations

## Phase 4: Booking engine (REQ-16 to REQ-23, EUC-13 to 17)  ← most important
- [ ] Slots CRUD, block/unblock
- [ ] Hold / release / expire job (done 2026-11-22), Socket.io live calendar (not yet: the calendar polls)
- [ ] Book, owner confirm/reject, cancel (done 2026-11-22, #38), offline booking
- [x] Concurrency tests from `docs/booking-engine.md` (`tests/bookings.test.js`)

## Phase 5: Quotations, payments, add-ons (REQ-24 to 26, 34, 35, EUC-18, 19, 24)
- [ ] Quotation rounds + expiry job
- [ ] Payment recording + balance
- [ ] Add-ons and menu on a booking, totals

## Phase 6: Notifications and reviews (REQ-42 to 45, EUC-29 to 31)
- [ ] Notifications table + socket push + bell UI
- [ ] Reviews, avg rating, flagging (reporting + admin moderation + rating recompute + `GET /venues/:id/reviews` + "Read reviews on Google" link-out done 2026-11-22; no Google Places adapter, srs-alignment #37; writing a review needs the booking engine)

## Phase 7: AI chatbot (REQ-27, 28, EUC-20)
- [ ] LLM adapter, filter extraction, retrieval, grounded answer, history, fallback

## Phase 8: Invitations and event day (REQ-36 to 41, EUC-25 to 28)
- [ ] Invitation + card + per-guest links + email + guest page + RSVP (done 2026-11-23, #39; offline-capable guest page still to do)
- [ ] WhatsApp adapter + webhook (delivery status + button replies)
- [ ] QR codes, attendants, scanner page, attendance count

## Phase 9: Decor (REQ-29 to 33, EUC-21 to 23)
- [ ] Decorator profile/packages, decor requests + quotes + decor booking
- [ ] AI decor preview (stretch)

## Phase 10: Weather and admin (REQ-46 to 48, EUC-32 to 35)
- [ ] Weather adapter + job + advisory banner
- [ ] Admin users, moderation, disputes, audit log, bookings oversight (review moderation, flagged images and the venue audit log done 2026-11-22)

## Phase 11: Polish and release
- [ ] Playwright e2e for: register → search → hold → book → owner confirm → payment → invitation → RSVP → check-in → review
- [ ] Lighthouse (PWA, performance < 3 s), Safari check, accessibility pass
- [ ] Deploy frontend + backend + DB, daily backups on
- [ ] OpenAPI doc complete
