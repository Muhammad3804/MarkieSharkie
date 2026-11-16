# Progress log

Read this at the start of every session. Update it at the end of every task (changelog entry, plus Current state,
Decisions and TODO if they changed) and commit it with the code.

Last updated: 2026-11-16

## Current state

### Stack (client only so far)

- Vite 8, React 19 (hoists `<title>`/`<meta>` from components), Tailwind CSS 4 (`@tailwindcss/vite`, CSS-first `@theme`)
- React Router 7 data router (`createBrowserRouter`), `motion` 14 (`motion/react`) for the chat morph
- Leaflet 1.9 + OpenStreetMap tiles (no API key) for the Explore map and the host pin, lazy-loaded
- Zod 4 in the client for the host wizard's per-step validation (same library the server will use)
- oxlint for linting. No test runner set up yet. playwright-cli used for manual browser checks
- No server, DB or PWA setup yet. All data is mock

### Routes (`client/src/app/router.jsx`, all under `PublicLayout`)

| Path | Page | Notes |
|---|---|---|
| `/` | `pages/Landing.jsx` | eager |
| `/explore` | `pages/Explore.jsx` | lazy via `app/VenueDetailRoute.jsx` (`ExploreRoute`); all state in the query string |
| `/search` | `app/SearchRedirect.jsx` | redirects to `/explore` with the same query |
| `/about` | `pages/About.jsx` | lazy via `app/VenueDetailRoute.jsx` (`AboutRoute`); `#how-it-works`, `#features`, `#team`, `#faq` anchors |
| `/venues/:id` | `pages/VenueDetail.jsx` | lazy via `app/VenueDetailRoute.jsx`; tabs via `?tab=halls\|menu\|availability\|reviews` |
| `/venues/:id/photos` | `pages/VenuePhotos.jsx` | lazy; `?hall=` and `#photoId` select hall/photo |
| `/host` | `pages/HostIntro.jsx` | lazy; "Become a host" landing, "Continue your listing" card when a draft exists |
| `/host/submitted` | `pages/HostSubmitted.jsx` | lazy; "Pending verification" success screen |

Outside `PublicLayout` (own full-screen shell, no header/footer/chat):

| Path | Page | Notes |
|---|---|---|
| `/host/new` | `app/HostResumeRedirect.jsx` | redirects to the draft's `lastStep` or `about` |
| `/host/new/:step` | `pages/HostWizard.jsx` | listing wizard; `TODO(auth)` venue_owner guard |

- Header nav links `/`, `/explore`, `/host` ("Become a host"), `/about`. Footer "List your space" and the About
  "List your venue" buttons also go to `/host`. `/owner` (dashboard) doesn't exist yet
- Footer has a "MarkieSharkie" column: About us, How it works (`/about#how-it-works`), FAQs (`/about#faq`). Below lg the
  footer is a grid (2 columns, 4 from sm); flex row from lg
- `PublicLayout`: `SiteHeader` (sticky, 116px), `<main class="@container">`, `SiteFooter`, `ChatWidget`, `<ScrollRestoration />` (default key)

### Key files

- `src/index.css`: theme tokens (maroon palette, fonts, shadows, glow keyframes), `page-container`, `page-inset-left`,
  `font-heading`, `scrollbar-none` utilities, `scroll-padding-top: 132px`, scroll lock while a modal `<dialog>` is open
- `src/lib/money.js`: `toPaisa`, `formatPaisa`, `formatAmount` (integer paisa, output like `Rs. 187,750`)
- `src/lib/format.js`: `formatTime` (h:mm AM/PM), `formatEventDate`, `timeAgo`, `formatPKR`
- `src/lib/booking.js`: `SLOT_HOLD_MINUTES = 10`, `MIN_GUESTS = 25`, `DEFAULT_GUESTS = '50'`, `guestCountError(value, hall)`, `SLOT_PRESETS` (Lunch / Evening)
- `src/api/venues.js`: `getVenueById(id)`, `getLandingSections()` and `searchVenues(filters)`, backed by `mockVenues.js`.
  `getPlatformStats()` (venue/hall/city counts, average rating) for About. Swap the bodies for `GET /api/venues/:id`,
  `GET /api/venues/landing`, `GET /api/venues?<query>` and `GET /api/stats` later. The only
  file that imports `mockVenues.js`
