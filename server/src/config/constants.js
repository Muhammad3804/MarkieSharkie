// Values fixed by the SRS / CLAUDE.md rather than by deployment (those live in env.js).

export const ROLES = Object.freeze(['customer', 'venue_owner', 'decorator', 'admin'])

// REQ-1: public registration never creates an admin. Admins come from `npm run create-admin` (and later from an admin).
export const PUBLIC_ROLES = Object.freeze(['customer', 'venue_owner', 'decorator'])

// EUC-02 step 6 "open the home page for that role" (CLAUDE.md "Actors and roles").
export const HOME_PATHS = Object.freeze({
  customer: '/app',
  venue_owner: '/owner',
  decorator: '/decorator',
  admin: '/admin',
})

// db/schema.sql `event_type` enum (docs/database.md "Enums").
export const EVENT_TYPES = Object.freeze([
  'wedding',
  'mehndi',
  'barat',
  'walima',
  'engagement',
  'birthday',
  'corporate',
  'conference',
  'religious',
  'other',
])

export const JWT_ISSUER = 'markiesharkie-api'
export const JWT_AUDIENCE = 'markiesharkie-client'

export const REFRESH_COOKIE = 'ms_refresh'
export const REFRESH_COOKIE_PATH = '/api/auth'

export const PAGINATION = Object.freeze({ defaultPageSize: 20, maxPageSize: 100 })
