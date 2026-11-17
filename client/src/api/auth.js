import { createMockStore, latency } from './mockStore.js'
import { cityError, emailError, nameError, normalizeEmail, parseIdentifier, passwordError, phoneError } from '../lib/accountRules.js'
import { normalizePkMobile } from '../lib/phone.js'

// Mock auth (localStorage `markiesharkie:auth`) until the server exists. Users are shaped like the `users` table in
// camelCase (password_hash, failed_login_attempts, locked_until, last_login_at), so only this file changes when the
// server arrives; each export names the endpoint that replaces it (docs/api-and-security.md). The access token will
// live in memory and the refresh token in an httpOnly cookie, never in localStorage like this mock session.
//
// Mock-only parts:
// - Passwords are SHA-256 (Web Crypto) of `salt:password` with a per-user salt; the server uses argon2id.
//   Web Crypto needs a secure page (https or localhost), so password login fails on a plain-http LAN address.
// - Google / Apple are fully dummy: a fixed demo user per provider, no OAuth (srs-alignment #22).
// - "Keep me logged in" off keeps the session in sessionStorage (ends with the browser), on keeps it here.
// - The reset code is returned to the page (`demoCode`) because nothing is really sent.
// - No 30-minute inactivity timeout yet (REQ-2): the refresh-token expiry does that on the server.

export const MAX_FAILED_LOGINS = 5
export const LOCK_MINUTES = 15
export const RESET_CODE_MINUTES = 10
const MAX_CODE_ATTEMPTS = 5
export const RESEND_SECONDS = 30
const MINUTE = 60 * 1000

export const AUTH_PROVIDERS = {
  google: { label: 'Google', user: { name: 'Ayesha Khan', email: 'ayesha.khan@gmail.com', city: 'Lahore' } },
  apple: { label: 'Apple', user: { name: 'Hamza Ali', email: 'hamza.ali@icloud.com', city: 'Islamabad' } },
}

// Demo account: demo@markiesharkie.pk / Demo@1234 (hash precomputed with the salt below).
export const DEMO_ACCOUNT = { email: 'demo@markiesharkie.pk', password: 'Demo@1234' }
function seedUsers() {
  const created = '2026-11-01T09:00:00.000Z'
  return [
    {
      userId: '6d1f2b9e-3c4a-4e8b-9a71-5b2c8d0e4f13',
      name: 'Demo Customer',
      email: DEMO_ACCOUNT.email,
      phone: '+923001234567',
      city: 'Faisalabad',
      role: 'customer',
      isActive: true,
      authProvider: 'password',
      passwordSalt: '9f1c2a7e5b3d48e0a6c4f2b18d7e3a50',
      passwordHash: '4a91697520f797db3a2a6c73b099e96475fccbfba75d47c50fbf8fc742286460',
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: created,
      updatedAt: created,
    },
  ]
}

const store = createMockStore('markiesharkie:auth', {
  seed: () => ({ version: 2, users: seedUsers(), session: null, resetCodes: {} }),
  isValid: (value) =>
    value?.version === 2 && Array.isArray(value.users) && value.resetCodes && typeof value.resetCodes === 'object' && (value.session === null || typeof value.session?.userId === 'string'),
})

