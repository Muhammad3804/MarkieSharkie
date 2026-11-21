# Project map

A walkthrough of the MarkieSharkie repo as of 2026-11-17: what's where, what works, what's fake, and what to build
next. Written for teammates. For rules and decisions, read `CLAUDE.md` and `docs/progress.md`; this file is the "you are
here" map.

**The short version:** the public website (home, explore, venue page, about, become a host) is built and looks real, but
it all runs on mock data in the browser. **Update 2026-11-21:** `server/` now exists with the Phase 0 skeleton and the
Phase 1 auth + profile API (register, login, refresh, logout, `/me`), and the schema runs in Docker Postgres through
migration 001. The client is not wired to the API yet, so the site still uses its browser mocks (including login).

---

## 1. Folder map

```
MarkieSharkie/
├── CLAUDE.md                 Rules for the project (stack, conventions, non-negotiables). Read this first.
├── README.md                 Same intro as CLAUDE.md, for GitHub.
├── .env.example              Every environment variable the server and client will need (no real values).
├── .gitignore                Ignores .env, node_modules/, coverage/ and .playwright-cli/.
├── docker-compose.yml        Local Postgres 16 + pgvector + PostGIS (service `db`, image built from db/docker/).
├── .mcp.json                 Connects Claude Code to Figma (the design file).
│
├── docs/                     Project knowledge. Source of truth after the SRS.
│   ├── srs/SRS.pdf           The graded SRS document.
│   ├── srs/diagrams/         21 diagrams from the SRS (ERD, class, DFDs, sequence, deployment...).
│   ├── requirements.md       REQ-1..48, NFR-1..8, use cases, in short form.
│   ├── srs-alignment.md      Where the SRS text and its diagrams disagree, and what we decided.
│   ├── architecture.md       Planned folder layout, services, how AI/RAG/images flow.
│   ├── database.md           Tables, enums, constraints explained.
│   ├── booking-engine.md     Slots, holds, booking states, the no-double-booking design. Most important doc.
│   ├── api-and-security.md   Planned REST routes, auth, RBAC, validation, upload limits.
│   ├── ui-and-dashboards.md  What each page/dashboard should contain.
│   ├── build-plan.md         The phase-by-phase plan with checkboxes.
│   ├── progress.md           Running log: current state, decisions, changelog, TODO.
│   └── project-map.md        This file.
│
├── db/
│   ├── docker/               Dockerfile + first-start init (creates markie_app, both DBs, the 5 extensions).
│   └── schema.sql            The whole database (40 tables) from the ERD + SRS additions. Applied as migration 001.
│
├── server/                   Express + pg API (see architecture.md). So far: config, db, middleware, modules/auth,
│                             modules/users, migrations/, scripts/, tests/, openapi.yaml. No Socket.io yet.
│
├── client/                   The React website (Vite + Tailwind 4 + React Router 7).
│   ├── index.html            Page shell, Google Fonts (Inter, DM Sans, Arimo).
│   ├── vite.config.js        Vite + React + Tailwind plugins. No PWA plugin yet.
│   ├── package.json          Deps: react 19, react-router-dom 7, motion, leaflet, zod, three, @react-three/fiber.
│   ├── public/               favicon only (no PWA manifest yet).
│   ├── dist/                 Build output (git-ignored).
│   └── src/
│       ├── main.jsx          Starts React and the router.
│       ├── index.css         Theme: maroon colour tokens, fonts, shadows, a few shared CSS utilities.
│       ├── app/              Router, layouts and small route helpers.
│       ├── pages/            One file per page (Landing, Explore, VenueDetail, HostWizard...).
│       ├── components/       Reusable UI: layout (header/footer), ui (Button, Logo), venue (venue page pieces).
│       ├── features/         Code grouped by feature: venues, explore, host, chatbot, wishlist, about, search.
│       ├── api/              The only place pages get data from. Today: mock/localStorage. Later: real fetch calls.
│       ├── lib/              Small helpers: money (integer paisa), dates/times, booking constants.
│       └── assets/           WebP photos (venues, gallery, floor plans), icons, logo.
│
├── .claude/                  Claude Code setup (not app code).
│   ├── agents/               Reviewer agents: react, typescript, security, database, RAG pipeline, silent failures.
│   └── skills/               Skills: ui-ux-pro-max, playwright-cli, web-design-guidelines, postgres, migrations...
│
└── .playwright-cli/          Screenshots and test scripts from browser testing (git-ignored).
```

