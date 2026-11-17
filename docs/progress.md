# Progress log

Read this at the start of every session. Update it at the end of every task (changelog entry, plus Current state,
Decisions and TODO if they changed) and commit it with the code.

Last updated: 2026-11-17

## Current state

### Stack (client only so far)

- Vite 8, React 19 (hoists `<title>`/`<meta>` from components), Tailwind CSS 4 (`@tailwindcss/vite`, CSS-first `@theme`)
- React Router 7 data router (`createBrowserRouter`), `motion` 14 (`motion/react`) for the chat morph
- Leaflet 1.9 + OpenStreetMap tiles (no API key) for the Explore map and the host pin, lazy-loaded
- three 0.187 + @react-three/fiber 9 for the hall 3D model (`features/venues/HallModel3D.jsx`), lazy-loaded. Uses three's
  own `OrbitControls`/`EdgesGeometry` (drei removed: it added weight for two helpers)
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
| `/bookings` | `pages/MyBookings.jsx` | lazy; My bookings with status badges, cancel, dev-only owner actions; `TODO(auth)` customer |

Outside `PublicLayout` (own full-screen shell, no header/footer/chat):

| Path | Page | Notes |
|---|---|---|
| `/host/new` | `app/HostResumeRedirect.jsx` | redirects to the draft's `lastStep` or `about` |
| `/host/new/:step` | `pages/HostWizard.jsx` | listing wizard; `TODO(auth)` venue_owner guard |
| `/venues/:id/book/:step` | `pages/BookingFlow.jsx` | booking flow (`selection`, `details`, `add-ons`, `price`, `review`, `confirmation?ref=`); `TODO(auth)` customer |
| `/admin/*` | `features/admin/AdminLayout.jsx` + `pages/admin/*` | admin dashboard, lazy (`app/adminRoutes.jsx`); `TODO(auth)` RequireRole('admin') |

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
- `src/features/booking/`: flow steps, draft store, hold helpers, pricing/refund maths, calendar nav, live availability hook, .ics
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
- No migrations exist yet: schema changes before the first migration go into `db/schema.sql` only
- Photos: WebP only, lazy below the fold, width/height set
- Booking panel: no internal scroll, no price breakdown, one live total. Sticky behaviour is final (the breakdown
  lives in the booking flow's Price step)
- Slots are per hall (asked 2026-11-17, srs-alignment #19); the schema change waits for the server work
- Booking statuses stay the REQ-21 enum; UI labels only (asked 2026-11-17, srs-alignment #20)
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

## Changelog (newest first)

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

- No server, DB, auth or real API yet. Everything is mock data
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

### Next steps (suggested)

- Scaffold `server/` (Express, `pg`, node-pg-migrate, Zod, AppError) per docs/architecture.md and docs/build-plan.md
- Decide whether halls should be independently bookable (per-hall slots)
- Venue search API (`GET /api/venues`) matching `searchVenues()` filters, plus search history
- Booking engine on the server (slots per hall, holds with `SELECT ... FOR UPDATE`, quotations) with Vitest tests;
  then swap the bodies in `api/bookings.js`
- Owner dashboard: booking requests (accept / reject) and payments; then remove the dev-only buttons on `/bookings`
- Auth (JWT + refresh) and role dashboards (`/app`, `/owner`, `/decorator`); then put `/admin` behind RequireRole and
  swap `api/admin.js` / `api/listings.js` bodies for `/api/admin/*` and `/api/owner/venues` calls
