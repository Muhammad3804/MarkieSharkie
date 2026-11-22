import { normalizeEmail } from '../lib/accountRules.js'
import { normalizePkMobile } from '../lib/phone.js'
import { ApiError, apiFetch, configureAuth, setAccessToken } from './http.js'

// Real auth against the server (docs/api-and-security.md "Authentication", server/openapi.yaml):
//   POST /api/auth/register  -> 201, no session (so signUp logs in right after, to resume the trigger's action)
//   POST /api/auth/login     -> { accessToken, user, homePath } + httpOnly refresh cookie (7 days)
//   POST /api/auth/refresh   -> same shape; the refresh token rotates and is single-use (srs-alignment #26)
//   POST /api/auth/logout    -> 204, cookie cleared
//   GET  /api/me             -> { user }
// The access token stays in memory (api/http.js); a page load gets a new one from the refresh cookie.
//
// Not on the server yet: Google / Apple sign-in and password reset (they throw NOT_AVAILABLE), and an account
// lookup (srs-alignment #23: login gives one error for "no account" and "wrong password").
//
// "Keep me logged in" off: the server always sets a 7-day cookie, so the client marks the login as "this browser
// session only" (a localStorage flag plus a session cookie on this origin, which the browser drops when it closes).
// On the next start the flag is there but the session cookie isn't, so the session is ended instead of restored.
// TODO(server): accept `remember` on /auth/login and send a session cookie (no Expires) when it is false.

export const RESET_CODE_MINUTES = 10
export const RESEND_SECONDS = 30

export class AuthError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.details = details
  }
}

// --- Session store (read with useSyncExternalStore) --------------------------------------------------------------

// { ready, user }: ready is false until the first restore on page load has finished.
let snapshot = { ready: false, user: null }
const listeners = new Set()