- `src/api/chat.js`: `sendMessage({ message, history })` stub, returns `null`
- `src/features/venues/mockVenues.js`: 48 landing cards (`landingSections`) and `getMockVenue(id)`, which builds full venue
  detail (halls, bridal suite, menus, reviews, rating counts, booked dates, lat/lng/address, gallery per hall)
- `src/features/venues/constants.js`: `VENUE_TABS`, `AMENITIES`, `EVENT_LABELS`, `GALLERY_SECTIONS`
- `src/features/venues/useVenue.js`: `{ status: loading|ready|not-found|error, venue, reload }`
- `src/features/venues/useLandingSections.js`: `{ status: loading|ready|error, sections, reload }`
- `src/features/venues/useCenteredSticky.js`: sets inline `top` on the sticky booking panel (lg+ only)
- `src/features/chatbot/`: `ChatWidget` (state + route-based `compact`), `AskAiButton`, `ChatPanel`, `morph.js` (timings)
- `src/features/explore/`: `filters.js` (URL params <-> filters, option lists, `PAGE_SIZE = 12`), `useVenueSearch`,
  `FiltersPanel`, `FilterSheet` (mobile `<dialog>` bottom sheet), `Pagination`, `VenueMap` (Leaflet)
- `src/features/about/`: `content.js` (customer/owner steps, features, team, FAQs; each line tagged with the REQ it
  describes), `icons.jsx` (inline Lucide-shape SVGs, `currentColor`), `usePlatformStats`
- `src/features/wishlist/`: `wishlist.js` (`useIsWishlisted`, `toggleWishlist`; localStorage `markiesharkie:wishlist`,
  synced across tabs), `WishlistButton`
- `src/features/search/SearchBar.jsx` (field `city`, prefill via `initial`, submits to `/explore` or `onSearch`), `src/features/venues/VenueCard.jsx`, `VenueRow.jsx` (landing)
- `src/components/ui/`: `Button` (primary/outline, `to` renders a Link), `Logo`
- `src/components/venue/`: `Gallery`, `SectionTabs`, `ListingSummary`, `HostRow`, `TrustDetails`, `AboutSection`,
  `AmenityList`, `AvailabilityCalendar`, `ReviewsSection`/`ReviewCard`/`StarRow`/`Avatar`, `LocationSection`,
  `EventNotes`, `HallCard`, `MenuCard`, `BookingSidebar`, `Lightbox`, `VenueDetailSkeleton`
- Assets: `src/assets/venues/` (landing WebP), `assets/gallery/` (29 WebP), `assets/venue-detail/`, `assets/icons/`, `assets/brand/`

### Landing page (`/`)

- Figma "fyp" frame 1:3. Navbar centered, sticky. Shared container `page-container` = `max-w-screen-2xl` + `px-4 md:px-6 lg:px-8`
- Centered search bar (UI only). Venue rows (Highly Rated, Popular in Islamabad / Lahore / Faisalabad) bleed to the right edge
  using `page-inset-left`
- Rows load via `useLandingSections` → `getLandingSections()`. Skeleton rows while loading, error + Try again on failure
- All photos WebP, lazy below the fold, explicit width/height
- Card price format: `Rs. 3,755` per guest

### Explore (`/explore`)

- No Figma frame; built from the landing tokens and `VenueCard` (`fluid` variant in a CSS auto-fill grid)
- URL params: `city` (`location` still accepted), `date`, `guests`, `eventType`, `priceMin`, `priceMax` (rupees per guest),
  `capacity` (`up-to-500|500-750|750-plus`), `rating` (`4.6|4.8|4.9`), `setting` (venue_type list), `amenities` (list),
  `catering=1`, `section` (landing row id, from "See All"), `sort` (`recommended|price-asc|price-desc|rating|capacity`),
  `page`, `map=1`. Invalid values are dropped