---

## 2. File guide (by feature)

Arrows show what a file talks to. Everything under `client/src/` unless the path says otherwise.

### App shell and routing

| File | What it does | Connects to |
|---|---|---|
| `app/router.jsx` | List of every URL and which page it shows. Public pages sit inside `PublicLayout`; the host wizard has its own full-screen layout. | all pages, `VenueDetailRoute.jsx` |
| `app/VenueDetailRoute.jsx` | Lazy-loads the bigger pages (splits them into separate JS files) and shows a loading skeleton meanwhile. Despite the name it wraps Explore, About and the host pages too. | pages |
| `app/layouts/PublicLayout.jsx` | Header + page + footer + the Ask AI chat bubble, and scroll restoration. | `SiteHeader`, `SiteFooter`, `ChatWidget` |
| `app/SearchRedirect.jsx` | Old `/search` URL → `/explore`, keeping the query. | router |
| `app/HostResumeRedirect.jsx` | `/host/new` → the step the host's draft stopped at. | `api/host.js` |
| `components/layout/SiteHeader.jsx`, `SiteFooter.jsx` | Sticky top nav (Home, Explore, Become a host, About) with mobile menu; footer links. | router links |
| `components/ui/Button.jsx`, `Logo.jsx` | Pill button (renders a link when given `to`); logo cropped from one PNG. | used everywhere |
| `index.css` | Colour tokens (`primary` maroon, `ink`, `line`, `danger`...), fonts, shadows, map pin styles. | Tailwind classes everywhere |

### Venues: browse and view (REQ-12, 13)

| File | What it does | Connects to |
|---|---|---|
| `pages/Landing.jsx` | Home page: search bar + rows of venue cards (Featured, Popular in Lahore...). | `useLandingSections`, `VenueRow`, `SearchBar` |
| `pages/Explore.jsx` | Search results: filters, sort, pagination, optional map. All filter state lives in the URL. | `useVenueSearch`, `features/explore/*` |
| `features/explore/filters.js` | Turns the URL query into a filters object and back; option lists for each filter. | Explore, `api/venues.js` |
| `features/explore/useVenueSearch.js` | Hook: runs `searchVenues(filters)`, tracks loading/error. | `api/venues.js` |
| `features/explore/FiltersPanel.jsx`, `FilterSheet.jsx`, `Pagination.jsx` | Sidebar filters (desktop), bottom-sheet filters (mobile), page numbers. | Explore |
| `features/explore/VenueMap.jsx` | Leaflet + OpenStreetMap map with price pins. | Explore |
| `features/search/SearchBar.jsx` | The city/date/guests search bar; submits to `/explore`. | Landing, Explore |
| `features/venues/VenueCard.jsx`, `VenueRow.jsx` | A venue card (photo, rating, price, heart) and a horizontal row of them. | Landing, Explore |
| `pages/VenueDetail.jsx` | Venue page with 5 tabs: Overview, Halls, Menu, Availability, Reviews, plus the booking panel. | `useVenue`, `components/venue/*` |
| `features/venues/useVenue.js` | Hook: loads one venue by id (loading / not-found / error). | `api/venues.js` |
| `components/venue/*` | Pieces of the venue page: `Gallery` (hero photos), `HallCard` (size, floor plan, zones, "View in 3D"), `MenuCard` (dishes by section), `AvailabilityCalendar`, `BookingSidebar` (date/time/hall/guests/menu + live total), `ReviewsSection`, `LocationSection` (Google Maps embed), `Lightbox` (full-screen photos)... | `VenueDetail` |
| `pages/VenuePhotos.jsx` | Full photo gallery per hall, opens the lightbox. | `useVenue`, `Lightbox` |
| `features/venues/HallModel3D.jsx` | 3D room built from a hall's length × width × ceiling, with stage/entrance/tables (Three.js). Lazy-loaded. | `HallCard`, wizard walkthrough step |
| `features/venues/mockVenues.js` | **Fake data**: 48 venues for the landing rows, and full venue details generated from each id (halls, menus, reviews, booked dates, photos). | only `api/venues.js` |
| `features/venues/constants.js` | Labels shared by UI and mock data (tabs, amenities, gallery sections, event names). | venue page, mock |
| `api/venues.js` | `getVenueById`, `getLandingSections`, `searchVenues`, `getPlatformStats`. Today they read `mockVenues.js`; later they become `fetch('/api/venues...')`. | hooks above |

