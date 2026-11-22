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
- [ ] Profile page per role (API done 2026-11-21: `GET/PATCH /api/me`, `/api/me/searches`, `/api/me/bookings`; the client page is not built)

## Phase 2: Venues (REQ-5 to REQ-11, EUC-04 to 08)
- [ ] Owner venue CRUD, approval workflow, admin approve/reject with reason
- [ ] Image upload + AI detection adapter (fake first) + flagged queue
- [ ] Menus, menu items, add-ons
- [ ] Walkthrough upload + viewer, stage photos

## Phase 3: Search and discovery (REQ-12 to REQ-15, EUC-09 to 12)
- [ ] Search with filters + free-on-date + ranking + history
- [ ] Venue page, compare page
- [ ] Embeddings pipeline + recommendations

## Phase 4: Booking engine (REQ-16 to REQ-23, EUC-13 to 17)  ← most important
- [ ] Slots CRUD, block/unblock
- [ ] Hold / release / expire job, Socket.io live calendar
- [ ] Book, owner accept/confirm/reject, cancel, offline booking
- [ ] Concurrency tests from `docs/booking-engine.md`

## Phase 5: Quotations, payments, add-ons (REQ-24 to 26, 34, 35, EUC-18, 19, 24)
- [ ] Quotation rounds + expiry job
- [ ] Payment recording + balance
- [ ] Add-ons and menu on a booking, totals

## Phase 6: Notifications and reviews (REQ-42 to 45, EUC-29 to 31)
- [ ] Notifications table + socket push + bell UI
- [ ] Reviews, avg rating, Google reviews adapter, flagging

## Phase 7: AI chatbot (REQ-27, 28, EUC-20)
- [ ] LLM adapter, filter extraction, retrieval, grounded answer, history, fallback

## Phase 8: Invitations and event day (REQ-36 to 41, EUC-25 to 28)
- [ ] Invitation + card + share link, guest page (offline-capable), RSVP
- [ ] WhatsApp adapter + webhook (delivery status + button replies)
- [ ] QR codes, attendants, scanner page, attendance count

## Phase 9: Decor (REQ-29 to 33, EUC-21 to 23)
- [ ] Decorator profile/packages, decor requests + quotes + decor booking
- [ ] AI decor preview (stretch)

## Phase 10: Weather and admin (REQ-46 to 48, EUC-32 to 35)
- [ ] Weather adapter + job + advisory banner
- [ ] Admin users, moderation, disputes, audit log, bookings oversight

## Phase 11: Polish and release
- [ ] Playwright e2e for: register → search → hold → book → owner confirm → payment → invitation → RSVP → check-in → review
- [ ] Lighthouse (PWA, performance < 3 s), Safari check, accessibility pass
- [ ] Deploy frontend + backend + DB, daily backups on
- [ ] OpenAPI doc complete
