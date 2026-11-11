# MarkieSharkie

Online marquee and event-venue discovery, booking and coordination platform for Pakistan.
Final Year Project, FAST NUCES Chiniot-Faisalabad 

It is a **two-sided booking marketplace** (think Airbnb for marquees), not e-commerce. The SRS is the contract the FYP panel grades against, so features must match it.

## Source of truth (in this order)

1. `docs/srs/SRS.pdf` and `docs/requirements.md` (REQ-1 to REQ-48, NFR-1 to NFR-8, EUC-01 to EUC-35)
2. `db/schema.sql` (the ERD from SRS Figure 6, plus marked `[SRS]` additions)
3. These context docs
4. Your own judgment

If code, a request, or a doc conflicts with the SRS, **stop and say so** instead of silently picking one. Known gaps between the SRS text and its diagrams are already resolved in `docs/srs-alignment.md`; follow those decisions.

## Rules

- **Database access:** raw SQL through `pg` only, with numbered placeholders (`$1`, `$2`, …) and values passed in the params array. Never build SQL by string concatenation or template literals.
- **No ORM or query builder:** no Prisma, Drizzle, Kysely, Sequelize, TypeORM or similar.
- **No Supabase:** no Supabase client, Supabase Auth, or `auth.uid()` RLS policies.
- **No Next.js:** no App Router, Server Components, Server Actions or `NEXT_PUBLIC_*` env vars.

## Precedence

This file and `docs/` override any installed skill or agent in `.claude/`. When a skill or agent suggests something that conflicts with them, follow this file and `docs/` and ignore that part of the skill or agent.

## Read before you work on...

| Area | Read first |
|---|---|
| Anything (first time in a session) | `docs/requirements.md` |
| Folder layout, stack, services, external APIs | `docs/architecture.md` |
| Tables, enums, migrations, queries | `docs/database.md`, `db/schema.sql` |
| Time slots, holds, bookings, quotations, payments | `docs/booking-engine.md` |
| Routes, auth, RBAC, validation, errors | `docs/api-and-security.md` |
| Pages, dashboards, components, styling | `docs/ui-and-dashboards.md` |
| What to build next | `docs/build-plan.md` |
| SRS vs ERD/state-machine decisions | `docs/srs-alignment.md` |

## Stack (fixed by the proposal and SRS, do not swap without asking)

- **Frontend:** React + Vite + Tailwind CSS, installable **PWA** (no native apps). React Router, TanStack Query, Socket.io client, Three.js (via react-three-fiber) for the 3D walkthrough.
- **Backend:** Node.js + Express REST API, Socket.io for live availability. JavaScript (ES modules). Zod for validation.
- **Database:** PostgreSQL 15+ with **pgvector** (embeddings) and **PostGIS** (venue location). Raw SQL via `pg` + `node-pg-migrate`. No ORM that hides SQL from us; the booking engine needs explicit transactions and row locks.
- **Auth:** JWT access token (short-lived) + refresh token (hashed in DB), role-based access control.
- **AI:** LLM API called server-side only; RAG over pgvector. Image detection API, image generation API.
- **Integrations:** WhatsApp Business API (invites + Yes/No RSVP), Google Places (reviews), OpenWeatherMap (forecast), QR code library, file storage for images/3D assets.
- **Currency:** PKR only. **Country:** Pakistan only. **Language:** English UI.

## Actors and roles

| Actor | Has account? | Role value | Dashboard |
|---|---|---|---|
| Customer | yes | `customer` | `/app` |
| Venue Owner | yes | `venue_owner` | `/owner` |
| Decorator | yes | `decorator` | `/decorator` |
| Admin | yes (created only by another admin) | `admin` | `/admin` |
| Guest | **no**, uses invite token link | none | `/i/:token` |
| Attendant | **no**, uses event access code | none | `/checkin` |

## Non-negotiable rules

1. **No double booking, ever** (REQ-20, NFR-2). Every slot or booking state change runs in one DB transaction with `SELECT ... FOR UPDATE`. The DB also enforces it (`bookings_one_active_per_slot`, `time_slots_no_overlap`). Never "check then insert" without a lock. See `docs/booking-engine.md`.
2. **Payments are tracked, never processed** (REQ-25, Scope 2.4). No payment gateway, no card fields, no money movement.
3. **API keys stay on the server** (NFR-4). The frontend never calls OpenAI/Gemini, WhatsApp, Google, weather, or image APIs directly.
4. **External services failing must not stop booking** (NFR-2). Wrap every external call with a timeout and a graceful fallback (chatbot: "use normal search"; Google reviews: show platform reviews only; image check: stay `pending`; weather: retry later).
5. **AI only suggests** (Scope 2.4). The customer always makes the final decision. AI images flagged as fake are never auto-deleted; they go to admin review.
6. **Every request is authorized by role AND ownership.** An owner can only touch their own venues; a customer only their own bookings; a guest only their own invitation via token; an attendant only their assigned event.
7. **Validate all input** with Zod at the route boundary. Pakistani mobile numbers: accept `03XX-XXXXXXX` or `+92 3XX XXXXXXX`, store as `+923XXXXXXXXX`. Passwords: min 8 chars, letters and digits.
8. **Admin actions are written to `admin_audit_log`** (NFR-4).
9. **Guest phone numbers and details** are visible only to the inviting customer (and the venue owner where needed) (NFR-8).
10. **Schema changes:** never edit `db/schema.sql` without also adding a migration and updating `docs/database.md`. Never rename or remove an ERD column; it is in the graded SRS.

## Conventions

- DB: `snake_case` tables (plural) and columns. API JSON: `camelCase`. Map at the repository layer.
- IDs are UUIDs. Timestamps are `timestamptz`, stored UTC, shown in Asia/Karachi.
- Money is `numeric(12,2)` in the DB and a string in JSON (never JS float math for money; use integer paisa or a decimal lib).
- Backend layering: `routes -> controllers -> services -> repositories (SQL)`. Business rules live in services. Controllers stay thin.
- Errors: throw `AppError(status, code, message)`; one error middleware formats `{ error: { code, message, details? } }`.
- Real-time: emit Socket.io events only **after** the DB transaction commits.
- Feature folders, not type folders, once a module grows (e.g. `server/src/modules/booking/`).
- Small, targeted diffs. Do not rewrite files you were not asked to touch.
- Write tests for every service with business rules (booking engine, quotations, payments, QR validation, RBAC). Use Vitest + Supertest; Playwright for end-to-end flows.

## Commands

> Update this section once the projects are scaffolded.

```bash
# database
createdb markiesharkie && psql -d markiesharkie -f db/schema.sql
# server
cd server && npm install && npm run dev       # http://localhost:4000
cd server && npm test
# client
cd client && npm install && npm run dev       # http://localhost:5173
cd client && npm run build
# e2e
npx playwright test
```

## Environment

- Copy `.env.example` to `.env`; never commit `.env`.
- If `ANTHROPIC_API_KEY` is set in your shell, Claude Code bills the API instead of the Pro plan. Unset it.

## Working style the team wants

- Casual, direct, concise. Tables over walls of text.
- Push back honestly if a request is a bad idea or conflicts with the SRS.
- Build real working code, not placeholders. If something is stubbed (e.g. an external API without a key), say so clearly and make it swappable.
- Before finishing a task: run the tests and the linter, and say what you ran and what passed.
