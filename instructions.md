# MarkieSharkie server: what's built, what's left, how to run it

Written 2026-11-21, after Phase 0 (server skeleton + database) and Phase 1 (auth + profile) on branch
`feat/server-auth`. For the full rules, see `CLAUDE.md`; for the running log, see `docs/progress.md`.

---

## 1. How to run the server

All commands work in **PowerShell** (Windows) and in bash (macOS / Linux). Use a normal terminal; see
"Troubleshooting" if you use Git Bash.

### One-time setup

1. **Install** Docker Desktop and Node.js 20 or newer.
2. **Create your `.env`** in the repo root (skip this if you already have one):
   ```powershell
   Copy-Item .env.example .env        # bash: cp .env.example .env
   ```
3. **Set a real JWT secret.** The server **refuses to start** while `JWT_ACCESS_SECRET=change-me`. Generate one:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Paste the output into `.env`: `JWT_ACCESS_SECRET=<the value>`. Never commit `.env`.
4. **Start the database** (Postgres 16 + pgvector + PostGIS). The first start creates the `markie_app` user, both
   databases (`markiesharkie`, `markiesharkie_test`) and the extensions:
   ```powershell
   docker compose up -d --wait db
   ```
5. **Install the server packages and create the tables:**
   ```powershell
   cd server
   npm install
   npm run migrate          # dev database
   npm run migrate:test     # test database
   npm run db:check         # should print markie_app, pgvector 0.8.0, PostGIS 3.5.x and a distance ~0.0085
   ```