- Search: full bar from lg; below lg a one-line summary that opens it. Submitting pushes a history entry
- Filters: sidebar at lg+ (xl+ when the map is open), bottom sheet below that. Changes apply live with `replace`
  (no history per checkbox) and reset to page 1. Price commits on blur/Enter. Removable chips + "Clear all"
- Date filter hides venues booked that day (REQ-12 "only venues free on that date"); guests = capacity >= guests
- Sort: recommended = rating + log10(reviews)/4 (the no-history fallback for REQ-15). Price sorts use integer paisa
- Results: 12 per page, numbered pagination links, skeleton on first load, previous results dimmed while refetching,
  empty state with "Clear filters" / "Start a new search", error + Try again, sr-only status with the count
- Map (`map=1`): split view at lg+ (sticky), replaces the list below lg. Price pills for the current page;
  hovering/focusing a card highlights its pill; clicking a pill opens a popup linking to the venue. Wheel zoom only
  after clicking the map
- Wishlist hearts on every `VenueCard` (landing too). `VenueCard` is now an `<article>` with the link and the heart as
  siblings (a button can't sit inside a link)
- Mock data: the six headline amenities (incl. catering) now drop out for some venues (separate seed, so other
  mock details didn't change); `getAllMockVenues()` added

### About (`/about`)

- No Figma frame; built from the landing tokens. ui-ux-pro-max used for structure (Swiss grid, subtle motion,
  spacious density); its navy/Playfair palette was ignored in favour of the maroon theme
- Sections: hero (mission, Explore / List your venue CTAs, photo collage with a "Slot held for 10 minutes" chip),
  stats strip (`<dl>`, live from `getPlatformStats()`, skeleton while loading, hidden on error), how it works (customer 4
  steps, owner 3 steps, numbered `<ol>` with connectors), 4 key features, team (Shayaan, Sadaf, Muhammad; initial +
  "Photo coming soon" placeholder, role shown only when set), FAQ (7 native `<details>`), maroon "List your venue" band
- FAQ copy follows the SRS: payments tracked not processed, 10-min hold, one booking per slot, cancel before event
  date, guests need no account, admin + AI photo checks, decor separate from venue booking
- Lazy page, so About scrolls to `location.hash` itself after mounting (lands below the sticky header)
- Tested with playwright-cli at 375, 768, 1024 (footer) and 1512: no horizontal scroll, no targets under 24px, FAQ by
  keyboard, footer hash links from `/`, mobile menu link. Reviewed with web-design-guidelines

### Become a host wizard (`/host`, `/host/new/:step`)

- No Figma; Airbnb host onboarding as the UX reference (one question per screen, big type), maroon tokens, ui-ux-pro-max
  for UX rules. Frontend only: `api/host.js` has `loadDraft`/`saveDraft`/`clearDraft` (localStorage
  `markiesharkie:host-draft`) and `submitListing` (stub, 700 ms, returns `approvalStatus: 'pending'`)
- Steps (`features/host/steps.js`): `about` (intro) → `venue-type`, `name`, `location`, `pin`, `halls`, `events` →
  `stand-out` (intro) → `amenities`, `photos`, `title` → `finish` (intro) → `menus`, `custom`, `rules`, `review`
- Shell: logo, "Questions?" (native `<dialog>` drawer with per-step tips), "Save & exit" (to `/`), "Draft saved"
  indicator. Fixed bottom bar: 3-segment progress (one per phase, `role="progressbar"`), Back, Next. Next uses
  `aria-disabled` (not `disabled`) so pressing it shows every error and focuses the first invalid field. Enter = Next
  (form submit from inputs, window listener when focus isn't on a control). Step slide via `AnimatePresence`
  (direction-aware, crossfade only with reduced motion). Focus moves to the new step's `h1`
- URL guard: opening a later step while an earlier one is invalid redirects to the first invalid step
- Review: summary card per section with "Edit" → `/host/new/:step?from=review`; Next then reads "Back to review"
- Draft (`features/host/draft.js`) is shaped like the tables (`venue`, `halls`, `venueImages`, `menuPackages` with
  `items`, `addOns`) plus UI-only fields. `toListingPayload()` builds the submit body and derives `venue_type`,
  `capacity` (largest hall), `base_price` (cheapest package per head, integer paisa maths)
- State: `features/host/draftStore.js` (`useSyncExternalStore`), every edit saved immediately. Photo files in IndexedDB
  (`features/host/photoStore.js`, db `markiesharkie-host`), metadata in the draft, so refresh and resume keep photos
  (memory fallback if IndexedDB is blocked)
- Validation: `features/host/schema.js`, one Zod schema per step + plain cross-field checks (unique hall names, photo
  per hall + cover, lunch before dinner, menu min guests ≤ largest hall). Errors show on blur or after Next
- Photos: zones per hall (Main hall, Stage, Seating, Bridal room, Washrooms) + venue-wide (Entrance, Exterior,
  Parking, Lobby). Upload button or drag and drop, JPEG/PNG ≤ 5 MB (REQ-8), ≥ 5 total, ≥ 1 per hall, ≤ 60. Reorder
  by drag or ←/→ buttons, star = cover (first photo by default), remove with confirm
- Map pin: Leaflet draggable marker, click map to move, arrow keys on the focused pin, "Use my location" (rejects
  points outside Pakistan), optional Google Maps link (https maps.app.goo.gl / google.com/maps only)
- Tested with playwright-cli at 375×812 and 1512×900: full flow to submit, refresh mid-flow, Back, Save & exit +
  resume, URL skip guard, edit-from-review, photo upload/drop/reject/reorder/cover/remove + refresh, help drawer +
  Esc, reduced motion, no horizontal scroll on any step. `.playwright-cli/host-flow.js` replays the flow

### Ask AI chat

- Floating launcher (`AskAiButton`) morphs into the panel (`ChatPanel`) via a shared `layoutId` in one `LayoutGroup`
  (no `AnimatePresence`: it caused a crossfade instead of a morph)
- Timing: open 0.5s, close 0.4s tween, ease `[0.32, 0.72, 0, 1]`. Content fades in after 0.2s delay, fades out 0.15s
  before the close morph. Launcher label fades back in (0.2s, delay 0.25s)
- Glow pulse on the launcher until first opened. Esc / X close. Focus goes back to the launcher if it was in the panel
- `MotionConfig reducedMotion="user"`: no morph for reduced motion, fades only
- Messages show `h:mm AM/PM` timestamps. Consecutive user messages are grouped with 4px gaps
- Input sends to the `sendMessage` stub. No assistant replies yet
- Compact mode: on non-main pages (anything not `/`, `/explore`, `/owner`, `/about`) the launcher is a 64px icon circle at
  `right-4`. It expands left into the full pill on hover or keyboard focus (CSS, 250ms ease-out). Touch keeps the circle.
  `aria-label="Ask AI for help"`. Main pages keep the 200px pill at `lg:right-[89px]`

### Venue detail (`/venues/:id`)

- One generic page for all 48 venues (Figma frames 44:992, 65:692, 71:2, 73:2, 69:63)
- Loading skeleton, not-found and error (with retry) states. Per-venue `<title>` and meta description
- Hero gallery: hero image eager with `fetchPriority="high"`. Photos link to `/venues/:id/photos#photoId`
- 5 tabs (Overview, Halls, Menu, Availability, Reviews) in `?tab=`, switched with `preventScrollReset`
- "Select a date" in the panel scrolls to the calendar (switching to the Availability tab if needed)
- Booking panel (`BookingSidebar`):
  - Sticky at lg+ inside a full-height aside column. Vertically centered below the header when it fits, else pinned
    16px under the header. Releases at the end of the column (above the footer). No max-height, no internal scroll
  - Sized to fit 1280×720 (565px total incl. help card and report link)
  - Fields: Event date, Start time, Hall select, Guest count (number input), Menu select
  - Halls: 1–4 per venue, each with its own name and capacity. Guest range is 25 to the selected hall's capacity,
    default 50. Revalidates on hall change. Hint shows the range, e.g. "25 to 350 guests in Grand Ballroom"
  - Default package is Menu 1. Single live total near the button: guests × package price per head (integer paisa)
  - "Your slot is held for 10 minutes while you confirm", "Marketplace services included" (text-xs, under the button),
    "No payment is required to send an inquiry"
  - "Check availability" only explains that the booking service isn't connected yet
- Halls tab: halls plus a separate bridal suite card (not bookable)
- Location: static Google Maps embed (`maps?q=LAT,LNG&z=15&output=embed`, pointer-events off) with a link overlay that
  opens Google Maps in a new tab. Mock lat/lng/address per area in `mockVenues.js` (`AREA_COORDS`)

### Gallery (`/venues/:id/photos`)

- Figma frame 90:1063. Back button, hall tabs, sections per hall with alternating grids, lazy images
- Opens scrolled to `#photoId` from the hero gallery
- Lightbox (`Lightbox.jsx`, native `<dialog>` + `showModal()`, no library):
  - Prev/next buttons, ←/→ keys, swipe (pointer events), wraps around
  - Thumbnail strip, current highlighted and auto-scrolled into view, click to jump
  - Counter (`3 / 29`), close with X, Esc or backdrop click
  - Preloads neighbours, locks body scroll, focus stays inside, focus returns to the opened photo
  - Shows the current hall's photos

## Decisions (don't change without asking)

- SRS wins over Figma. Slot hold is 10 minutes (REQ-18), not Figma's "48 hours"
- Stack per CLAUDE.md: no Next.js, Supabase, ORM. Raw SQL via `pg` with `$1` params when the server is built
- Colours: Figma maroon palette in `index.css` `@theme` only (primary `#7a1731`). Chat meta text darkened to
  `#737373` for 4.5:1 contrast
- One container (`page-container`) for navbar, sections and footer
- Money: integer paisa in the client, never float math. Display `Rs. 187,750`. PKR only
- Data goes through `src/api/*`. Pages and hooks never import `mockVenues.js` directly
- DB `halls` table (`[Design]`, srs-alignment #17): `hall_id, venue_id, name, capacity, created_at`, nullable
  `bookings.hall_id` with composite FK to the same venue. Slots stay per venue (one active booking per venue slot)
- No migrations exist yet: schema changes before the first migration go into `db/schema.sql` only
- Photos: WebP only, lazy below the fold, width/height set
- Booking panel: no internal scroll, no price breakdown, one live total. Sticky behaviour is final
- Guests: min 25, default 50, max = selected hall capacity
- Chat: morph via shared `layoutId`, no `AnimatePresence`. Timings in `morph.js`
- Lightbox: native `<dialog>`, no library
- Maps: venue detail uses the Google embed + link only, no Maps JS API key in the client (NFR-4). Explore uses Leaflet +
  OSM tiles (no key)
- Explore state lives in the URL only; filter changes `replace`, search submit and pagination `push`
- Wishlist is localStorage until accounts exist
- Host wizard SRS alignment (asked 2026-11-16):
  - Venue type cards (Marquee, Banquet hall, Lawn, Farmhouse, Hotel ballroom, Rooftop) are a UI-only category.
    `venues.venue_type` (REQ-5) is derived from the per-hall Indoor / Outdoor / Semi-outdoor setting (mixed → semi_outdoor)
  - Add-ons are SRS types only: Sound system / DJ (`sound_system`), SMD screen (`smd`). No decor (decorators, REQ-30),
    no lighting
  - Photo category and hall stay in the draft only; no `venue_images` columns yet (proposed, see TODO)
  - Booking rules (days, lunch/dinner times, advance %, Flexible/Moderate/Strict policy) are UI-only. The policy is
    information only: it never blocks REQ-22 cancellations and nothing is refunded through the platform
  - "Accept custom menu requests" + per-package tick = `menu_packages.is_customizable`; the note is UI-only
- Host wizard photos: JPEG/PNG ≤ 5 MB per docs/api-and-security.md (not "any image type")
- User preferences:
  - Casual, concise replies, tables over prose
  - Commit or push only when asked
  - Never create a real `.env` (only `.env.example`)
  - Verify UI with playwright-cli at 375 and 1512 (plus other sizes when asked), then build
  - Run react-reviewer on bigger React changes

## Changelog (newest first)

- 2026-11-16: "Become a host" listing wizard, frontend only: `/host` intro with resume card, `/host/new/:step`
  wizard (3 phases, 16 screens), autosaved draft shaped like the schema, IndexedDB photo store, Zod step validation,
  Leaflet pin, photo zones per hall, menu templates, add-ons, booking rules, review with Edit links, "Pending
  verification" success screen. `api/host.js` stubs. Header/footer/About host links now go to `/host`. Added
  `danger`, `success`, `pending` colour tokens. Asked about 4 SRS conflicts first (see Decisions). Tested with
  playwright-cli at 375 and 1512; reviewed with react-reviewer (fixed: focus lost to
  `<body>` after removals/moves, Zod union hiding the standing-capacity message, cover lost when a hall is removed,
  missing photo files now block Next, pin arrow keys also panning the map, IndexedDB load race, re-announced errors,
  stray file drops navigating away) and web-design-guidelines (placeholder ellipses, scroll padding under the fixed
  bars, confirms before removing photos/packages). Not committed

- 2026-11-16: About page `/about` (hero + mission, stats strip, how it works for customers and owners, key features,
  team placeholders, FAQ accordion, List your venue CTA). `getPlatformStats()` mock. Footer "MarkieSharkie" column
  with About / How it works / FAQs links, footer grid below lg (fixes cramped 768 layout). Tested with playwright-cli
  at 375, 768, 1512; web-design-guidelines review (fixed malformed-hash crash, reduced-motion chevron). Not committed

- 2026-11-15: Explore page `/explore` (also the landing search target; `/search` redirects): prefilled search bar,
  URL-synced filters (sidebar / mobile bottom sheet), sort, paginated `VenueCard` grid with skeleton/empty/error,
  Leaflet split map with card-hover highlight, localStorage wishlist hearts, `searchVenues()` mock. Tested with
  playwright-cli at 375, 768 and 1512. Reviewed with react-reviewer and web-design-guidelines
- 2026-11-15: Landing rows now load through `getLandingSections()` in `api/venues.js` (new `useLandingSections` hook,
  skeleton and error states). Added `halls` table + `bookings.hall_id` to `db/schema.sql`, logged as deviation #17
  in `docs/srs-alignment.md`, documented in `docs/database.md`. Not load-tested (no local Postgres)
- 2026-11-15: Added this progress log and the CLAUDE.md rule to read and update it
- 2026-11-15: Ask AI compact mode on detail pages: icon circle at `right-4`, expands to the pill on hover/focus (250ms),
  `aria-label`. Morph works from both sizes
- 2026-11-15: Shrunk the booking panel to 565px: removed the price breakdown and internal scroll, one live total above
  the button, "Marketplace services included" note. Centered at 1512×800 and 1280×720
- 2026-11-15: Sticky fix (cause: own `position: static` fallback on short screens). Guests min 25. Halls 1–4 per venue
  with a hall select driving the guest max. Gallery lightbox. (commit `c6a35cc`)
- 2026-11-14: Sticky centered booking panel, Google Maps embed, guest number input, live price, gallery page
  `/venues/:id/photos` (Figma 90:1063)
- 2026-11-14: Venue detail page `/venues/:id` with 5 tabs, skeleton/not-found/error states, `getVenueById` (commit `4ce6268`)
- 2026-11-14: Ask AI morph (layoutId tween), timestamps, grouped user messages (commit `166827f`)
- 2026-11-13: Ask AI launcher and chat panel from Figma, `sendMessage` stub. All venue photos to WebP, lazy loading fixes
  (commit `469ad1e`)
- 2026-11-13: Landing page from Figma 1:3, client scaffold, maroon theme, layout/container fixes, card photos (commit `f621508`)
- 2026-11-11: Project docs, SRS and schema at repo root, CLAUDE.md rules merged (commit `398e776`)
- 2026-11-11: Claude Code skills/agents installed, `.playwright-cli/` ignored (commits `3470d94`, `cf0e28b`)

## Open items / TODO

### Gaps and stubs

- No server, DB, auth or real API yet. Everything is mock data
- `sendMessage` is a stub (no RAG backend, no assistant replies)
- "Check availability", slot hold and booking: UI only, needs the booking engine (docs/booking-engine.md)
- "Report this listing": UI only, nothing sent
- `/owner`: not built
- Host wizard: no auth guard yet (`TODO(auth)` in `pages/HostWizard.jsx` and `app/router.jsx`); submit is a stub,
  photos aren't uploaded, nothing reaches an admin queue. Drafts are per browser (localStorage + IndexedDB)
- Host wizard UI-only data needing columns or a decision: venue category, listing headline, Google Maps link, hall
  standing capacity / setting / AC, photo `category` + `hall_id` on `venue_images`, custom-menu note, booking rules
  (days, slot times, advance %, cancellation policy). Dishes are sent as `menu_items.category = 'main'` until a menu
  editor sets real categories
- Host wizard drafts: no cross-tab sync (two tabs overwrite each other), and a draft saved with another
  `DRAFT_VERSION` is dropped instead of migrated (react-reviewer LOW items, deferred)
- Playwright can't click the wizard's Next while it's `aria-disabled`; e2e tests must click via the DOM or fill the
  step first
- About team: photos and roles are placeholders (`TEAM` in `features/about/content.js`)
- Search history (REQ-12 "each search saved") and personalised recommendations (REQ-15) need the server
- Wishlist is per browser (localStorage), not per account. No wishlist page yet
- OSM tile servers have a usage policy; heavy production traffic would need a tile provider or self-hosted tiles
- Map pins overlap when venues are close (no clustering)
- Halls: `halls` is in `db/schema.sql` but deviates from the ERD (Figure 6). Explain it to the panel (srs-alignment #17)
- Halls are not independently bookable: slots are per venue, so two halls of one venue can't host overlapping events.
  Fixing that needs `time_slots.hall_id` + per-hall overlap / one-active-booking constraints (decision needed)
- Mock hall fields `standingCapacity, widthM, lengthM, description, floorPlanUrl` are UI-only, not in the table
- `db/schema.sql` changes are not load-tested (no Postgres/Docker on this machine)
- UI-only data not in the ERD: rating categories, host info, parking, event notes, gallery categories, bridal suite
- Google reviews, weather, WhatsApp invites, QR check-in, 3D walkthrough, AI image check: not started
- PWA (manifest, service worker) not set up
- No tests (Vitest/Supertest/Playwright suites) yet
- `docs/ui-and-dashboards.md` has an uncommitted edit in the working tree

### Known UI caveats

- Booking panel only has ~19px to spare at 1280×720. On shorter screens it pins under the header and the bottom can be
  cut off (by design, no internal scroll)
- Ask AI launcher can overlap the help card / report link under the booking panel on short screens
- After closing the chat with Esc, the compact launcher stays expanded (keyboard focus) until focus moves
- Google Maps embed renders blank in headless screenshots. Its `src` is verified, not the visual
- Lightbox backdrop is 95% opaque

### Next steps (suggested)

- Scaffold `server/` (Express, `pg`, node-pg-migrate, Zod, AppError) per docs/architecture.md and docs/build-plan.md
- Decide whether halls should be independently bookable (per-hall slots)
- Venue search API (`GET /api/venues`) matching `searchVenues()` filters, plus search history
- Booking engine (slots, holds with `SELECT ... FOR UPDATE`, quotations) with Vitest tests
- Auth (JWT + refresh) and role dashboards (`/app`, `/owner`, `/decorator`, `/admin`)
