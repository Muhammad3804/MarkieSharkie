# Architecture

Matches SRS Figures 15 (Component), 16 (Layer) and 17 (Deployment).

## Repo layout (monorepo)

```
markiesharkie/
├── CLAUDE.md
├── docs/                    # these context docs + docs/srs/ (SRS PDF, diagrams)
├── db/
│   ├── schema.sql           # full schema (ERD + [SRS] additions)
│   └── seeds/
├── server/                  # Node.js + Express API + Socket.io
│   ├── migrations/          # node-pg-migrate
│   ├── src/
│   │   ├── app.js           # express app (no listen) - imported by tests
│   │   ├── server.js        # http server + socket.io + jobs
│   │   ├── config/          # env parsing (zod), constants (SLOT_HOLD_MINUTES...)
│   │   ├── db/              # pg Pool, withTransaction(fn) helper
│   │   ├── middleware/      # auth, requireRole, validate, rateLimit, errorHandler
│   │   ├── realtime/        # socket.io setup, rooms, emit helpers
│   │   ├── jobs/            # node-cron jobs (see booking-engine.md)
│   │   ├── integrations/    # llm, embeddings, imageDetection, imageGeneration, whatsapp, googlePlaces, weather, storage
│   │   └── modules/
│   │       ├── auth/        # routes.js controller.js service.js repository.js schemas.js *.test.js
│   │       ├── users/
│   │       ├── venues/      # venues, images, walkthroughs, stage photos, menus, add-ons
│   │       ├── search/      # search, compare, recommendations
│   │       ├── booking/     # slots, holds, bookings, offline bookings
│   │       ├── quotations/
│   │       ├── payments/
│   │       ├── chatbot/
│   │       ├── decor/       # decorator profiles, packages, decor quotations, previews, decor bookings
│   │       ├── invitations/ # invitations, guests, RSVP, QR, attendants, check-in
│   │       ├── reviews/
│   │       ├── notifications/
│   │       ├── weather/
│   │       └── admin/       # users, approvals, moderation, disputes, audit log
│   └── tests/               # integration tests against a real test DB
├── client/                  # React + Vite + Tailwind PWA
│   ├── public/              # manifest.webmanifest, icons
│   └── src/
│       ├── app/             # router, providers, layouts per role
│       ├── features/        # mirrors server modules: booking/, venues/, chatbot/...
│       ├── components/ui/   # Button, Input, Card, Modal, Badge, Calendar, EmptyState...
│       ├── lib/             # api client, socket client, auth store, formatters (PKR, dates)
│       └── styles/
└── e2e/                     # Playwright tests
```

## Layers (Figure 16)

| Layer | Lives in | Rule |
|---|---|---|
| Presentation | `client/` | No business rules beyond form validation and display. |
| API | `server/src/modules/*/routes.js`, `controller.js` | Auth, role check, Zod validation, call one service, shape response. |
| Business services | `service.js` | All rules (REQ-x). Owns transactions. Calls repositories and integrations. |
| Data access | `repository.js` | SQL only. Parameterized queries. snake_case ↔ camelCase mapping. |
| Integrations | `server/src/integrations/` | One adapter per external service, with timeout, retry where safe, and a fake for dev/tests. |
| Data | PostgreSQL + pgvector + PostGIS, file storage | |

## Component interfaces (Figure 15) → code

| Interface | Implemented by |
|---|---|
| ICustomerAPI / IOwnerAPI / IDecoratorAPI / IAdminAPI / IGuestAPI | REST routes under `/api`, grouped by role |
| ILiveUpdates / ISlotEvents | Socket.io, room `venue:<venueId>`, user room `user:<userId>` |
| ILanguageModel | `integrations/llm.js` |
| IImageDetection | `integrations/imageDetection.js` |
| IImageGeneration | `integrations/imageGeneration.js` |
| IMessaging | `integrations/whatsapp.js` |
| IPlaceReviews | `integrations/googlePlaces.js` |
| IWeatherForecast | `integrations/weather.js` |
| ISQL | `server/src/db` |
| IFileStorage | `integrations/storage.js` (S3-compatible or Cloudinary; local disk in dev) |

## Real-time

- Client joins `venue:<id>` when a venue calendar is open; leaves on unmount.
- Server emits `slot:updated { slotId, venueId, status, heldUntil? }` after commit.
- Authenticated sockets also join `user:<userId>` for `notification:new`.
- Socket auth: access token in the handshake `auth` field; verify the JWT the same way as HTTP.
- On `disconnect`, release that user's active holds (REQ-18 "customer leaves").
- Target: change visible to others in < 2 s (NFR-1).

## AI features

### Chatbot (REQ-27, REQ-28, Figure 21)
1. Save the user message.
2. LLM call #1 (small, JSON mode): extract filters `{city, eventType, date, guests, budgetMax}` from the text plus session `context`.
3. Retrieve: SQL filter on approved/active venues (+ free on date if given) **and** rank by `description_embedding <=> embed(user text)`. Top 5-8.
4. LLM call #2: answer using ONLY the retrieved venue facts (name, city, capacity, price, facilities, free slots). System prompt forbids inventing venues, prices or availability.
5. Save assistant message; return reply + venue cards (ids) for the UI.
6. Timeout 10 s (NFR-1). On failure: "Assistant is unavailable right now, try the normal search" (REQ-28).

### Recommendations (REQ-15)
Cosine similarity between `customers.preference_embedding` and venue embeddings, filtered to approved/active; no history → most booked / best rated in the customer's city.

### Image verification (REQ-9, Figure 22)
Upload → store file → `venue_images` `pending` → call detection API (async job) → `genuine` (publish) or `flagged` (unpublished, admin notified) → owner notified per image. API down → stays `pending`, owner told to retry.

### Decor preview (REQ-31 to REQ-33)
Stage photo + style prompt → image-generation API (image-to-image / inpainting) → store N results in `decor_previews`. Retry on failure. Stretch goal if time is short.

## External services: rules

- Every adapter: timeout (5-10 s), typed errors, never throws raw API errors to the client.
- Every adapter has a **fake** used when its API key is missing, so the app runs end to end without paid keys. Log clearly `"[weather] using fake adapter"`.
- Keys only in server `.env`.

## Deployment (Figure 17)

| Part | Where |
|---|---|
| Frontend PWA | Vercel (or Netlify) |
| API + Socket.io | Render / Railway / AWS (single instance is fine for FYP; sticky sessions if more) |
| DB | Managed Postgres with pgvector + PostGIS (Neon/Supabase/Render) |
| Files | S3-compatible bucket or Cloudinary |
| Backups | Provider daily backup (NFR-2) |

HTTPS everywhere (NFR-4). CORS allows only the frontend origin.
