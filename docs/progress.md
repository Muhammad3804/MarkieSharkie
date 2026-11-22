# Progress log

Read this at the start of every session. Update it at the end of every task (changelog entry, plus Current state,
Decisions and TODO if they changed) and commit it with the code.

Last updated: 2026-11-22

## Current state

### Server (`server/`, added 2026-11-21)

- Node 20, ES modules, Express 4.22, `pg` 8 (raw SQL, `$n` params only), node-pg-migrate 9 (SQL migrations), Zod 4,
  dotenv 18 (loads the repo-root `.env`; shell vars win), helmet, cors, cookie-parser, express-rate-limit 8, argon2
  0.44.0 (pinned), jsonwebtoken 9, pino 10 + pino-http 11. Dev: Vitest 4, Supertest 7, ESLint 10 (flat config with a
  `no-restricted-syntax` rule against interpolated / concatenated SQL in `.query()`), Prettier 3 (no semicolons,
  single quotes, 120 cols, same as the client), `yaml` (OpenAPI test). npm `overrides` pins node-pg-migrate's `glob` to
  ^14.0.6 (fixes 3 moderate advisories; `npm audit` = 0)
- Layout: `src/{app.js, server.js, config/, db/, lib/, middleware/, modules/auth, modules/users}`, `migrations/`,
  `scripts/`, `tests/`, `openapi.yaml`. `src/lib/` (AppError, logger, validators, pg error mapping) is the one folder
  not in the brief's list; architecture.md updated
- `config/env.js`: Zod-parsed env, exits with a list of problems. `JWT_ACCESS_SECRET` >= 32 chars and not a
  placeholder (`change-me`...). Vars: `NODE_ENV, PORT, CLIENT_ORIGIN, DATABASE_URL, TEST_DATABASE_URL,
  JWT_ACCESS_SECRET, ACCESS_TOKEN_TTL_MINUTES=15, REFRESH_TOKEN_TTL_DAYS=7, SESSION_INACTIVITY_MINUTES=30,
  LOGIN_MAX_ATTEMPTS=5, LOGIN_LOCK_MINUTES=15, SLOT_HOLD_MINUTES=10, TRUST_PROXY=false, LOG_LEVEL=info`.
  `NODE_ENV=test` switches the pool to `TEST_DATABASE_URL` and refuses if it is the same DB as `DATABASE_URL`
- `db/pool.js` (one Pool; `date` columns stay `YYYY-MM-DD` strings, numeric stays a string), `db/withTransaction.js`
- Middleware: `errorHandler` (AppError -> `{ error: { code, message, details? } }`; body-parser errors -> 400
  `INVALID_JSON` / 413; anything else -> 500 `INTERNAL_ERROR`, no stack or SQL), `notFound`, `validate({ body, params,
  query })` (strict schemas, per-field details), `authenticate`, `requireRole`, `rateLimit`
- Hardening: helmet, CORS only `CLIENT_ORIGIN` with credentials, JSON 1 MB, cookie-parser, `trust proxy` from env,
  rate limits register 10/h, login 20/15 min, refresh 60/15 min per IP. Request logs: method, path (no query), status,
  request id; no headers, cookies or bodies; pino `redact` for password / token / phone keys; pg `detail` stripped
- Routes (all in `server/openapi.yaml`):

| Route | Who | SRS |
|---|---|---|
| `GET /api/health` | public | `SELECT 1` -> `{ status: 'ok', db: 'up' }` |
| `POST /api/auth/register` | public, rate limited | EUC-01, REQ-1 |
| `POST /api/auth/login` | public, rate limited | EUC-02 1-6, REQ-2, REQ-3 |
| `POST /api/auth/refresh` | refresh cookie, rate limited | REQ-2 |
| `POST /api/auth/logout` | refresh cookie (optional) | EUC-02 7, UC-03 |
| `GET /api/me` | any role | EUC-03 2, REQ-4 |
| `PATCH /api/me` | customer, venue_owner, decorator | EUC-03 3-7 |
| `GET /api/me/searches`, `GET /api/me/bookings` | customer | EUC-03 2, REQ-4 |

- Sessions: access JWT HS256 15 min `{ sub, role }` + iss `markiesharkie-api` / aud `markiesharkie-client`; refresh
  token 32 random bytes base64url, SHA-256 in `refresh_tokens`, cookie `ms_refresh` (httpOnly, SameSite=Strict,
  Path=/api/auth, Secure in production). Login response `{ accessToken, user, homePath }`; refresh returns the same
- Phone: accepts `03XX-XXXXXXX`, `03XXXXXXXXX`, `+92 3XX XXXXXXX`, `+923XXXXXXXXX` (spaces / dashes anywhere),
  stores `+923XXXXXXXXX`. Field rules shared by register, PATCH /me and create-admin in `src/lib/validators.js`
- Scripts: `migrate`, `migrate:test`, `migrate:create`, `db:check`, `create-admin` (interactive, hidden password;
  also accepts piped input)
- Tests: 12 files (182 tests) in `server/tests/` against `markiesharkie_test` (global setup guards + migrates; `TRUNCATE ...
  CASCADE` before each test; files run one at a time). Test names carry the SRS ids
- Windows notes: run npm from PowerShell or a normal terminal. Git Bash without `ComSpec` set can't run npm scripts
  or argon2's install script

### Stack (client only so far)

- Vite 8, React 19 (hoists `<title>`/`<meta>` from components), Tailwind CSS 4 (`@tailwindcss/vite`, CSS-first `@theme`)
- React Router 7 data router (`createBrowserRouter`), `motion` 14 (`motion/react`) for the chat morph
- Leaflet 1.9 + OpenStreetMap tiles (no API key) for the Explore map and the host pin, lazy-loaded
- three 0.187 + @react-three/fiber 9 for the hall 3D model (`features/venues/HallModel3D.jsx`), lazy-loaded. Uses three's
  own `OrbitControls`/`EdgesGeometry` (drei removed: it added weight for two helpers)
- Zod 4 in the client for the host wizard's per-step validation (same library the server will use)
- qrcode (QR PNG data URLs), lz-string (invitation card in the link hash), html-to-image (card PNG, lazy-loaded)
- oxlint for linting. No test runner set up yet. playwright-cli used for manual browser checks
- No server, DB or PWA setup yet. All data is mock

### Routes (`client/src/app/router.jsx`, all under the root `AuthProvider` route)

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
| `/bookings` | `pages/MyBookings.jsx` | lazy; My bookings with status badges, cancel, dev-only owner actions; `RequireAuth` |

Outside `PublicLayout` (own full-screen shell, no header/footer/chat):

| Path | Page | Notes |
|---|---|---|
| `/host/new` | `app/HostResumeRedirect.jsx` | redirects to the draft's `lastStep` or `about`; `RequireAuth` |
| `/host/new/:step` | `pages/HostWizard.jsx` | listing wizard; `RequireAuth` (`TODO(auth)` venue_owner role) |
| `/venues/:id/book/:step` | `pages/BookingFlow.jsx` | booking flow (`selection`, `details`, `add-ons`, `price`, `review`, `confirmation?ref=`); `RequireAuth` |
| `/bookings/:id/invite/:step?` | `pages/InvitationBuilder.jsx` | QR invitation builder (`template`, `details`, `review`); Confirmed bookings only; `RequireAuth` |
| `/invite/:id` | `pages/GuestInvitation.jsx` | public guest invitation + RSVP, no account, no chrome; card from the store or the `#c=` hash |
| `/admin/*` | `features/admin/AdminLayout.jsx` + `pages/admin/*` | admin dashboard, lazy (`app/adminRoutes.jsx`); `TODO(auth)` RequireRole('admin') |