### Host wizard: "Become a host" (REQ-5, 6, 8, 11)

| File | What it does | Connects to |
|---|---|---|
| `pages/HostIntro.jsx` | `/host`: explains the 3 phases, "Let's get started", or a "Continue your listing" card if a draft exists. | `api/host.js` |
| `pages/HostWizard.jsx` | `/host/new/:step`: the wizard shell (header, Questions drawer, progress bar, Back/Next, step animation, validation, submit). Blocks skipping ahead past an unfinished step. | `features/host/*` |
| `pages/HostSubmitted.jsx` | "Our team will verify your listing", status **Pending verification**. | `api/host.js` |
| `features/host/steps.js` | The 21 screens in order, which phase each belongs to, and help tips for each. | wizard |
| `features/host/steps/*.jsx` | The screens: `AboutSteps` (type, name, address, map pin, directions, halls, bridal suite, events), `StandOutSteps` (amenities, title), `PhotosStep`, `HallMediaSteps` (floor plan + zones, 3D walkthrough), `PackageSteps` (menus with sections, add-ons, booking rules + custom cancellation, house rules), `ReviewStep`. | `fields.jsx`, `useWizard` |
| `features/host/draft.js` | Shape of the draft (mirrors the DB tables), helpers, old-draft migration, and `toListingPayload()` = what will be POSTed to the server. | wizard, `api/host.js` |
| `features/host/schema.js` | All validation rules, one per step (Zod + a few cross-field checks). | wizard |
| `features/host/draftStore.js` | Keeps the draft in memory and autosaves it on every change. | `api/host.js` |
| `features/host/photoStore.js` | Stores uploaded photos/plans/3D files in the browser's IndexedDB so a refresh doesn't lose them. | photo, layout, walkthrough steps |
| `features/host/fields.jsx`, `fieldStyles.js`, `options.js`, `icons.jsx`, `HelpDrawer.jsx` | Form controls with labels and errors, option lists (cities, amenities, sections...), icons, Questions drawer. | steps |
| `api/host.js` | `loadDraft`, `saveDraft`, `clearDraft` (localStorage) and `submitListing` (fake, waits 700 ms). | wizard |

### Booking (REQ-16 to 23, 34, 35)

| File | What it does | Connects to |
|---|---|---|
| `components/venue/BookingSidebar.jsx` | Date (picker popover), slot, hall, guests, menu → live total (integer paisa). "Check availability" checks the hall slot, holds it and opens the booking flow, or suggests other dates / halls. | `api/bookings.js`, `features/booking/` |
| `components/venue/AvailabilityCalendar.jsx` | Live two-month calendar (per-slot dots, legend, per-hall day panel), built on `CalendarMonth.jsx` (ARIA grid). | `VenueDetail` |
| `pages/BookingFlow.jsx` + `features/booking/` | Booking flow `/venues/:id/book/:step`: hold timer, 5 steps, confirmation; draft, pricing, hold helpers. | `api/bookings.js` |
| `pages/MyBookings.jsx` | `/bookings`: status badges, cancel with refund preview, dev-only owner actions. | `api/bookings.js` |
| `pages/InvitationBuilder.jsx`, `pages/GuestInvitation.jsx` + `features/invitations/` | QR invitation builder `/bookings/:id/invite/:step` (4 card designs, live preview, QR + share) and the public guest page `/invite/:id` with RSVP. `InvitationCard` draws all 4 designs. | `api/invitations.js` |
| `lib/booking.js` | `SLOT_HOLD_MINUTES = 10`, `MIN_GUESTS = 25`, guest-count check, slot presets. | sidebar |
| `lib/money.js`, `lib/format.js` | Money as integer paisa (`Rs. 187,750`), dates/times in Pakistan time. | everywhere |
| `db/schema.sql` (`time_slots`, `bookings`, ...) | The real double-booking protection lives here (exclusion constraint + one active booking per slot). | future server |

### Chatbot (REQ-27, 28)

| File | What it does | Connects to |
|---|---|---|
| `features/chatbot/ChatWidget.jsx` | Holds chat state; floating "Ask AI" button that morphs into the panel. Small icon on detail pages. | `AskAiButton`, `ChatPanel`, `api/chat.js` |
| `features/chatbot/ChatPanel.jsx`, `AskAiButton.jsx`, `morph.js` | The panel UI (messages with times), the launcher, and animation timings. | ChatWidget |
| `api/chat.js` | `sendMessage()`: **stub, returns nothing**. No assistant replies yet. | ChatWidget |