function setSnapshot(next) {
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

export function subscribeAuth(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getAuthSnapshot = () => snapshot

// The signed-in user, or null. Sync (api/bookings.js and the booking draft read it). `userId` mirrors `id` for the
// code that was written against the mock.
export const getSessionUser = () => snapshot.user

function toUser(user, homePath) {
  if (!user) return null
  return {
    id: user.id,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    city: user.city ?? null,
    role: user.role,
    createdAt: user.createdAt ?? snapshot.user?.createdAt ?? null,
    homePath: homePath ?? snapshot.user?.homePath ?? null,
  }
}

const unauthorizedListeners = new Set()
// onUnauthorized(fn): the session ended while the person was using the app (refresh failed). Returns unsubscribe.
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

// --- Other tabs ---------------------------------------------------------------------------------------------------

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('markiesharkie:auth')
const broadcast = (type) => channel?.postMessage({ type })
channel?.addEventListener('message', ({ data }) => {
  if (data?.type === 'logout' && snapshot.user) endSession()
  if (data?.type === 'login' && !snapshot.user) refreshAccessToken().catch(() => {})
})

// --- "Keep me logged in" ------------------------------------------------------------------------------------------

const SESSION_ONLY_KEY = 'markiesharkie:auth-session-only'
const ALIVE_COOKIE = 'ms_session_alive'

function markSessionOnly(sessionOnly) {
  try {
    if (sessionOnly) localStorage.setItem(SESSION_ONLY_KEY, '1')
    else localStorage.removeItem(SESSION_ONLY_KEY)
  } catch {
    // storage blocked: the login behaves as "keep me logged in"
  }
  if (sessionOnly) document.cookie = `${ALIVE_COOKIE}=1; path=/; SameSite=Strict`
}

// True when the last login was "this session only" and the browser has been closed since.
function sessionOnlyExpired() {
  let flagged = false
  try {
    flagged = localStorage.getItem(SESSION_ONLY_KEY) === '1'
  } catch {
    return false
  }
  return flagged && !document.cookie.split('; ').includes(`${ALIVE_COOKIE}=1`)
}

function clearSessionFlags() {
  try {
    localStorage.removeItem(SESSION_ONLY_KEY)
  } catch {
    // nothing stored
  }
  document.cookie = `${ALIVE_COOKIE}=; path=/; Max-Age=0; SameSite=Strict`
}

// --- Refresh ------------------------------------------------------------------------------------------------------

// Refresh tokens are single-use, and a reused one logs the account out everywhere. So only one refresh runs at a
// time: one promise per tab (React StrictMode runs the restore effect twice in dev) and a Web Lock across tabs, so a
// second tab waits and then sends the cookie the first one just received.
let refreshing = null
const withLock = (task) =>
  typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request('markiesharkie:auth-refresh', task) : task()

function refreshAccessToken() {
  if (!refreshing) {
    refreshing = withLock(async () => {
      try {
        const data = await apiFetch('/auth/refresh', { method: 'POST', body: {}, auth: false })
        setAccessToken(data.accessToken)
        setSnapshot({ user: toUser(data.user, data.homePath) })
        return true
      } catch (error) {
        if (error instanceof ApiError && error.status !== 0) setAccessToken(null)
        if (error?.status === 0) throw error // offline: keep what we have
        return false
      }
    }).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

function endSession() {
  setAccessToken(null)
  setSnapshot({ user: null })
}

configureAuth({
  refresh: refreshAccessToken,
  onUnauthorized: () => {
    if (!snapshot.user) return
    endSession()
    for (const listener of unauthorizedListeners) listener()
  },
})

// Page load: new access token from the refresh cookie, then the profile from GET /me. Safe to call more than once.
let restoring = null
export function restoreSession() {
  if (!restoring) {
    restoring = (async () => {
      try {
        if (sessionOnlyExpired()) {
          await apiFetch('/auth/logout', { method: 'POST', body: {}, auth: false }).catch(() => {})
          clearSessionFlags()
          endSession()
          return null
        }
        if (!(await refreshAccessToken())) return null
        try {
          const data = await apiFetch('/me')
          setSnapshot({ user: toUser(data.user) })
        } catch {
          // the refresh already gave us the user; the profile can load later
        }
        return snapshot.user
      } catch {
        return null // offline or server down: signed out for now
      } finally {
        setSnapshot({ ready: true })
      }
    })()
  }
  return restoring
}

// --- Login / signup / logout --------------------------------------------------------------------------------------

function rethrow(error) {
  if (error instanceof ApiError) throw new AuthError(error.code, error.message, error.fieldErrors)
  throw error
}

// POST /api/auth/login { identifier, password }. Errors: INVALID_CREDENTIALS (401, same for unknown account and wrong
// password), ACCOUNT_LOCKED (423), ACCOUNT_SUSPENDED (403), RATE_LIMITED (429), VALIDATION_ERROR (400), NETWORK.
export async function logInWithPassword({ identifier, password, remember = true }) {
  const id = String(identifier ?? '').trim()
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: { identifier: normalizePkMobile(id) ?? id, password: String(password ?? '') },
    auth: false,
  }).catch(rethrow)
  setAccessToken(data.accessToken)
  clearSessionFlags()
  markSessionOnly(!remember)
  setSnapshot({ ready: true, user: toUser(data.user, data.homePath) })
  broadcast('login')
  return snapshot.user
}

// POST /api/auth/register, then log in with the same details. role: customer | venue_owner | decorator (REQ-1);
// venue owners add businessName + contactNumber, decorators businessName + bio. Errors: VALIDATION_ERROR (400, with
// per-field details), EMAIL_TAKEN / PHONE_TAKEN (409), RATE_LIMITED (429), NETWORK. If the account was created but the
// login after it fails, throws REGISTERED_LOGIN_FAILED so the form can send the person to the login step.
export async function signUp({ role = 'customer', name, email, phone, city, password, businessName, contactNumber, bio, remember = true }) {
  const cleanEmail = normalizeEmail(email)
  const body = {
    role,
    name: String(name ?? '').trim().replace(/\s+/g, ' '),
    email: cleanEmail,
    phone: normalizePkMobile(phone) ?? String(phone ?? '').trim(),
    password: String(password ?? ''),
    city: String(city ?? '').trim(),
  }
  if (role === 'venue_owner') {
    body.businessName = String(businessName ?? '').trim()
    body.contactNumber = normalizePkMobile(contactNumber) ?? String(contactNumber ?? '').trim()
  }
  if (role === 'decorator') {
    body.businessName = String(businessName ?? '').trim()
    body.bio = String(bio ?? '').trim()
  }
  await apiFetch('/auth/register', { method: 'POST', body, auth: false }).catch(rethrow)
  try {
    return await logInWithPassword({ identifier: cleanEmail, password: body.password, remember })
  } catch {
    throw new AuthError('REGISTERED_LOGIN_FAILED', 'Your account is ready. Log in to continue.')
  }
}

// POST /api/auth/logout. The session ends in this tab (and the others) even if the request fails.
export async function signOut() {
  await apiFetch('/auth/logout', { method: 'POST', body: {}, auth: false }).catch(() => {})
  clearSessionFlags()
  endSession()
  broadcast('logout')
}

// --- Not on the server yet ----------------------------------------------------------------------------------------

const RESET_UNAVAILABLE = 'Password reset isn’t available yet. Contact support to reset your password.'

// POST /api/auth/password/forgot (REQ-2, not built on the server yet).
export async function requestPasswordReset() {
  throw new AuthError('NOT_AVAILABLE', RESET_UNAVAILABLE)
}

// POST /api/auth/password/reset (REQ-2, not built on the server yet).
export async function resetPassword() {
  throw new AuthError('NOT_AVAILABLE', RESET_UNAVAILABLE)
}