- Login (dummy, see "Login" below): header "Log in" / avatar menu; `RequireAuth` shows a "Log in to continue" card
  on guarded routes when signed out
- Header nav links `/`, `/explore`, `/host` ("Become a host"), `/bookings` ("My bookings"), `/about`. Footer "List your space" and the About
  "List your venue" buttons also go to `/host`. `/owner` (dashboard) doesn't exist yet
- Footer has a "MarkieSharkie" column: About us, How it works (`/about#how-it-works`), FAQs (`/about#faq`). Below lg the
  footer is a grid (2 columns, 4 from sm); flex row from lg
- `PublicLayout`: `SiteHeader` (sticky, 116px), `<main class="@container">`, `SiteFooter`, `ChatWidget`, `<ScrollRestoration />` (default key)

### Key files

- `src/index.css`: theme tokens (maroon palette, fonts, shadows, glow keyframes), `page-container`, `page-inset-left`,
  `font-heading`, `scrollbar-none` utilities, `scroll-padding-top: 132px`, scroll lock while a modal `<dialog>` is open
- `src/lib/money.js`: `toPaisa`, `formatPaisa`, `formatAmount` (integer paisa, output like `Rs. 187,750`)
- `src/lib/format.js`: `formatTime` (h:mm AM/PM), `formatEventDate`, `timeAgo`, `formatPKR`, `todayKey()` (today in Pakistan time)
- `src/lib/days.js`: yyyy-mm-dd day-key maths (`addDays`, `daysBetween`, `addMonths`, `monthDiff`, ...)
- `src/lib/phone.js`: `normalizePkMobile` (03XX-XXXXXXX / +92 3XX XXXXXXX -> `+923XXXXXXXXX`), `formatPkMobile`
- `src/lib/booking.js`: `SLOT_HOLD_MINUTES = 10`, `MIN_GUESTS = 25`, `DEFAULT_GUESTS = '50'`, `guestCountError(value, hall)`, `SLOT_PRESETS` (Lunch / Evening with start/end), `billableGuests`, `SLOT_STATUS_LABELS`, `bookingStatusView` (status -> label), `bookingReference` (`MS-XXXXXX`)
- `src/lib/money.js` also has `paisaToAmount` (paisa -> `"187750.50"`)
- `src/api/bookings.js`: booking mock (see "Live availability and booking flow")
- `src/features/booking/`: flow steps, draft store, hold helpers, pricing/refund maths, calendar nav, live availability hook,
  .ics (`eventIcs` / `downloadIcsFile` are generic, the guest page uses them too)
- `src/api/invitations.js`: invitation / guest / RSVP mock (see "QR invitations")
- `src/features/invitations/`: `InvitationCard` (4 designs + `InviteFonts`), `QrShare`, `useQrCode`, `RsvpSummary`,
  `link.js` (hash encode/decode, guest URL, maps URL), `schema.js`, `draft.js`, `options.js`, `format.js`, `steps.js`
- `src/api/venues.js`: `getVenueById(id)`, `getLandingSections()` and `searchVenues(filters)`, backed by `mockVenues.js`
  plus approved listings from `api/listings.js`; suspended venues are filtered out. `listMockCatalog()` for admin.
  `getPlatformStats()` (venue/hall/city counts, average rating) for About. Swap the bodies for `GET /api/venues/:id`,
  `GET /api/venues/landing`, `GET /api/venues?<query>` and `GET /api/stats` later. The only
  file that imports `mockVenues.js`
- `src/api/chat.js`: `sendMessage({ message, history })` stub, returns `null`
- `src/api/mockStore.js`: `createMockStore(key, { seed, isValid })` (localStorage JSON, memory fallback, cross-tab
  `storage` sync), one shared change signal `subscribeMockStores`, `latency()`
- `src/api/listings.js`: submitted listings (localStorage `markiesharkie:listings`, files in IndexedDB
  `markiesharkie-listings`), venue suspensions, `listingToVenue()` (payload → the same venue shape as `getMockVenue`),
  `getPublicListingVenues()` (approved + active + not suspended only). Seeds from `features/admin/seedListings.js`
- `src/api/admin.js`: admin mock API (localStorage `markiesharkie:admin`): approvals, flagged images, venues,
  users, disputes, listing reports, audit log, overview, notifications, global search. Every change writes an
  audit entry. `CURRENT_ADMIN` is a demo admin (`TODO(auth)`)
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

### Login (real server auth since 2026-11-22)

- `src/api/http.js`: the one fetch wrapper. Base `VITE_API_URL` (default `http://localhost:4000/api`; Vite reads
  `.env` from `client/`, so the root `.env` value is not used), JSON, `credentials: 'include'`, `Authorization: Bearer`
  from an **in-memory** access token, errors normalised to `ApiError { status, code, message, fieldErrors }`, one
  refresh-and-retry on 401, then the auth layer's unauthorized handler