export class AuthError extends Error {
  // code: VALIDATION | NO_ACCOUNT | NO_PASSWORD | WRONG_PASSWORD | LOCKED | SUSPENDED | EMAIL_TAKEN | PHONE_TAKEN |
  //       CODE_INVALID | CODE_EXPIRED | RESEND_TOO_SOON | ACCOUNT_EXISTS | CRYPTO_UNAVAILABLE
  constructor(code, message, details) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.details = details
  }
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`)
const iso = (ms = Date.now()) => new Date(ms).toISOString()
const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)))

async function sha256(text) {
  if (!globalThis.crypto?.subtle) throw new AuthError('CRYPTO_UNAVAILABLE', 'Password login needs a secure page (https or localhost). Use Google or Apple on this address.')
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}
const hashSecret = (salt, secret) => sha256(`${salt}:${secret}`)

function findUser(state, identifier) {
  const id = parseIdentifier(identifier)
  if (!id) return null
  return state.users.find((u) => (id.kind === 'email' ? u.email === id.value : u.phone === id.value)) ?? null
}

function patchUser(userId, changes) {
  store.update((state) => ({ ...state, users: state.users.map((u) => (u.userId === userId ? { ...u, ...changes, updatedAt: iso() } : u)) }))
}

// --- Session -----------------------------------------------------------------------------------------------------

const TAB_SESSION = 'markiesharkie:auth-session'
function readTabSession() {
  try {
    return JSON.parse(sessionStorage.getItem(TAB_SESSION) ?? 'null')
  } catch {
    return null
  }
}
function writeTabSession(session) {
  try {
    if (session) sessionStorage.setItem(TAB_SESSION, JSON.stringify(session))
    else sessionStorage.removeItem(TAB_SESSION)
  } catch {
    // storage blocked: the session lasts for this page load only (memory store)
  }
}

// What the server sends about a user: never the hash, salt or lockout state.
const publicUsers = new WeakMap()
function toPublicUser(user) {
  if (!user) return null
  if (!publicUsers.has(user)) {
    const { userId, name, email, phone, city, role, authProvider, createdAt, lastLoginAt } = user
    publicUsers.set(user, { userId, name, email, phone, city, role, authProvider, createdAt, lastLoginAt })
  }
  return publicUsers.get(user)
}

// GET /api/auth/me. The signed-in user (public fields), or null. Sync and referentially stable between changes
// (useSyncExternalStore reads it). This tab's own session ("Keep me logged in" off) wins over the shared one.
export function getSessionUser() {
  const { users, session } = store.get()
  const userId = readTabSession()?.userId ?? session?.userId
  if (!userId) return null
  return toPublicUser(users.find((u) => u.userId === userId && u.isActive))
}

function startSession(user, provider, remember) {
  const now = iso()
  const session = { userId: user.userId, provider, startedAt: now }
  // The tab copy first: store.update notifies subscribers, and they must already see the new session. A
  // not-remembered login leaves the shared session alone (another tab may be logged in with it).
  writeTabSession(remember ? null : session)
  let signedIn = null
  store.update((state) => ({
    ...state,
    users: state.users.map((u) => (u.userId === user.userId ? (signedIn = { ...u, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now }) : u)),
    session: remember ? session : state.session,
  }))
  return toPublicUser(signedIn)
}

// POST /api/auth/logout
export async function signOut() {
  await latency(150)
  writeTabSession(null)
  store.update((state) => ({ ...state, session: null }))
}

// --- Google / Apple (dummy) --------------------------------------------------------------------------------------

// OAuth redirect + POST /api/auth/oauth/:provider. Same id and account every time for one provider.
export async function signInWithProvider(provider) {
  const profile = AUTH_PROVIDERS[provider]
  if (!profile) throw new Error(`Unknown sign-in provider: ${provider}`)
  await latency(900)
  const now = iso()
  let user = store.get().users.find((u) => u.email === profile.user.email)
  // A password account with the same email is not taken over (the server links only a provider-verified email,
  // and only after the person logs in with the password).
  if (user?.passwordHash) throw new AuthError('ACCOUNT_EXISTS', `An account with ${user.email} already uses a password. Log in with your email instead.`)
  if (user && !user.isActive) throw new AuthError('SUSPENDED', 'This account is suspended. Contact support.')
  if (!user) {
    user = { userId: uuid(), ...profile.user, phone: null, role: 'customer', isActive: true, authProvider: provider, passwordSalt: null, passwordHash: null, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null, createdAt: now, updatedAt: now }
    const created = user
    store.update((state) => ({ ...state, users: [...state.users, created] }))
  }
  return startSession(user, provider, true)
}

// --- Email / mobile + password -----------------------------------------------------------------------------------

// POST /api/auth/lookup { identifier } -> { exists, hasPassword, provider, firstName }. Says whether an account
// exists, so the modal can branch to the password step or signup (team decision, srs-alignment #22); the server
// must rate-limit it.
export async function lookupAccount(identifier) {
  await latency(350)
  if (!parseIdentifier(identifier)) throw new AuthError('VALIDATION', 'Enter an email like name@example.com or a mobile number like 0300-1234567.')
  const user = findUser(store.get(), identifier)
  if (!user) return { exists: false }
  return { exists: true, hasPassword: Boolean(user.passwordHash), provider: user.authProvider, firstName: user.name.split(' ')[0] }
}

const lockMessage = (until) => {
  const minutes = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / MINUTE))
  return `Too many wrong passwords. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}. Try again later or reset your password.`
}

// POST /api/auth/login { identifier, password, remember }. 5 wrong passwords in a row lock the account for
// 15 minutes (REQ-2); a correct password while locked is refused too. Success resets the counter.
export async function logInWithPassword({ identifier, password, remember = true }) {
  await latency(450)
  const user = findUser(store.get(), identifier)
  if (!user) throw new AuthError('NO_ACCOUNT', 'No account with this email or mobile number.')
  if (!user.isActive) throw new AuthError('SUSPENDED', 'This account is suspended. Contact support.')
  if (!user.passwordHash) {
    const label = AUTH_PROVIDERS[user.authProvider]?.label ?? 'another sign-in method'
    throw new AuthError('NO_PASSWORD', `This account uses ${label}. Continue with ${label} above.`)
  }
  const now = Date.now()
  const locked = user.lockedUntil && Date.parse(user.lockedUntil) > now
  if (locked) throw new AuthError('LOCKED', lockMessage(user.lockedUntil), { lockedUntil: user.lockedUntil })

  // TODO(server): compare with crypto.timingSafeEqual (argon2.verify does), and count failures with an atomic
  // UPDATE users SET failed_login_attempts = failed_login_attempts + 1 ... RETURNING.
  if ((await hashSecret(user.passwordSalt, String(password ?? ''))) !== user.passwordHash) {
    // Count on the latest row, inside the write, so parallel wrong guesses can't undercount.
    let attempts = 0
    let lockedUntil = null
    store.update((state) => ({
      ...state,
      users: state.users.map((u) => {
        if (u.userId !== user.userId) return u
        const stillLocked = u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()
        // An expired lock starts a fresh count.
        attempts = (u.lockedUntil && !stillLocked ? 0 : u.failedLoginAttempts) + 1
        lockedUntil = stillLocked ? u.lockedUntil : attempts >= MAX_FAILED_LOGINS ? iso(now + LOCK_MINUTES * MINUTE) : null
        return { ...u, failedLoginAttempts: attempts, lockedUntil, updatedAt: iso() }
      }),
    }))
    if (lockedUntil) throw new AuthError('LOCKED', lockMessage(lockedUntil), { lockedUntil })
    const left = MAX_FAILED_LOGINS - attempts
    throw new AuthError('WRONG_PASSWORD', `Wrong password. ${left} ${left === 1 ? 'try' : 'tries'} left before a ${LOCK_MINUTES}-minute lock.`, { attemptsLeft: left })
  }
  return startSession(user, 'password', remember)
}

// POST /api/auth/register { name, email, phone, city, password }. Role is always customer for now
// (srs-alignment #22); duplicate email or mobile is refused (REQ-1).
export async function signUp({ name, email, phone, city, password, remember = true }) {
  await latency(500)
  const fields = { name: nameError(name), email: emailError(email), phone: phoneError(phone), city: cityError(city), password: passwordError(password) }
  if (Object.values(fields).some(Boolean)) throw new AuthError('VALIDATION', 'Check the highlighted fields.', fields)
  const cleanEmail = normalizeEmail(email)
  const cleanPhone = normalizePkMobile(phone)
  const taken = (state) => {
    if (state.users.some((u) => u.email === cleanEmail)) throw new AuthError('EMAIL_TAKEN', 'An account with this email already exists. Log in instead.')
    if (state.users.some((u) => u.phone === cleanPhone)) throw new AuthError('PHONE_TAKEN', 'This mobile number is already on another account.')
  }
  taken(store.get())
  const passwordSalt = newSalt()
  const passwordHash = await hashSecret(passwordSalt, password)
  const now = iso()
  const user = {
    userId: uuid(),
    name: String(name).trim().replace(/\s+/g, ' '),
    email: cleanEmail,
    phone: cleanPhone,
    city: String(city).trim(),
    role: 'customer',
    isActive: true,
    authProvider: 'password',
    passwordSalt,
    passwordHash,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  }
  // Re-check inside the write (another tab may have signed up meanwhile), like the UNIQUE constraints.
  store.update((state) => {
    taken(state)
    return { ...state, users: [...state.users, user] }
  })
  return startSession(user, 'password', remember)
}

// --- Password reset by one-time code (REQ-2) ---------------------------------------------------------------------

const maskEmail = (email) => email.replace(/^(.)[^@]*(@.*)$/, (_, first, domain) => `${first}•••${domain}`)
const maskPhone = (phone) => `0${phone.slice(3, 6)}-•••${phone.slice(-4)}`

// POST /api/auth/password/forgot { identifier }: a 6-digit code, stored hashed, 10 minutes, 5 tries, single use.
// Sent to whichever the person typed (email or mobile). Mock: returns the code as `demoCode` (nothing is sent).
export async function requestPasswordReset(identifier) {
  await latency(500)
  const id = parseIdentifier(identifier)
  if (!id) throw new AuthError('VALIDATION', 'Enter an email like name@example.com or a mobile number like 0300-1234567.')
  const user = findUser(store.get(), identifier)
  if (!user) throw new AuthError('NO_ACCOUNT', 'No account with this email or mobile number.')
  // TODO(server): also rate-limit this route (and /auth/lookup) per account and per IP.
  const previous = store.get().resetCodes[user.userId]
  const wait = previous?.issuedAt ? RESEND_SECONDS - Math.floor((Date.now() - Date.parse(previous.issuedAt)) / 1000) : 0
  if (wait > 0) throw new AuthError('RESEND_TOO_SOON', `Wait ${wait} seconds before asking for a new code.`, { wait })
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
  const salt = newSalt()
  const codeHash = await hashSecret(salt, code)
  const expiresAt = iso(Date.now() + RESET_CODE_MINUTES * MINUTE)
  store.update((state) => ({ ...state, resetCodes: { ...state.resetCodes, [user.userId]: { salt, codeHash, expiresAt, attempts: 0, issuedAt: iso() } } }))
  const sentTo = id.kind === 'phone' && user.phone ? maskPhone(user.phone) : maskEmail(user.email)
  return { channel: id.kind === 'phone' && user.phone ? 'phone' : 'email', sentTo, expiresAt, sentAt: Date.now(), demoCode: code }
}

// POST /api/auth/password/reset { identifier, code, password }. Clears the lockout and ends the current session
// (the server revokes every refresh token); the person then logs in with the new password.
export async function resetPassword({ identifier, code, password }) {
  await latency(500)
  const user = findUser(store.get(), identifier)
  if (!user) throw new AuthError('NO_ACCOUNT', 'No account with this email or mobile number.')
  const entry = store.get().resetCodes[user.userId]
  const dropCode = () => store.update((state) => ({ ...state, resetCodes: Object.fromEntries(Object.entries(state.resetCodes).filter(([key]) => key !== user.userId)) }))
  if (!entry || Date.parse(entry.expiresAt) <= Date.now()) {
    if (entry) dropCode()
    throw new AuthError('CODE_EXPIRED', 'This code has expired. Send a new one.')
  }
  if ((await hashSecret(entry.salt, String(code ?? ''))) !== entry.codeHash) {
    // Count on the latest entry, inside the write (and only if it's still the same code: a resend replaces it).
    let attempts = MAX_CODE_ATTEMPTS
    store.update((state) => {
      const latest = state.resetCodes[user.userId]
      if (!latest || latest.codeHash !== entry.codeHash) return state
      attempts = latest.attempts + 1
      const codes = { ...state.resetCodes, [user.userId]: { ...latest, attempts } }
      if (attempts >= MAX_CODE_ATTEMPTS) delete codes[user.userId]
      return { ...state, resetCodes: codes }
    })
    if (attempts >= MAX_CODE_ATTEMPTS) throw new AuthError('CODE_EXPIRED', 'Too many wrong codes. Send a new one.')
    const left = MAX_CODE_ATTEMPTS - attempts
    throw new AuthError('CODE_INVALID', `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
  }
  const problem = passwordError(password)
  if (problem) throw new AuthError('VALIDATION', problem, { password: problem })
  const passwordSalt = newSalt()
  const passwordHash = await hashSecret(passwordSalt, password)
  dropCode()
  patchUser(user.userId, { passwordSalt, passwordHash, authProvider: user.authProvider ?? 'password', failedLoginAttempts: 0, lockedUntil: null })
  if (getSessionUser()?.userId === user.userId) await signOut()
  return { ok: true }
}
