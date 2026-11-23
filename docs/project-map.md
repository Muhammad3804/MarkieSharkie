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
| `pages/InvitationGuests.jsx` | `/bookings/:id/guests`: the host's event page (EUC-25/27): guests, send, links, replies vs hall capacity. | `api/invitations.js` |
| `pages/GuestInvitation.jsx` | `/i/:token`: the guest's own invitation and reply (EUC-26/27), no account. | `api/invitations.js` |
| `pages/owner/OwnerBookings.jsx` | `/owner/bookings`: the owner's booking inbox (EUC-15): confirm, decline with a reason. | `api/bookings.js` |
| `pages/owner/MyListings.jsx` | `/owner/listings`: the owner's listings with status, edit, withdraw edits, deactivate / reactivate. | `api/owner.js` |
| `pages/owner/ListingEditor.jsx` | `/owner/listings/:id/edit/:section`: edit a live venue with the wizard's steps; says what goes live and what needs approval. | `api/owner.js`, `features/host/steps/*` |
| `pages/admin/Reviews.jsx` | Admin review moderation (REQ-44): reported / hidden / all, hide, keep, restore, delete with a reason. | `api/admin.js` |
| `components/venue/GoogleReviewsLink.jsx`, `lib/googleMaps.js` | "Read reviews on Google" link-out (REQ-43, #37) and the shared Google Maps link rules. | `ReviewsSection` |
| `components/venue/ReportReviewDialog.jsx` | "Report this review" dialog on the venue page (REQ-44). | `api/reviews.js` |
| `pages/admin/Users.jsx` | Admin users (REQ-47, EUC-33): role tabs, status filter, search, `?user=` panel with activity and history, suspend / reactivate / change role / delete with a reason. | `api/admin.js` -> `server/src/modules/admin/usersService.js` |
| `pages/admin/VenueEdits.jsx`, `VenueEditReview.jsx` | Admin "Live venue edits": list and old-versus-new review with approve / reject (REQ-5). | `api/admin.js` |
| `pages/Profile.jsx` | `/me` profile (EUC-03): edit details per role, past searches, my bookings; admins read-only. | `api/profile.js`, `features/profile/rules.js` |
| `pages/VenuePhotos.jsx` | Full photo gallery per hall, opens the lightbox. | `useVenue`, `Lightbox` |
| `features/venues/walkthrough/Walkthrough.jsx`, `WalkthroughViewer.jsx` | Uploaded walkthrough viewer (REQ-11): WebGL + file checks, then the lazy .glb viewer or 360° panorama viewer. | `HallCard`, admin `ApprovalReview` |
| `features/venues/HallModel3D.jsx` | 3D room built from a hall's length × width × ceiling, with stage/entrance/tables (Three.js). Lazy-loaded. | `HallCard`, wizard walkthrough step |
| `features/venues/mockVenues.js` | Not read at runtime any more; `npm run seed` turns it into database rows | (done) |
| `api/venues.js` | **Real:** `GET /api/venues/landing`, `/api/venues`, `/api/venues/:id`, `/api/stats` | (done 2026-11-22) |
| `api/chat.js` → `sendMessage` | Returns nothing | `POST /api/chat` (RAG over pgvector) |
| `api/host.js` | **Real:** draft autosave `PUT /api/owner/draft` (localStorage is only the instant local copy), submit = uploads + `POST`/`PUT /api/owner/venues`, live status | (done 2026-11-22) |
| `api/listings.js` | Now only converts a server listing into the wizard draft (admin review, edit and resubmit) | (done) |
| `api/admin.js` | **Real:** approvals, review, decisions, live / suspended venues, flagged photos, KPIs, venue / photo / user audit log, users (REQ-47). **Still mock** in localStorage `markiesharkie:admin`: disputes, listing reports | disputes and reports modules (Part D) |
| `features/host/photoStore.js` | Files stay in **IndexedDB** `markiesharkie-host` until submit, which uploads them | (done; the files live on the server after submit) |
| `features/wishlist/wishlist.js` | **localStorage** `markiesharkie:wishlist` | Customer wishlist API (not in the SRS, decide if we keep it) |
| `api/bookings.js` | **Real (2026-11-22):** availability, holds, bookings, cancel, owner inbox / confirm / reject on `/api` (Socket.io `slot:updated` still to do; the calendar polls) | (done) |
| `features/booking/draft.js` | Booking draft (unsent form) in **localStorage** `markiesharkie:booking-drafts`, a reference to the server hold per tab in **sessionStorage** | (by design; the hold itself is on the server) |
| `api/invitations.js` | **Real (2026-11-23):** invitation, guests, sending, links, replies on `/api` | (done) |
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