### Other features

| File | What it does | Connects to |
|---|---|---|
| `features/wishlist/wishlist.js`, `WishlistButton.jsx` | Heart button on cards; saved venues in localStorage, synced across tabs. | VenueCard |
| `pages/About.jsx` + `features/about/*` | About page: mission, live stats, how it works, features, team (placeholders), FAQ. | `getPlatformStats` |

### Auth, payments, quotations, admin, decor, invitations, notifications, reviews (writing), weather

**No code yet.** Only the database tables exist in `db/schema.sql` and the plans in `docs/`. The header's account and
language buttons don't do anything.

### Backend (planned, not built)

`docs/architecture.md` plans `server/src/` with `config/`, `db/` (pool + `withTransaction`), `middleware/` (auth,
requireRole, validate, errorHandler), `realtime/` (Socket.io), `jobs/` (hold expiry etc.), `integrations/` (LLM,
WhatsApp, weather...), and `modules/<feature>/` each with routes → controller → service → repository (SQL).
None of these files exist yet.

---

## 3. Progress check

**How to read it:** **Done** = works for real. **Partial** = UI built but on mock data / UI only, or schema only partly
covers it. **Not started** = nothing. For the **Database** column, "Done*" means the tables are written in
`db/schema.sql` and created by migration 001 in the Docker Postgres, but no feature code uses them yet (no seed).
"—" = not needed. Rows 0-2 were updated on 2026-11-21; the other rows and the scores below are still as of 2026-11-17.