- `src/api/auth.js`: `logInWithPassword` (`POST /auth/login`), `signUp` (`POST /auth/register` then login, so the
  trigger still resumes; `REGISTERED_LOGIN_FAILED` sends the person to the login step), `signOut` (`POST /auth/logout`),
  `restoreSession` (page load: `POST /auth/refresh` with the httpOnly cookie, then `GET /me`), `getSessionUser` (sync;
  `userId` mirrors `id` for `api/bookings.js`), `subscribeAuth` / `getAuthSnapshot` (`{ ready, user }`),
  `onUnauthorized`. Refresh runs once at a time (one promise per tab, Web Lock across tabs) because refresh tokens are
  single-use (srs-alignment #26). Login / logout in one tab reach the others (BroadcastChannel)
  - "Keep me logged in" off: the server always sets a 7-day cookie, so the client stores a session-only flag plus a
    browser-session cookie `ms_session_alive`; on the next browser start the session is ended instead of restored
  - Google / Apple buttons hidden; "Forgot password?" says reset isn't available yet (no server routes)
- Modal: start (phone or email -> Continue, always to the password step: no account lookup, srs-alignment #23) ->
  "Welcome back" (password, Keep me logged in, Forgot password?, "New to MarkieSharkie? Create an account") or signup
  (account type: Book venues = `customer`, List my venue = `venue_owner` (+ business name, business contact number),
  Offer decor = `decorator` (+ business name, short description); the host trigger preselects venue owner). Server
  errors show under the matching field (400 / 409 `details`); wrong password and unknown account get the same message;
  423 lock, 403 suspended, 429 rate limit and network errors show as an alert
- `RequireAuth` waits for the restore (`ready`) so a refresh doesn't flash the login card. `RequireRole` does not exist yet
- Triggers (`useRequireAuth()(intent, action)`, resumed after login or signup, dropped if the modal closes): "Check
  availability" (`BookingSidebar`), "Let’s get started" on `/host`, header "My bookings"
- `src/lib/accountRules.js`: client field rules (plus `businessNameError`, `bioError`); the server's Zod rules decide

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
  `markiesharkie:host-draft`) and `submitListing` (creates a `pending` listing in `api/listings.js`, see Admin)
- Steps (`features/host/steps.js`, 21 screens): `about` (intro) → `venue-type`, `name` (+ hosting since), `location`,
  `pin`, `directions` (landmark + minutes + getting there), `halls` (+ length × width × ceiling ft, live area,
  description), `bridal-suite`, `events` → `stand-out` (intro) → `amenities` (+ parking spaces), `photos`, `layout`
  (floor plan image/PDF + stage/entrance/seating on a 3 × 3 grid), `walkthrough` (generate / upload / link / skip),
  `title` → `finish` (intro) → `menus` (dish sections), `custom`, `rules` (+ Custom policy builder), `house-rules`,
  `review`
- Gap audit (2026-11-17): every field the venue page shows is now collected or derived. Derived: tagline/kind (from
  category), highlights, capacity, price from, event timing (lunch start / dinner end). Not host data: reviews, rating
  categories, reply time, top host, booked/available dates, approval/verification status
- Layout: floor plan JPEG/PNG/PDF ≤ 10 MB (IndexedDB like photos). Zones are radio grids (cells "Back left" …
  "Front right"), drawn as badges over the plan; two zones can't share a cell
- 3D: `HallModel3D` builds the room from L × W × ceiling: floor, three translucent walls, outline box, stage (maroon,
  flush to the wall when at the back/front), doorway (gold) on the wall nearest the entrance cell, round tables in
  the seating band (or across the floor). `frameloop="demand"`, drag/scroll/pinch plus Turn left/right, Zoom, Reset
  buttons, `role="img"` summary, WebGL error fallback. Camera pulls back on narrow canvases. Upload accepts
  .glb/.gltf ≤ 50 MB or 360° JPEG ≤ 20 MB (api-and-security.md); link must be https
- Menu sections: each package starts with Appetizers, Main course, Rice / Biryani, BBQ, Breads, Desserts / Sweets,
  Drinks (+ template extras like "Salads & raita"); each is a tag input; ↑/↓ reorder (focus kept), rename/remove
  custom ones, add your own; ≥ 1 dish per package, ≤ 60. Saved as `menu_items.category` = section name
- Custom cancellation: rows of from-days / to-days (empty = or more) / refund %, add/remove, note; rows can't overlap
  (`[from, to)` ranges), ≤ 6 rows. Review lists them as "30 or more days before: 100% back"
- Draft v2 (`DRAFT_VERSION = 2`): v1 drafts are migrated (flat dishes → Main course, "lobby" photos → "hallway")
- Shell: logo, "Questions?" (native `<dialog>` drawer with per-step tips), "Save & exit" (to `/`), "Draft saved"
  indicator. Fixed bottom bar: 3-segment progress (one per phase, `role="progressbar"`), Back, Next. Next uses
  `aria-disabled` (not `disabled`) so pressing it shows every error and focuses the first invalid field. Enter = Next
  (form submit from inputs, window listener when focus isn't on a control). Step slide via `AnimatePresence`
  (direction-aware, crossfade only with reduced motion). Focus moves to the new step's `h1`
- URL guard: opening a later step while an earlier one is invalid redirects to the first invalid step
- Review: summary card per section with "Edit" → `/host/new/:step?from=review`; Next then reads "Back to review"
- Draft (`features/host/draft.js`) is shaped like the tables (`venue`, `halls`, `venueImages`, `menuPackages` with
  `sections[].items` → `menu_items`, `addOns`, upload walkthroughs → `walkthrough_assets`) plus UI-only fields. `toListingPayload()` builds the submit body and derives `venue_type`,
  `capacity` (largest hall), `base_price` (cheapest package per head, integer paisa maths)
- State: `features/host/draftStore.js` (`useSyncExternalStore`), every edit saved immediately. Photo files in IndexedDB
  (`features/host/photoStore.js`, db `markiesharkie-host`), metadata in the draft, so refresh and resume keep photos
  (memory fallback if IndexedDB is blocked)
- Validation: `features/host/schema.js`, one Zod schema per step + plain cross-field checks (unique hall names, photo
  per hall + cover, lunch before dinner, menu min guests ≤ largest hall). Errors show on blur or after Next
- Photos: zones per hall (Main hall, Stage, Seating, Bridal room, Washrooms) + venue-wide (Entrance, Exterior,
  Parking, Lobby / hallways = `hallway`, the venue page's Hallway section). Upload button or drag and drop, JPEG/PNG ≤ 5 MB (REQ-8), ≥ 5 total, ≥ 1 per hall, ≤ 60. Reorder
  by drag or ←/→ buttons, star = cover (first photo by default), remove with confirm
- Map pin: Leaflet draggable marker, click map to move, arrow keys on the focused pin, "Use my location" (rejects
  points outside Pakistan), optional Google Maps link (https maps.app.goo.gl / google.com/maps only)
- Tested with playwright-cli at 375×812 and 1512×900: full flow to submit, refresh mid-flow, Back, Save & exit +
  resume, URL skip guard, edit-from-review, photo upload/drop/reject/reorder/cover/remove + refresh, help drawer +
  Esc, reduced motion, no horizontal scroll on any step. `.playwright-cli/host-flow2.js` replays the full 21-screen
  flow incl. the error cases (landmark pair, empty bridal suite, zone clash, bad tour link, tier overlap)

### Live availability and booking flow (`/venues/:id`, `/venues/:id/book/:step`, `/bookings`)

- No Figma; host wizard step pattern and components (`StepHeading`, `TextField`, `ChoiceCard`, `Counter`,
  `HelpDrawer`, `WizardContext`), maroon tokens, ui-ux-pro-max for UX rules (soft layered card shadows, roomy cards)
- Mock API `api/bookings.js` (localStorage `markiesharkie:bookings`): rows shaped like `time_slots` and `bookings`
  (+ `booking_add_ons` as `addOns`) in camelCase. Each export names the endpoint that replaces it: `getVenueSlots`,
  `checkSlot`, `holdSlot`, `getHold`, `releaseHold`, `requestBooking`, `listMyBookings`, `getBooking`,
  `cancelBooking`, `devOwnerAction` (dev only), `resetBookings` (admin "Reset demo data" calls it)
- Slots are **per hall** x Lunch / Evening (srs-alignment #19). Untouched slots derive from `venue.bookedDates` (some
  days fully booked, some partly). Expired holds read as available (lazy check). Writes run inside
  `navigator.locks` (the browser stand-in for `SELECT ... FOR UPDATE` across tabs). A hold on a held or booked slot
  is refused with `SLOT_UNAVAILABLE` + nearest free dates (same hall/slot) and other free halls
- `holdToken` per tab (sessionStorage) stands in for the customer session, so two tabs act as two customers
- Calendar (`components/venue/CalendarMonth.jsx` + `features/booking/calendarNav.js`): today from `todayKey()` (PKT),
  back button disabled on the current month, up to 12 months ahead, past days `aria-disabled` and greyed, today
  ringed (`aria-current="date"`). WAI-ARIA grid, roving tabindex, arrows / Home / End / PageUp / PageDown
  (+ Shift = year). Two dots per day (Lunch, Evening: green free, amber partly, red taken), struck-through number
  when fully booked, legend. The aria-label carries the same info. Two months from md, one below
- `useSlotAvailability(venue)`: refetches on any mock store change (incl. other tabs via `storage`) and when the
  next hold expires; per-day states precomputed. The venue page shows a per-hall x per-slot panel for the picked day
  (free slots fill the booking panel)
- Booking panel: date field opens a one-month picker popover (same rules), slot and hall options say "On hold" /
  "Booked", live total = menu x billable guests + hall hire. Check availability: free -> hold + flow; taken ->
  inline message with date / hall chips. Panel state is prefilled from the booking draft (flow "Edit" comes back
  filled)
- Flow (`pages/BookingFlow.jsx`): own shell like the host wizard (logo, hold timer pill, Questions?, Save & exit;
  5-segment progress bar, Back / Next, Enter = Next, slide + focus to h1, URL per step, `?from=review`, URL guard to
  the first invalid step). Draft autosaved per venue in localStorage `markiesharkie:booking-drafts`
  (`features/booking/draft.js`); the hold ref is per tab in sessionStorage. Refresh keeps hold and answers. Leaving
  the flow (Save & exit, Edit date/time/hall, Back from step 1) releases the hold. `main` clips horizontal overflow
  so the step slide never causes a sideways scroll
- Hold: 10 min (`SLOT_HOLD_MINUTES`), countdown pill on every step (amber under 2 min; only the pill re-renders each
  second), screen-reader announcements at 5 / 2 / 1 min and 30 s. On expiry the slot is released and a modal offers
  Try again (re-hold if still free, otherwise the reason + alternatives) or Choose another slot
- Steps: Your selection (summary + Edit; guests and menu edit inline), Event details (event type, event name, host
  name, Pakistani mobile, special requests <= 500), Add-ons (venue's Sound system / DJ and SMD screen, 0-4 each,
  empty state), Price breakdown (menu x billable guests + hall hire + add-ons, advance % from the venue, balance,
  cancellation policy incl. custom tiers and what cancelling today returns, house rules), Review & request (summary
  with Edit links, agree checkbox), Confirmation ("Pending owner approval", `MS-` reference, what happens next, Add
  to calendar .ics, View my bookings)
- Money: integer paisa throughout (`features/booking/pricing.js`). A menu whose `min_guests` is above the guest count
  is charged for its minimum (REQ-35), shown in the panel and the breakdown
- `/bookings`: Upcoming / Past and cancelled, status badges (Pending owner approval, Accepted · pay advance,
  Confirmed, Completed, Cancelled, Expired), Add to calendar, Cancel (dialog with required reason and the refund the
  policy gives on the advance paid). Dev builds show "Owner (dev only)" Accept / Reject / Record advance. Loading,
  empty and error states; refreshes live
- Lazy job on read: `requested` / `held` past the event date -> cancelled "Expired..."; `confirmed` -> `completed`
- Venue data added: mock venues get `addOns`, `bookingTerms` (advance %, policy, custom tiers, house rules = event
  notes) and `halls[].hallCharge` (own seed, nothing else shifted); approved listings map the wizard's booking
  rules, add-ons (with ids) and `hallCharge: '0.00'`
- Tested with playwright-cli at 375x812 and 1512x900 (`client/.playwright-cli/booking-calendar.js`,
  `booking-flow.js`): past dates unpickable and month back disabled, keyboard grid, picker Esc + focus return, tab A
  holds -> tab B sees "On hold" live and is refused with suggestions, refresh mid-flow keeps hold + answers, errors
  focus the first invalid field, full flow -> Pending owner approval, .ics download, tab B sees "Booked" without a
  reload, hold expiry with a fake clock in its own context (modal, slot released, Try again re-holds, Save & exit
  releases), dev accept -> advance -> cancel with refund preview -> slot available again, no horizontal scroll, no
  console errors. Note: `page.clock.install()` is context-wide and breaks motion animations for the rest of that
  context, so run clock tests in a separate context

### QR invitations (`/bookings/:id/invite/:step`, `/invite/:id`)

- REQ-36 to 39, SSD4/SSD5. Frontend only, on the mock `api/invitations.js` (localStorage `markiesharkie:invitations`:
  `invitations`, `guests`, `rsvps` rows in camelCase). Decisions in srs-alignment #21: RSVP is yes / no + party size,
  one open link, guests register themselves when they reply, proposed `[Design]` columns (template, event type, host
  names, reply-by, contact phone, `rsvps.party_size`)
- Entry: `/bookings` shows "Generate QR invitation" on **Confirmed** bookings only (then "Invitation & QR"). The builder
  shows "Invitations open once the booking is confirmed" for any other status, and `saveInvitation` refuses too
- Builder: booking-flow shell (logo, Draft saved, Questions?, Save & exit; 3-segment progress, Back / Next, URL per
  step, guard to the first invalid step, slide + focus to h1). Draft per booking in localStorage
  `markiesharkie:invitation-drafts`, prefilled from the saved invitation, else the booking (event name, type, host
  name, phone; reply-by = a week before the event)
  - Choose a design: 4 large radio cards, each a full preview with the host's own details: Classic maroon & gold,
    Floral pastel, Modern minimal, Mehndi festive (Urdu Bismillah + event type in Noto Nastaliq Urdu)
  - Event details: read-only "From your booking" (venue, hall, date, time, address, Google Maps link); event name,
    event type chips (Wedding, Walima, Mehndi, Barat, Engagement, Birthday, Corporate, Other), host family names,
    message (optional, 300), reply-by (from today, before the event day), contact phone (PK mobile). Zod per step.
    Live preview sticky beside the form at lg+, behind a "Show card preview" toggle below lg; updates per keystroke
  - Review & share: card + "Generate invitation" -> QR, download QR PNG, download card with QR (html-to-image, lazy
    loaded), copy link, WhatsApp (`wa.me` share link), Web Share (when supported). Editing later shows "Update
    invitation" (same id, new QR). Dev-only note on localhost explains `npm run dev -- --host`
- Card (`InvitationCard`): sized in container units (`cqi`), so thumbnails, preview, download and guest page share one
  component; small lines never go under 11px. Every font stack falls back to Noto Nastaliq Urdu and typed text has
  `dir="auto"`, so Urdu names and messages work in every design. Fonts (Cormorant Garamond, Great Vibes, Noto
  Nastaliq Urdu) load only on invitation pages with `crossOrigin` (html-to-image needs readable CSS; the site font
  `<link>` in `index.html` got `crossorigin` for the same reason)
- Link: `/invite/:id#c=<lz-string card>` (~540 chars, QR level M), so it opens on any device without our
  localStorage. The hash is untrusted: known keys only, typed and capped, maps URL rebuilt from numbers. The stored
  copy wins when this browser has one. `TODO(server)` short link, `TODO(lan)` uses `window.location.origin`
- Guest page: full-screen card in the chosen design with an open animation (rise + unfold; opacity only with reduced
  motion), Open in Google Maps, Add to calendar (.ics), Call the host, reply-by date. RSVP: Attending (people coming,
  1 to 20) or Can't make it, name, mobile. This device keeps the guest's `invite_token`, so the reply shows after a
  reload and can be changed until the reply-by day. "RSVP closed" after the deadline (or on/after the event day).
  Broken link -> "We couldn't open this invitation"
- Host view on `/bookings`: Attending replies, guests coming (of hall capacity), Can't make it, all replies (name,
  phone, response, people, when) in a disclosure; red warning when guests coming exceed the hall capacity, amber note
  when they exceed the booked guest count
- Tested with playwright-cli at 375x812 and 1512x900 (`client/.playwright-cli/invitation-flow.js`): button only on
  the Confirmed booking, template and details validation (focus to the first invalid field, reply-by on the event
  day refused), prefill, per-keystroke preview (incl. Urdu), mobile preview toggle, generate, QR + card PNG
  downloads, copy link (clipboard), WhatsApp href, guest link in a **fresh browser context** (empty storage, no site
  header), maps link, .ics, RSVP validation, attending x3, reload keeps it, change to no, reduced motion (no
  transform), RSVP closed via a past deadline, broken link, host counts + list + capacity warning (601 of 350), no
  horizontal scroll on any page, no console errors

### Admin dashboard (`/admin`)

- No Figma; ui-ux-pro-max "data-dense dashboard" style (Stripe/Linear-like) on the maroon tokens, Inter + DM Sans.
  Own shell outside `PublicLayout`. Frontend only, all data from `api/admin.js` + `api/listings.js`
- Shell (`features/admin/AdminLayout.jsx`): collapsible sidebar (240 / 68 px, remembered in localStorage
  `markiesharkie:admin-sidebar`) with count badges (pending listings, flagged images, open disputes + reports);
  native `<dialog>` drawer below lg; sticky top bar with global search (combobox over listings, venues, users),
  notifications popover (mark all read) and admin menu; breadcrumb (pages set the last crumb via `crumbs.js`);
  skip link; focus moves to the page `h1` on section change; toasts (`aria-live`, 5 s, pause on hover/focus)
- Every section, tab, filter, sort, page and open user is in the URL (`useUrlState`: filters replace, tabs/pages push)
- `useAdminData(load, key)`: loading / ready / error + reload; refetches when any mock store changes (this tab or
  another), keeping old rows on screen (dimmed) while it does
- Pages: Overview (5 KPI cards, weekly submitted vs approved chart with tooltip + table view, "Needs your
  attention", recent activity), Venue approvals (status tabs, search, city/type/date filters, sort via select +
  `aria-sort` headers, 10 per page, bulk approve; table at md+, cards below), review page `/admin/approvals/:id`
  (every wizard answer grouped by the 3 phases, HallCard with floor plan + zones + "View in 3D", photos per hall in
  the Lightbox with a mock AI score, map, MenuCard, policies; checklist photos / details / location with automatic
  hints, Approve needs all three ticked; Reject needs a reason ≥ 10 chars; Request changes needs a note; history;
  sticky action bar below xl), Flagged images (grid, AI score meter, Keep / Remove), All venues (Live / Suspended,
  suspend with optional reason, unsuspend), Users (role tabs, status filter, side panel `?user=`, suspend / unblock /
  remove with an active-bookings warning), Disputes & reports (booking disputes with quotation + payments, listing
  reports; Start review → Resolve with a required resolution), Audit log (search, action type), Settings (platform
  facts, demo account, Reset demo data)
- Every action has a confirm `<dialog>` (`ConfirmDialog`: Esc / backdrop cancel, focus on Cancel for destructive
  ones, errors stay in the dialog) and a toast. Empty, loading (skeleton) and error (Try again) states on every page
- The loop: wizard Submit → `submitListing` copies the photo/plan/3D files out of the wizard's IndexedDB and creates a
  `pending` listing → shows under Pending → Approve → `api/venues.js` merges it into the landing page (new first row
  "New on MarkieSharkie", `See All` = `/explore?section=new`), Explore and `/venues/:id`. Pending, rejected and
  changes-requested listings and suspended venues return "Venue not found" publicly
- `/host/submitted` reads the status live: Pending / Approved (link to the venue) / Rejected (reason) / Changes
  requested (note + "Edit and resubmit", which puts the draft and its files back into the wizard; submitting again
  updates the same listing back to `pending`)
- "Report this listing" on the venue page opens `ReportListingDialog` (reason + details); the admin API is loaded only
  when a report is sent
- Venues with no reviews show "New" instead of "0.00 (0)" (VenueCard, ListingSummary, map pins); TrustDetails and
  HostRow handle missing rating categories / reply time
- Chart colours `chart-submitted` #b0405c and `chart-approved` #b8862e, checked with the dataviz palette validator
  (lightness, CVD separation, 3:1 on white). New tokens `success-bg`, `danger-bg`, `info`, `info-bg`, `app`
- Seed data: 8 listings (5 pending, 1 changes requested, 1 rejected, 1 approved = Nishat Banquet Hall, Rawalpindi),
  37 users, 6 disputes, 3 reports, 10 flagged images, audit entries for the seeded decisions
- Tested with playwright-cli at 375×812 and 1512×900: full loop (wizard submit → not public while pending → Pending
  tab → Approve blocked until the checklist is ticked → approve → home row, Explore, venue page, halls tab → host
  screen says Approved → audit log), reject (empty reason blocked), request changes → host edit & resubmit → pending,
  keep/remove flagged images, suspend hides from venue page + Explore, report from the venue page reaches the admin,
  Back after a tab change, no horizontal scroll on any admin page. Scripts: `client/.playwright-cli/admin-loop.js`,
  `admin-actions.js` (run after `host-flow2.js`)

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
- Migrations (2026-11-21): `server/migrations/001_initial-schema.sql` is a byte-identical copy of `db/schema.sql` and
  is applied. Every schema change from now on = new numbered SQL migration + `schema.sql` + `docs/database.md`.
  Forward-only, no down migrations
- Server auth (asked 2026-11-21):
  - No `/auth/lookup`; one generic 401 `INVALID_CREDENTIALS` for unknown user / deleted user / wrong password, with a
    dummy argon2 verify for unknown users (srs-alignment #23, supersedes #22(d) on the server)
  - `GET /me` for all roles, `PATCH /me` only for customer / venue_owner / decorator (srs-alignment #24)
  - Login by email or PK mobile (REQ-2 over EUC-02 step 3, srs-alignment #25)
  - Refresh tokens rotate on every refresh and keep the session's original 7-day expiry; strict reuse detection
    (a rotated token revokes all of the user's sessions); the client must single-flight refreshes across tabs
    (srs-alignment #26)
  - Login order: find user -> lock check (423) -> verify password -> suspended check (403)
  - argon2id via `argon2` **pinned to 0.44.0**: 0.45.2's Windows prebuilt binary crashes on load (access violation)
  - Registration does not log in (EUC-01 step 7, `next: '/login'`)
  - Role tables updated in the same transaction as `users`; the role for `req.user` is read from the DB on every
    request, never from the token or body
  - Tests use TRUNCATE ... CASCADE between tests (Part A brief); seed script out of scope; no CI, no coverage threshold
  - OpenAPI 3.1 in `server/openapi.yaml`, no Swagger UI; a test fails if a mounted route or an error code is missing
- Photos: WebP only, lazy below the fold, width/height set
- Booking panel: no internal scroll, no price breakdown, one live total. Sticky behaviour is final (the breakdown
  lives in the booking flow's Price step)
- Slots are per hall (asked 2026-11-17, srs-alignment #19); the schema change waits for the server work
- Booking statuses stay the REQ-21 enum; UI labels only (asked 2026-11-17, srs-alignment #20)
- Invitations (asked 2026-11-17, srs-alignment #21): RSVP yes / no + party size (no Maybe); one open link per
  invitation, guests register themselves on reply; the invitation QR is only the link (check-in QR is separate)
- Booking flow hold: a refresh keeps it, leaving the flow releases it, closing the tab lets it expire (10 min)
- Today is bookable; "past" means before today in Pakistan time
- Guests: min 25, default 50, max = selected hall capacity
- Chat: morph via shared `layoutId`, no `AnimatePresence`. Timings in `morph.js`
- Lightbox: native `<dialog>`, no library
- Maps: venue detail uses the Google embed + link only, no Maps JS API key in the client (NFR-4). Explore uses Leaflet +
  OSM tiles (no key)
- Explore state lives in the URL only; filter changes `replace`, search submit and pagination `push`
- Wishlist is localStorage until accounts exist
- Admin approval (asked 2026-11-17): `changes_requested` added to `approval_status` + `venues.changes_note`
  (srs-alignment #18). "Report this listing" reports are UI-only (no table); disputes stay booking-linked (REQ-48)
- Only `approved` + `is_active` + not suspended venues are public. Approve requires the 3-item checklist; bulk approve
  skips it (confirm dialog says to use it only for listings already checked)
- Admin mock stores live in `api/` (`admin.js`, `listings.js`, `mockStore.js`); pages never touch localStorage
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
- 3D walkthrough per hall (asked 2026-11-17): four options. Generate from dimensions (real three.js preview, UI-only),
  Upload .glb/360° JPEG (REQ-11, `walkthrough_assets`), paste a 360°/Matterport link (UI-only, opened in a new tab,
  never embedded), Skip. Default is Generate
- Hall sizes are in feet (mock data converted from metres; same RNG calls so other mock details didn't change)
- User preferences:
  - Casual, concise replies, tables over prose
  - Commit or push only when asked
  - Never create a real `.env` (only `.env.example`)
  - Verify UI with playwright-cli at 375 and 1512 (plus other sizes when asked), then build
  - Run react-reviewer on bigger React changes
- Login (asked 2026-11-18): fully dummy Google / Apple modal for now (srs-alignment #22); pages only talk to
  `useAuth` / `useRequireAuth` so the real auth can replace `api/auth.js`

## Changelog (newest first)

- 2026-11-22: **Login and signup use the real server auth.** New `client/src/api/http.js`; `api/auth.js` mock replaced
  (register + login + refresh + logout + `/me`, access token in memory, refresh cookie httpOnly); signup has an
  account-type picker with the venue owner / decorator fields; session restore on load, 401 -> login modal,
  cross-tab login / logout. Google / Apple hidden, password reset "not available yet". Verified with curl (all 5
  endpoints), playwright at 375 and 1512 (signup of all 3 roles, DB rows + argon2id hashes, reload, logout, wrong
  password / unknown email, duplicate, validation, the 3 triggers, keep-me-logged-in off, forced 401, cross-tab
  logout), client lint + build, server tests 182/182. No server changes.
- 2026-11-22: node_modules (and client/dist) moved into `*.nosync/` folders with symlinks, so iCloud Drive doesn't sync
  them: `client/node_modules -> node_modules.nosync/node_modules` (the real path must contain `/node_modules/` or Vite
  skips pre-bundling and the dev app is blank). `.gitignore` covers the symlinks and `*.nosync`

- 2026-11-21: **Server Phase 0 + Phase 1 (UC-01 to UC-04, EUC-01 to 03, REQ-1 to 4, NFR-4).** New `server/`:
  Zod env validation (refuses `change-me` / short JWT secrets), pg pool + `withTransaction`, AppError + error handler,
  validate / authenticate / requireRole / rate limits, helmet + strict CORS, redacting logs, `GET /api/health`.
  Migration 001 = byte-identical `db/schema.sql`, applied to the dev and test DBs (first real run of the schema;
  42 tables incl. `pgmigrations`, `spatial_ref_sys`). Auth: register (3 roles, discriminated union, users + role
  row in one transaction, 409 EMAIL_TAKEN / PHONE_TAKEN incl. 23505 mapping), login by email or PK mobile (generic
  401 + dummy argon2 verify, atomic 5-strikes / 15-min lockout, suspended 403 only after the password), refresh
  rotation with reuse detection + 30-min inactivity, idempotent logout. Profile: `GET/PATCH /api/me` per role,
  `/me/searches`, `/me/bookings` (paginated). `npm run create-admin` CLI (hidden password, piped input works).
  `server/openapi.yaml` (3.1) + a test that every route / error code is documented. Decisions asked and logged as
  srs-alignment #23 to #26 (no `/auth/lookup`, PATCH /me not for admins, email-or-phone login, strict reuse
  detection). argon2 pinned to 0.44.0 (0.45.2 crashes on Windows); `glob` override for node-pg-migrate (`npm audit`
  0). Ran: `npm test` 12 files / 182 tests passed (323 s), `npm run lint` 0 problems, `npm run format:check` clean,
  `npm run migrate` twice (second run "already up to date"), `npm run db:check`, a manual smoke test of every route on
  the real server and the create-admin CLI (valid, bad phone, mismatch, duplicate); smoke rows deleted afterwards.
  Docs: CLAUDE.md / README Commands, `.env.example`, `.gitignore`, build-plan, database, api-and-security,
  architecture, project-map, srs-alignment, plus `instructions.md` (what was built, what's left, how to run)

- 2026-11-18: Login modal restyled to the team's reference layout: 560px card / full-screen on phones, logo mark,
  "Log in or sign up" + per-trigger prompt, floating-label phone or email field, gradient Continue, "or", square
  Google / Apple icon buttons, "New to MarkieSharkie? Sign up"; tabs removed, back arrow + close on later steps.
  Fixed: an empty password's blur error pushed "Keep me logged in" down mid-click (empty password / city now
  only error on submit). Tests updated (`auth-email-flow.js` 62 checks, `auth-flow.js` 38) and pass at 375 and 1512
- 2026-11-18: Email / mobile + password login and signup in the same modal (mock `api/auth.js`). Google / Apple on
  top, "or", email or mobile -> password step (known) or signup (unknown); Log in / Sign up tabs. Signup: name, email,
  PK mobile, city, password with strength meter + show / hide, confirm, terms. Login: show / hide, Keep me logged in,
  Forgot password -> 6-digit code (paste, resend timer) -> new password. Lockout 5 tries / 15 min. SHA-256 + salt in
  the mock. Seeded `demo@markiesharkie.pk` / `Demo@1234`. Asked and decided (srs-alignment #22): OTP code reset (not a
  link), friendly messages (deviation), city added + role customer, email or mobile login. Forms lazy-loaded
  (`AuthFlow` chunk ~26 kB). Test script `client/.playwright-cli/auth-email-flow.js` (59 checks at 375 and 1512).
  react-reviewer fixes: a failed form chunk shows Try again / Reload inside the modal (no app crash); lockout and
  code-attempt counters update inside one store write (no undercount from parallel guesses); this tab's session wins
  and a not-remembered login leaves the shared one alone; Google / Apple won't take over a password account with the
  same email and check suspension; the API returns a public user (no hash / salt); 30 s server-side resend cooldown;
  tabs / Change / Forgot locked while a request runs; field errors in an always-mounted live region; backdrop close
  needs the press to start on the backdrop; OTP paste fills from box 1, typing over a digit keeps the new one;
  LOCKED alert has a Reset your password button; email field focused on open
- 2026-11-18: Dummy login modal (Google / Apple, no real OAuth), frontend only. `api/auth.js` mock session,
  `features/auth/` (AuthProvider at the router root, `useAuth` / `useRequireAuth`, `LoginDialog` bottom sheet /
  centred modal, `RequireAuth`, `UserMenu`). Triggers resume after login: Check availability -> booking flow with the
  selection kept, Become a host -> `/host/new/about`, My bookings -> `/bookings`. Header "Log in" / avatar menu.
  `RequireAuth` on `/bookings`, booking flow, invitation builder, `/host/new/*`. `DEMO_CUSTOMER` replaced by the
  signed-in user. srs-alignment #22 (REQ-1/REQ-2 email + password still needed). react-reviewer fixes: abandoned
  sign-in on back / forward, focus after login, cross-tab login closes the modal, modified clicks on My bookings,
  stable context value. Mobile header gap tightened (Log in pill is wider than the avatar). Test script
  `client/.playwright-cli/auth-flow.js` (38 checks at 375 and 1512); `invitation-flow.js` now logs in before seeding
- 2026-11-17: QR invitations, frontend only (REQ-36 to 39, SSD4/SSD5). "Generate QR invitation" on Confirmed bookings,
  3-step builder `/bookings/:id/invite/:step` (4 designs with live previews, details prefilled from the booking with
  a sticky / toggled live preview, review & generate), QR + card PNG + copy + WhatsApp + Web Share, public guest page
  `/invite/:id` (card from the `#c=` hash, open animation, maps, .ics, yes / no RSVP with party size, RSVP closed),
  host RSVP summary with capacity warning on `/bookings`. Mock `api/invitations.js` shaped like `invitations` /
  `guests` / `rsvps`. New deps: qrcode, lz-string, html-to-image. Asked and decided: RSVP stays yes / no + party size,
  one open link with self-registering guests (srs-alignment #21). `features/booking/ics.js` split into a generic
  `eventIcs`; admin "Reset demo data" also clears invitations. react-reviewer fixes: hash ids must be UUIDs, control
  characters stripped, real dates and slot times required, huge hashes refused, .ics escapes CR and the UID (no
  property injection from a crafted link); "too long for a QR code" message instead of an endless skeleton; Enter in
  the read-only link field no longer submits the builder; focus moves to the saved reply / "Change my reply"
- 2026-11-17: Live availability + booking flow, frontend only, on a mock `api/bookings.js` shaped like `time_slots` /
  `bookings`. Calendar rewrite (PKT today, no past months, past days disabled, legend, per-slot dots, per-hall day
  panel, ARIA grid + arrow keys) shared by the page and a new booking-panel date picker; live updates across tabs.
  Check availability checks the exact hall slot, holds it (10 min) or suggests nearest dates / other halls. Flow
  `/venues/:id/book/:step` (selection, details, add-ons, price, review, confirmation) on the host wizard's pattern
  with hold countdown + expiry modal, autosaved draft, .ics. `/bookings` with status badges, cancel + refund preview,
  dev-only owner actions. Asked first about per-hall slots and status names (srs-alignment #19, #20). Tested with
  playwright-cli at 375 and 1512; lint 0 warnings; build OK. Reviewed with react-reviewer (fixed: Home / End keys
  threw (missing import), focus lost on month change, a hold from another tab's slot trusted after the shared draft
  changed, draft cleared before the confirmation route landed (redirected to the venue page; cleanup now runs on the
  confirmation screen), stale first countdown value, focus lost after cancel, calendar days re-rendering on every
  keystroke, old hold released before the new one was secured, retry without loading state, agreement kept across
  a new slot). Not committed

- 2026-11-17: Admin dashboard `/admin` (frontend only): shell with collapsible sidebar / drawer, search, notifications,
  breadcrumb; Overview, Venue approvals + full review page, Flagged images, All venues, Users, Disputes & reports,
  Audit log, Settings. Mock stores `api/listings.js` + `api/admin.js` (localStorage + IndexedDB) with seeds. The
  approval loop works end to end: wizard submit → Pending → approve → home / Explore / venue page; reject and request
  changes reach `/host/submitted`, which can reopen the listing for changes. "Report this listing" is a real form.
  Schema: `changes_requested` + `venues.changes_note` (asked first; srs-alignment #18, database.md). Tested with
  playwright-cli at 375 and 1512; lint 0 warnings; build OK. Reviewed with react-reviewer (fixed: popover closing
  before clicks, invalid URL values crashing pages (allowlists in `useUrlState`), search box dropping keystrokes,
  toasts not announced while the modal was open, focus lost after actions / on lazy pages, double decisions on
  images, listings and reports (API guards), drawer left inert on resize, object URL leak, bulk-approve dialog
  emptying, null dates, toast timers restarting, missing listing on `/host/submitted`). Not committed

- 2026-11-17: Added `docs/project-map.md` (folder map, file guide by feature, progress table vs build plan and REQs,
  list of mocks, next 5 steps). No code changes. Found that the root `.gitignore` doesn't ignore `.env`

- 2026-11-17: Audited the venue page against the wizard and filled every gap: hosting since, getting there, hall size
  (ft + ceiling, auto area) and description, bridal suite, parking spaces, floor plan + zones, 3D walkthrough
  (generate / upload / link / skip), menu sections, custom cancellation rule builder, house rules, Lobby → Lobby /
  hallways. New `HallModel3D` (react-three-fiber) on the wizard and on venue hall cards ("View in 3D"). HallCard
  shows ft, area, ceiling and zone badges on the plan; MenuCard groups dishes by section; bridal suite optional on the
  venue page. Mock data: halls in ft with zones/walkthrough, one menu item per dish with sections. Draft v2 with v1
  migration. Asked about REQ-11 vs the brief first. Tested with playwright-cli at 375 and 1512; reviewed with
  react-reviewer. Not committed
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

- Server auth gaps found while wiring the client (no server change made): `/auth/login` has no `remember` (client
  workaround above); no password reset routes (REQ-2); no OAuth (srs-alignment #22 is client-only now); `RequireRole`
  and role-based dashboard links still to build

- Server has auth + profile only (2026-11-21). The client is not wired to it yet: every page still uses the browser
  mocks in `client/src/api/*`
- Auth server, not built yet (out of scope 2026-11-21): password reset by OTP (REQ-2, `password_reset_codes` exists),
  change password, change email, account deletion with anonymisation (NFR-8, REQ-47), admin user management
  (suspend / unblock / remove / create admin, with `admin_audit_log`), ownership helpers (come with venues/bookings)
- Auth client TODO: swap `api/auth.js` for the API; replace the email-first "Welcome back / No account" step with one
  phone-or-email + password step (srs-alignment #23); role picker + owner / decorator fields at signup; keep the access
  token in memory and **single-flight refreshes across tabs** (srs-alignment #26); refresh while the user is active
  (inactivity is measured from the last refresh); drop the token on logout; profile page (`/me`)
- Deployment: the refresh cookie is SameSite=Strict, so the PWA and the API must be on the same site in production
  (e.g. `app.<domain>` + `api.<domain>`, or the API behind a rewrite on the PWA's domain). Set `TRUST_PROXY=1` behind
  one proxy so rate limits see real client IPs
- Test suite is slow locally (~6 min): `TRUNCATE ... CASCADE` over the whole schema costs ~2.4 s per test on Docker
  Desktop for Windows (a DELETE-based reset measured ~45 ms). Kept TRUNCATE per the Phase 0 brief; revisit if it hurts
- Seed script (build-plan Phase 0) not written
- Login is a browser mock (srs-alignment #22): accounts, hashes, lockouts and reset codes live in this browser's
  localStorage. No 30-min inactivity timeout (REQ-2), no profile page (REQ-4), Google / Apple are simulated; no roles (everyone is `customer`, so `/host/new` isn't venue_owner-only and `/admin` has no RequireRole);
  Terms / Privacy are plain text (no pages). Log out doesn't clear this browser's booking drafts or release a live
  hold. Real OAuth needs: the resume action persisted across the redirect (`{ intent, returnTo }`), a session
  `loading` state (RequireAuth would flash), a timeout + distinct errors (popup closed / blocked / network), and the
  access token in memory + refresh token in an httpOnly cookie (not localStorage)
- Auth TODO(server): done 2026-11-21: argon2id, atomic `failed_login_attempts` UPDATE, rate limits on login /
  register / refresh. Still open with OTP reset: `FOR UPDATE` on the reset code, rate limit on
  `/auth/password/forgot`; `/auth/lookup` dropped (srs-alignment #23). Android Backspace in an empty code box
  may not move back (needs `beforeinput`). The saved password-manager username is whatever was typed (email or mobile)
- Bookings made before login existed (customer `demo-customer`) no longer show on `/bookings`; Reset demo data or
  clear `markiesharkie:bookings`
- `sendMessage` is a stub (no RAG backend, no assistant replies)
- Booking engine is a browser mock (`api/bookings.js`): holds, requests, cancels and owner decisions live in this
  browser's localStorage. `navigator.locks` only serialises tabs of one browser; the real guard is the server
  transaction + `FOR UPDATE` + DB constraints (docs/booking-engine.md)
- Mocked in the booking flow: seeded booked slots (from `venue.bookedDates`), demo customer (`DEMO_CUSTOMER`,
  `TODO(auth)`), per-tab `holdToken`, owner accept / reject / record advance (dev-only buttons on `/bookings`), owner
  notifications (REQ-19), Socket.io `slot:updated` (replaced by the `storage` event), add-on date availability
  (REQ-34: always available unless `isAvailable` is false), the nightly expire / complete jobs (lazy on read), the
  payments table (recording the advance only sets `advanceAmount`)
- Per-hall slots need `time_slots.hall_id` + a per-hall overlap constraint + migration (srs-alignment #19)
- Booking UI-only data with no column: `eventName`, `hostName`, `hostPhone`, `specialRequests`, `advanceDue`, and
  `halls.hallCharge` (hall hire; the host wizard doesn't ask for it, so listings show "Included")
- Slot times are the Lunch / Evening presets for every venue; a listing's own slot times, working days and disabled
  slots (wizard booking rules) aren't applied yet. Today's slots stay bookable after their start time
- Explore's date filter still uses `venue.bookedDates`, not the per-hall slot store
- Booking drafts are shared by every tab of one venue (holds are per tab): if two tabs book the same venue, the tab
  that sends its request first clears the other's draft, and that tab returns to the venue page
- Invitations (srs-alignment #21): the mock store is per browser, so a guest's reply only reaches the host when both use
  the same browser (the demo). Needs `POST /i/:token/rsvp`. Proposed columns (`invitations.template`, `event_type`,
  `host_names`, `rsvp_by`, `contact_phone`, `rsvps.party_size`) aren't in `db/schema.sql` yet. Not built: host-added
  guest list with per-guest `/i/:token` links + WhatsApp Business delivery status and "No reply" count (REQ-37),
  per-guest check-in QR + attendant scanning (REQ-40/41, SSD6), offline caching of the guest page (PWA), notifying
  the host on a new reply. Anyone with the link who knows a guest's phone number can change that guest's reply
  (per-guest tokens fix this). Changing the invitation changes the QR (the card is in the hash)
- Oxlint doesn't flag undeclared identifiers in this config (a missing import only showed up in review); consider
  enabling `no-undef`
- "Report this listing": saved to the admin mock store, but there is no `listing_reports` table yet (proposed:
  `report_id, venue_id, reporter_id NULL, reason, details, status dispute_status, resolution, admin_id, created_at,
  resolved_at`). Decide before the server work
- `/owner`: not built. Owners only see their last submission's status on `/host/submitted` (one per browser)
- Admin: no auth (`TODO(auth)` RequireRole('admin') in `app/adminRoutes.jsx` / `app/router.jsx`); `CURRENT_ADMIN` is
  a demo account; "Sign out" and "create admin" aren't built. Notifications to owners (REQ-7/10/45) aren't sent
- Admin mocks: users, disputes, bookings-this-month KPI, AI image scores, flagged images (seeded from gallery
  photos), catalogue "listed" dates for the chart. Uploaded listing photos get a mock AI score on the review page but
  never enter the flagged queue. Flagged-image decisions don't change any venue's gallery
- Admin "Remove" user is a soft delete flag only; suspended users can still use the public site (no accounts)
- Listings submitted from this browser live in this browser only (localStorage + IndexedDB); "Reset demo data" in
  admin Settings restores the seeds
- Host wizard: no auth guard yet (`TODO(auth)` in `pages/HostWizard.jsx` and `app/router.jsx`); submit goes to the
  mock listings store (not a server). Drafts are per browser (localStorage + IndexedDB)
- Host wizard UI-only data needing columns or a decision: venue category, listing headline, Google Maps link, hosting
  since, landmark + minutes + directions, parking spaces, house rules; hall standing capacity / setting / AC /
  length / width / ceiling / description / floor plan file / zones / walkthrough mode + link; bridal suite; photo
  `category` + `hall_id` on `venue_images`; `walkthrough_assets` has no `hall_id`; menu section order (no sort column
  on `menu_items`); custom-menu note; booking rules (days, slot times, advance %, cancellation policy incl. custom
  tiers + note)
- Floor plan PDFs and walkthrough uploads aren't covered by the SRS file rules beyond REQ-11 (3D/360); the 10 MB
  plan limit is our own choice
- `HallModel3D` chunk is ~950 KB (three.js itself; react-three-fiber imports the whole library). It only loads when a
  3D view opens. A generated model is a simple box room, not a real scan
- Venue page doesn't show add-ons, the cancellation policy, or Exterior/Seating photo categories yet (wizard collects
  them)
- Host wizard drafts: no cross-tab sync (two tabs overwrite each other). v1 drafts migrate to v2; any other unknown
  version is still dropped
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
- Mock hall fields `standingCapacity, lengthFt, widthFt, ceilingFt, description, floorPlanUrl, zones, walkthrough` are
  UI-only, not in the table
- `db/schema.sql` changes are not load-tested (no Postgres/Docker on this machine)
- UI-only data not in the ERD: rating categories, host info, parking, event notes, gallery categories, bridal suite
- Google reviews, weather, WhatsApp invites, QR check-in, AI image check: not started. 3D: generated model done;
  viewers for uploaded .glb / 360° files not built yet
- PWA (manifest, service worker) not set up
- No tests (Vitest/Supertest/Playwright suites) yet

### Known UI caveats

- Booking panel only has ~19px to spare at 1280×720. On shorter screens it pins under the header and the bottom can be
  cut off (by design, no internal scroll)
- Ask AI launcher can overlap the help card / report link under the booking panel on short screens
- After closing the chat with Esc, the compact launcher stays expanded (keyboard focus) until focus moves
- Google Maps embed renders blank in headless screenshots. Its `src` is verified, not the visual
- Lightbox backdrop is 95% opaque
- At 320px the landing search bar overflows by ~16px (it did before the login work; the header fits)

### Next steps (suggested)

- ~~Scaffold `server/`~~ done 2026-11-21 (Phase 0 + Phase 1 auth/profile API). Next on the server: seed script, OTP
  password reset, then the venues module (Phase 2) with ownership checks
- Decide whether halls should be independently bookable (per-hall slots)
- Venue search API (`GET /api/venues`) matching `searchVenues()` filters, plus search history
- Booking engine on the server (slots per hall, holds with `SELECT ... FOR UPDATE`, quotations) with Vitest tests;
  then swap the bodies in `api/bookings.js`
- Owner dashboard: booking requests (accept / reject) and payments; then remove the dev-only buttons on `/bookings`
- Auth (JWT + refresh) and role dashboards (`/app`, `/owner`, `/decorator`); then put `/admin` behind RequireRole and
  swap `api/admin.js` / `api/listings.js` bodies for `/api/admin/*` and `/api/owner/venues` calls