6. **Create the first admin** (optional; admins can't sign up through the API, REQ-1):
   ```powershell
   npm run create-admin     # asks for name, email, mobile, city, password (hidden)
   ```

### Every day

```powershell
docker compose up -d --wait db     # from the repo root, if the DB isn't running
cd server
npm run dev                        # http://localhost:4000, restarts on file changes
```

Check that it works: open <http://localhost:4000/api/health>. You should see `{"status":"ok","db":"up"}`.

### Other commands (inside `server/`)

| Command | What it does |
|---|---|
| `npm start` | Run without auto-restart |
| `npm test` | All tests (Vitest + Supertest) against the **test** DB only. Takes ~5-6 min on Windows |
| `npx vitest run tests/login.test.js` | Run one test file (much faster while working) |
| `npm run lint` | ESLint, including a rule that blocks SQL built from values |
| `npm run format` / `npm run format:check` | Prettier fix / check |
| `npm run migrate:create -- add-something` | New `migrations/NNN_add-something.sql`. Also update `db/schema.sql` and `docs/database.md` |
| `docker compose down` | Stop the DB, keep the data |
| `docker compose down -v` | **Delete all local data** and start fresh (then run the migrations again) |

### Try the API by hand (PowerShell)

```powershell
$b = 'http://localhost:4000/api'
# Register (customer). Other roles: venue_owner (+ businessName, contactNumber), decorator (+ businessName, bio)
Invoke-RestMethod "$b/auth/register" -Method Post -ContentType 'application/json' -Body '{"role":"customer","name":"Ayesha Khan","email":"ayesha@example.pk","phone":"0300-1234567","password":"Shadi2025","city":"Faisalabad"}'
# Log in (email or mobile). Keeps the refresh cookie in $s
$login = Invoke-RestMethod "$b/auth/login" -Method Post -ContentType 'application/json' -Body '{"identifier":"0300-1234567","password":"Shadi2025"}' -SessionVariable s
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod "$b/me" -Headers $h
Invoke-RestMethod "$b/me" -Method Patch -Headers $h -ContentType 'application/json' -Body '{"city":"Lahore"}'
Invoke-RestMethod "$b/auth/refresh" -Method Post -WebSession $s     # new access token
Invoke-RestMethod "$b/auth/logout" -Method Post -WebSession $s      # 204
```

Every route, request body, response and error code is documented in **`server/openapi.yaml`**. You can open it in
<https://editor.swagger.io> (paste the file in) to read it as a page.

### Troubleshooting

| Problem | Fix |
|---|---|
| `[config] Invalid environment: JWT_ACCESS_SECRET ...` | Step 3 above: set a random 32+ character secret in `.env` |
| `db:check` / health says the DB is down | `docker compose up -d --wait db`, then try again |
| `relation "users" does not exist` | Run `npm run migrate` (and `npm run migrate:test` for tests) |
| `npm run ...` prints nothing and fails in **Git Bash** | Git Bash without `ComSpec` set can't run npm scripts. Use PowerShell, or run `export ComSpec='C:\Windows\system32\cmd.exe'` first |
| `npm install` fails building **argon2** | Keep `argon2` pinned at **0.44.0** in `server/package.json`. 0.45.2's Windows binary crashes |
| Tests refuse to run: "same database" | `TEST_DATABASE_URL` must point at `markiesharkie_test`, not the dev DB |
| Port 4000 already in use | Change `PORT` in `.env` (and `VITE_API_URL` for the client) |

---

## 2. What was created

### Database

- `server/migrations/001_initial-schema.sql`: a byte-identical copy of `db/schema.sql` (a test checks this). It is
  now **applied** to both local databases: 40 tables plus `pgmigrations`, first time the schema has run on a real
  Postgres. `db/schema.sql` itself was not changed.

### Server (`server/`)

| Path | What it is |
|---|---|
| `package.json`, `package-lock.json` | Scripts and dependencies (Express 4, pg, node-pg-migrate, Zod 4, argon2 0.44.0, jsonwebtoken, helmet, cors, cookie-parser, express-rate-limit, pino) |
| `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.js` | Tooling |
| `src/app.js` | Express app (no `listen`, so tests can use it): helmet, CORS (client origin only), 1 MB JSON limit, cookies, request logs, routes, 404, errors |
| `src/server.js` | Starts the HTTP server; clean shutdown |
| `src/config/env.js` | Reads `.env` with Zod; refuses to start on missing or weak values |
| `src/config/constants.js` | Roles, home pages per role, event types, cookie name, JWT issuer / audience |
| `src/config/dotenv.js`, `src/config/sameDatabase.js` | Loads the root `.env`; dev-vs-test DB guard |
| `src/db/pool.js`, `src/db/withTransaction.js` | One pg pool; BEGIN / COMMIT / ROLLBACK helper |
| `src/lib/` | `AppError`, logger (hides passwords, tokens, phones), shared Zod field rules (phone, email, password...), pg unique-error mapping |
| `src/middleware/` | `errorHandler`, `notFound`, `validate`, `authenticate`, `requireRole`, `rateLimit` |
| `src/modules/auth/` | Register, login, refresh, logout: routes, controller, service, repository (SQL), schemas, tokens |
| `src/modules/users/` | Profile (`/me`), past searches, bookings: routes, controller, service, repository, schemas |
| `scripts/` | `migrate.js`, `createMigration.js`, `dbCheck.js`, `createAdmin.js` |
| `openapi.yaml` | OpenAPI 3.1 doc for every route and error code |
| `tests/` | 12 test files, 182 tests (see below) |

### API routes

| Route | Who | What (SRS) |
|---|---|---|
| `GET /api/health` | anyone | Checks the API and DB |
| `POST /api/auth/register` | anyone (rate limited) | Create a customer / venue owner / decorator account; then go to login (EUC-01, REQ-1) |
| `POST /api/auth/login` | anyone (rate limited) | Email or mobile + password; 5 wrong tries lock it for 15 min; suspended accounts blocked (EUC-02, REQ-2, REQ-3) |
| `POST /api/auth/refresh` | refresh cookie | New access token; ends after 30 min without a refresh (REQ-2) |
| `POST /api/auth/logout` | refresh cookie | Ends the session (EUC-02 step 7, UC-03) |
| `GET /api/me` | any logged-in user | My profile (EUC-03) |
| `PATCH /api/me` | customer, venue owner, decorator | Edit name, phone, city and role details / preferences (EUC-03) |
| `GET /api/me/searches` | customer | My past searches (REQ-4) |
| `GET /api/me/bookings` | customer | My bookings (REQ-4) |

### Tests (all passing: 12 files, 182 tests, run 2026-11-21)

`validators`, `env`, `infra` (health, errors, CORS, transactions, migration copy, no secrets in logs), `register`,
`login` (incl. lockout), `refresh-logout` (rotation, inactivity, reuse detection), `auth-middleware` (bad / forged
tokens, suspended users, roles), `me`, `me-history`, `createAdmin`, `rateLimit`, `openapi` (every route documented).
Lint and Prettier: clean. A manual smoke test of every route against the real server also passed.

### Docs updated

`CLAUDE.md` and `README.md` (Commands), `.env.example` (new variables), `.gitignore` (`node_modules/`, `coverage/`),
`docs/progress.md`, `docs/build-plan.md`, `docs/database.md`, `docs/api-and-security.md`, `docs/architecture.md`,
`docs/project-map.md`, `docs/srs-alignment.md` (new decisions #23 to #26).

### Decisions made (srs-alignment #23 to #26)

| # | Decision |
|---|---|
| 23 | No `/auth/lookup`: login gives the same error for "no such account" and "wrong password" |
| 24 | Admins can view `GET /me` but not edit it (EUC-03 actors are customer / owner / decorator) |
| 25 | Login accepts email **or** mobile (REQ-2 wins over EUC-02's "email") |
| 26 | Refresh tokens are single-use; reusing one logs that user out everywhere. The client must refresh one tab at a time |

---

## 3. What's remaining

### Server, Phase 0 / Phase 1 leftovers

- [ ] **Seed script** (`db/seeds/`): a demo user per role, ~20 venues, slots for 60 days (build-plan Phase 0)
- [ ] **Password reset by one-time code** (REQ-2): 6-digit code, hashed, 10 min, 5 tries, rate limited; the
      `password_reset_codes` table already exists
- [ ] Change password, change email
- [ ] **Account deletion** with anonymised name / email / phone (NFR-8, REQ-47)
- [ ] **Admin user management**: suspend, unblock, remove, create other admins, each written to `admin_audit_log` (NFR-4)
- [ ] Ownership helpers (e.g. "owner can only touch their own venue"), built with the venue and booking modules

### Client (not connected to the server yet; it still uses browser mocks)

- [ ] Replace `client/src/api/auth.js` with real API calls; keep the access token in memory only
- [ ] Login modal: one "phone or email + password" step instead of the email-first "Welcome back / No account" step (#23)
- [ ] Sign-up: role picker plus business fields for venue owners and decorators
- [ ] Refresh the token **one tab at a time** (#26), and while the user is active (inactivity counts from the last refresh)
- [ ] Profile page (`/me`), role dashboards (`/app`, `/owner`, `/decorator`), `RequireRole` on `/admin` and `/host/new`

### Later phases (docs/build-plan.md)

Phase 2 venues and approval -> Phase 3 search and recommendations -> **Phase 4 booking engine (most important)** ->
Phase 5 quotations and payments -> Phase 6 notifications and reviews -> Phase 7 AI chatbot -> Phase 8 invitations,
WhatsApp, QR check-in -> Phase 9 decor -> Phase 10 weather and admin -> Phase 11 polish and deploy.
Schema changes already decided but not made yet: per-hall slots (#19) and invitation columns (#21).

### Things to know

- **Deployment:** the refresh cookie is `SameSite=Strict`, so the PWA and the API must be on the same site in
  production (e.g. `app.<domain>` and `api.<domain>`). Set `TRUST_PROXY=1` behind a proxy.
- **Slow tests on Windows:** each test resets the DB with `TRUNCATE ... CASCADE` (~2.4 s on Docker Desktop). A
  `DELETE`-based reset would take ~45 ms; say the word if you want to switch.
- **Not committed yet** when this file was written; nothing has been pushed.
