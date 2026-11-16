# UI and dashboards

The UI is designed in **Figma**. When a Figma link is given, match it (use the Figma MCP if connected: `claude mcp add --transport http figma https://mcp.figma.com/mcp`, then `/mcp` to sign in). When there's no design for a screen, follow this doc and keep it consistent with existing screens.

## Principles (NFR-3, NFR-5)

- Mobile-first. Most users are on phones and slow mobile data. Design at 375 px, then scale up.
- Few steps to book: search → venue → pick slot → confirm.
- Plain English, short labels. Errors say what went wrong and how to fix it.
- PKR formatting: `Rs 350,000` (en-PK grouping). Dates: `Sat, 20 Dec 2026`. Times: `7:00 PM`.
- Accessible: semantic HTML, labels on inputs, focus states, 4.5:1 contrast, keyboard usable, alt text on images.
- Loading skeletons, empty states with a next action, optimistic UI only where the server can't reject it (never for holds/bookings).
- PWA: manifest, icons, service worker (vite-plugin-pwa), offline fallback; cache the guest invitation page so it opens without internet (EUC-27 2.1).

## Brand

- Name: **MarkieSharkie**. Logo: tent in a dome with "MARKIE SHARKIE" text (from the SRS cover).
- Palette: **maroon, confirmed by the Figma landing page**: `primary` #7a1731, `accent` (blush border) #d1bfc2, `surface` #f7f5f3, `muted` #6c6c6c, plus `ink` #374151 for body text. Colours are Tailwind theme tokens in `client/src/index.css` (`@theme`), so changing palette is one file. `danger`, `success` and `warning` aren't in the design yet; add them there when a screen needs them.
- Hero copy: **"Find and book the perfect venue for your event, in minutes."** Sub: **"Compare venues, check availability, and book online. No calls, no visits."** Hero has a search bar: location, date, guests.

## Slot status colours (used everywhere the calendar appears)

| Status | Look |
|---|---|
| Available | success colour, clickable |
| Held | warning colour, "Held" + countdown if it's your hold |
| Booked | muted/grey, not clickable |
| Blocked | striped/grey, not clickable |

## Dashboards per role

### Public / Customer (`/`, `/app`)
- Home: hero search, recommended venues (REQ-15), popular venues.
- Search results: filters (city, event type, date, guests, budget), sort, venue cards, compare tray (select 2+ → compare page, REQ-14).
- Venue page: gallery, facilities, packages, menus, add-ons, live calendar (REQ-16), 3D/360 tab (REQ-11), platform + Google reviews (REQ-43), "Request quotation" and "Book" buttons.
- Booking flow: hold banner with countdown → event type + guest count + menu + add-ons → running total → confirm.
- My bookings: status timeline (Requested → Held → Confirmed → Completed), payments + balance (REQ-26), cancel (REQ-22), quotations thread, weather advisory banner (REQ-46), decor (browse decorators, AI previews), invitation (create, guests, send, RSVP summary, QR toggle, attendants, attendance count), review (after completed), raise dispute.
- Chat assistant: floating button → chat panel with venue cards in replies (REQ-27).
- Notifications bell (REQ-45), profile with search history (REQ-4).

### Venue Owner (`/owner`)
- Overview: today's/upcoming events, pending requests, outstanding balances.
- Venues: list with approval status + rejection reason; create/edit form; images with per-image verification status; walkthrough upload; stage photos; menus + items; add-ons.
- Calendar: month/week grid per venue, create slots, block/unblock, live updates.
- Booking requests: accept / confirm / reject.
- Offline booking form (REQ-23).
- Quotations inbox: reply, counter.
- Payments: record advance/balance, history per booking.

### Decorator (`/decorator`)
- Profile + portfolio + packages (REQ-29).
- Requests inbox: brief, event details, shared AI previews; send/revise quote (REQ-30).
- Agreed jobs (decor bookings) with advance paid / balance.

### Admin (`/admin`)
- Overview: counts of pending venues, flagged images, flagged reviews, open disputes, users.
- Pending venues: details + images, approve / reject with reason (REQ-7).
- Moderation: flagged images (with AI score) and flagged reviews (REQ-10, REQ-44).
- Users: search, filter by role/status, suspend/unblock/remove with active-booking warning (REQ-47), create admin.
- Bookings oversight + disputes (Open / Under Review / Resolved) with linked quotations + payments (REQ-48).
- Audit log.

### Guest (`/i/:token`, no login)
- Invitation card, event date/time, venue name + map, "Get directions" (opens Google Maps), Yes/No RSVP (changeable), QR code if enabled. Must work offline once loaded.

### Attendant (`/checkin`, no login)
- Enter event access code → camera QR scanner (e.g. `@zxing/browser` or `html5-qrcode`) → big full-screen result: green VALID, red INVALID, amber DUPLICATE (REQ-41) → live attendance count.

## Frontend conventions

- React Router with a layout per role and a `RequireRole` guard (UI only; the server is the real guard).
- TanStack Query for server state; no global store for server data. Small auth store (Zustand or context) for the current user.
- Forms: React Hook Form + Zod (share schemas with the server where practical).
- Socket: one client instance in `lib/socket.js`; calendar components subscribe to `slot:updated` and update the query cache.
- Components: `components/ui/` primitives; feature components live in `features/<module>/`.
- 3D: react-three-fiber + drei; `.glb` via `useGLTF`, 360 images via a sphere with inverted normals. Lazy-load the 3D bundle.
- No `dangerouslySetInnerHTML` (chatbot output included).