| # | Feature (REQ) | Frontend | Backend | Database |
|---|---|---|---|---|
| 0 | Project setup (Phase 0) | Partial: Vite, React, Tailwind, router, tokens; no PWA, no role layouts, no TanStack Query/Socket.io | Done for Phase 0: Express skeleton, env validation, pool, `withTransaction`, errors, health, hardening, Vitest + Supertest | Done: Docker Postgres, migration 001 applied; no seed |
| 1 | Register / login / lockout / profile (REQ-1, 2, 4) | Partial (login modal on the mock `api/auth.js`: email or mobile + password, signup, 15-min lockout, reset by code, dummy Google / Apple; no roles at signup, no inactivity timeout, no profile; srs-alignment #22) | Done except OTP reset: register (all 3 roles), login by email/phone, lockout, refresh + 30-min inactivity, logout, `GET/PATCH /me`, searches, bookings | Done* |
| 2 | Roles and permissions (REQ-3) | Not started (`RequireAuth` guards logged-in routes; no roles, so no `RequireRole` yet) | Partial: `authenticate` + `requireRole`, suspended/deleted blocked on every request; ownership checks come with later modules | Done* |
| 3 | Owner creates a venue listing (REQ-5) | Partial: full 21-screen wizard, autosave, validation; submit is fake | Not started | Partial: many wizard fields have no columns yet (hall size, zones, house rules...) |
| 4 | Menus, packages, add-ons (REQ-6) | Partial: in the wizard; venue page shows menus, not add-ons | Not started | Done* |
| 5 | Admin approves/rejects venues (REQ-7) | Partial: `/admin` approvals + review page on mock stores | Not started | Done* |
| 6 | Photo upload + AI fake-image check (REQ-8, 9, 10) | Partial: upload UI with JPEG/PNG + 5 MB checks; nothing uploaded, no check, no admin queue | Not started | Done* |
| 7 | 3D / 360° walkthrough (REQ-11) | Partial: generated 3D room works; upload picker but no .glb/360° viewer | Not started | Done* (`walkthrough_assets`; no hall link) |
| 8 | Search with filters, free on date (REQ-12) | Partial: full Explore page on mock data; search history not saved | Not started | Done* |
| 9 | Venue page (REQ-13) | Partial: complete UI on mock data; no add-ons, no Google reviews | Not started | Done* |
| 10 | Compare venues (REQ-14) | Not started | Not started | — |
| 11 | Recommendations (REQ-15) | Partial: "Popular/Highly rated" rows are mock, not personalised | Not started | Done* (embedding columns) |
| 12 | Live calendar, slot hold, booking, no double booking (REQ-16 to 21) | Partial: live per-hall calendar, 10-min hold with timer, booking flow and statuses on a localStorage mock (cross-tab) | Not started | Done* (per venue; per-hall slots need `time_slots.hall_id`, srs-alignment #19) |
| 13 | Cancel booking, offline booking (REQ-22, 23) | Partial: customer cancel with reason on `/bookings`; offline booking not started | Not started | Done* |
| 14 | Quotations (REQ-24) | Not started | Not started | Done* |
| 15 | Payment tracking (REQ-25, 26) | Not started | Not started | Done* |
| 16 | Add-ons + menu on a booking, totals (REQ-34, 35) | Partial: add-ons step, menu × guests (min guests) + hall + add-ons in paisa | Not started | Done* |
| 17 | AI chatbot with RAG (REQ-27, 28) | Partial: chat UI only, no replies | Not started | Done* |
| 18 | Decorators + AI decor previews (REQ-29 to 33) | Not started | Not started | Done* |
| 19 | Invitations, WhatsApp RSVP, QR check-in (REQ-36 to 41) | Partial: invitation builder + QR + guest page + yes/no RSVP with party size + host summary (mock); no WhatsApp sending, no check-in QR | Not started | Done* |
| 20 | Reviews (REQ-42 to 44) | Partial: reviews display on mock data; can't write one | Not started | Done* |
| 21 | Notifications (REQ-45) | Not started | Not started | Done* |
| 22 | Weather advisory (REQ-46) | Not started | Not started | Done* |
| 23 | Admin: users, disputes, monitoring (REQ-47, 48) | Partial: `/admin` users, disputes, reports, audit log on mock data | Not started | Done* |
| 24 | Role dashboards `/app`, `/owner`, `/decorator`, `/admin` | Not started | — | — |

**Overall (Done = 1, Partial = ½, Not started = 0, over the 25 rows):**

| | Score | What it means |
|---|---|---|
| **Frontend** | **≈ 24%** (12 Partial, 0 Done) | The public, customer-facing pages and the host wizard are built. Everything behind a login (dashboards, booking, payments, admin) isn't. Nothing is "Done" because nothing talks to a real server yet. |
| **Backend** | Phase 0 + Phase 1 auth/profile API (2026-11-21) | Skeleton, auth, RBAC middleware and profile routes with tests; no venue, booking or other modules yet. |
| **Database** | Running (2026-11-21) | All 40 tables created by migration 001 in Docker Postgres; only the auth/profile tables are used so far. |

Against `docs/build-plan.md` (2026-11-21): Phase 0 Docker + migration and the Express skeleton are ticked; the client
PWA setup and the seed script are still open. Phase 1 server work is done apart from OTP reset and ownership helpers.

Extras we built that aren't in the SRS: About page, wishlist hearts, Explore map, photo lightbox.

---

## 4. What's mocked (needs a real API later)

| Where | What's fake | Real replacement (planned) |
|---|---|---|
| `features/venues/mockVenues.js` | All 48 venues, halls, menus, photos, reviews, ratings, booked dates, host info | Database + seed script |
| `api/venues.js` → `getVenueById` | Reads the mock | `GET /api/venues/:id` |
| `api/venues.js` → `getLandingSections` | Mock rows | `GET /api/venues/landing` (later: recommendations, REQ-15) |
| `api/venues.js` → `searchVenues` | Filters/sorts the mock in the browser | `GET /api/venues?<filters>` (+ save search history) |
| `api/venues.js` → `getPlatformStats` | Counts from the mock | `GET /api/stats` |
| `api/chat.js` → `sendMessage` | Returns nothing | `POST /api/chat` (RAG over pgvector) |
| `api/host.js` → `loadDraft`/`saveDraft`/`clearDraft` | **localStorage** `markiesharkie:host-draft` | `GET/PUT /api/owner/venue-drafts/current` |
| `api/host.js` → `submitListing` | Copies the files to **IndexedDB** `markiesharkie-listings` and creates a `pending` listing in `api/listings.js` | `POST /api/owner/venues` then image/walkthrough uploads |
| `api/listings.js` | Listings + approval status + venue suspensions in **localStorage** `markiesharkie:listings` (8 seeded) | `venues` rows via `/api/owner/venues` and `/api/admin/venues/*` |
| `api/admin.js` | Users, disputes, listing reports, flagged images, AI scores, audit log, KPIs in **localStorage** `markiesharkie:admin` | `/api/admin/*` (docs/api-and-security.md) |
| `features/host/photoStore.js` | Photos, floor plans, 3D files kept in **IndexedDB** `markiesharkie-host` | File upload API + storage bucket + AI image check |
| `features/wishlist/wishlist.js` | **localStorage** `markiesharkie:wishlist` | Customer wishlist API (not in the SRS, decide if we keep it) |
| `api/bookings.js` | Slots (per hall), holds, booking requests, cancels and owner decisions in **localStorage** `markiesharkie:bookings`; seeded booked slots from `bookedDates`; demo customer; `navigator.locks` instead of `FOR UPDATE` | `/api/venues/:id/slots`, `/api/venues/:id/slots/:slotId/hold`, `/api/bookings`, owner booking endpoints + Socket.io `slot:updated` |
| `features/booking/draft.js` | Booking draft in **localStorage** `markiesharkie:booking-drafts`, hold ref per tab in **sessionStorage** | Client-only draft is fine; the hold comes from the API |
| `pages/MyBookings.jsx` | "Owner (dev only)" accept / reject / record advance buttons | Owner dashboard (`/owner`) |
| `api/invitations.js` | Invitations, self-registered guests and RSVPs in **localStorage** `markiesharkie:invitations`; card carried in the link's `#c=` hash; demo customer | `POST /bookings/:id/invitation`, `GET /invitations/:id/rsvp-summary`, `GET /i/:token`, `POST /i/:token/rsvp` |
| `components/venue/BookingSidebar.jsx` | "Report this listing" goes to the admin mock store | Report endpoint |
| `components/venue/ReviewsSection.jsx` | Mock reviews and the 6 rating categories (categories aren't in the ERD) | Reviews API + Google reviews adapter |
| `lib/booking.js` | `SLOT_PRESETS` (Lunch/Evening) hard-coded | Real `time_slots` per venue |
| `features/about/content.js` | Team names/roles/photos are placeholders | Real team info (no API needed) |
| `components/venue/LocationSection.jsx` | Google Maps embed from mock lat/lng | Real venue location from the API |

---

## 5. Next up (in order)

1. ✅ **Done 2026-11-21 except the seed script.** **Get the backend skeleton and a real database running (Phase 0).** Docker Postgres with pgvector + PostGIS,
   turn `db/schema.sql` into the first migration and *actually run it* (it has never been tested), Express app with the
   pg pool, `withTransaction`, error handler and a health route, Vitest + Supertest, and a seed script. Tip: reuse
   `mockVenues.js` to generate the seed, so the site looks the same once it's on real data.
2. ✅ **Server side done 2026-11-21 (except OTP reset and ownership helpers); client side still to do.** **Auth and roles (Phase 1, REQ-1 to 3).** Register/login with JWT + refresh tokens, lockout, `requireRole` +
   ownership checks on the server; login/register pages, an auth store and a `RequireRole` guard on the client (the
   host wizard is waiting for this). Everything else depends on knowing who the user is.
3. **Venues API, and swap the mocks (Phase 2 + 3).** `GET /venues/:id`, search and landing endpoints so
   `api/venues.js` stops reading the mock; `POST /owner/venues` from the wizard payload; image upload with a fake AI
   checker; admin approve/reject with a reason. Before this, **decide which UI-only wizard fields get real columns**
   (hall size, zones, house rules... listed in `progress.md` TODO).
4. **Booking engine (Phase 4), the most important feature for the panel.** Slots, 10-minute hold with
   `SELECT ... FOR UPDATE`, expiry job, Socket.io live calendar, book / accept / confirm / cancel, offline bookings and
   the concurrency tests from `docs/booking-engine.md`. Then wire up `BookingSidebar` and `AvailabilityCalendar`.
   **Decide first** whether halls get their own slots (open question in `progress.md`).
5. **Owner and admin dashboards.** `/owner` (my venues with approval status, booking requests to accept/confirm,
   calendar blocking) and `/admin` (pending venues, flagged images). Without these the listing → approval → booking loop
   can't be demoed end to end. After that: quotations and payments (Phase 5), then the RAG chatbot (Phase 7).

---

## Heads-up

- ~~`.env` isn't git-ignored.~~ Fixed: the root `.gitignore` now lists `.env`, `node_modules/` and `coverage/`.
- `.env.example` ships `JWT_ACCESS_SECRET=change-me`; the server refuses to start until it is replaced with 32+ random
  characters (see CLAUDE.md "Commands").
- `client/README.md` is still the default Vite template text.
- `HallModel3D` adds ~950 KB (Three.js), loaded only when someone opens a 3D view.
- `VenueDetailRoute.jsx` holds the lazy wrappers for most pages, not just the venue page. Renaming it (e.g.
  `lazyRoutes.jsx`) would make it easier to find.
