import { normalizePkMobile } from './phone.js'

// Account field rules (REQ-1, REQ-2, CLAUDE.md rule 7), shared by the login modal and the mock api/auth.js so
// both give the same messages. Each `*Error` returns a friendly message, or '' when the value is fine. The server
// repeats these checks with Zod at the route boundary.

export const PASSWORD_MIN = 8
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

export const normalizeEmail = (text) => String(text ?? '').trim().toLowerCase()

// Login accepts an email or a Pakistani mobile (REQ-2). -> { kind: 'email' | 'phone', value } or null.
export function parseIdentifier(text) {
  const value = String(text ?? '').trim()
  if (value.includes('@')) return EMAIL_RE.test(value) ? { kind: 'email', value: normalizeEmail(value) } : null
  const phone = normalizePkMobile(value)
  return phone ? { kind: 'phone', value: phone } : null
}

export function identifierError(text) {
  if (!String(text ?? '').trim()) return 'Enter your email or mobile number.'
  return parseIdentifier(text) ? '' : 'Enter an email like name@example.com or a mobile number like +92 300 1234567.'
}

export function nameError(text) {
  const value = String(text ?? '').trim()
  if (!value) return 'Enter your full name.'
  if (value.length < 3) return 'Enter your full name (at least 3 characters).'
  if (value.length > 80) return 'Use 80 characters or fewer.'
  return /^[\p{L}][\p{L} .'-]*$/u.test(value) ? '' : 'Use letters, spaces, dots and hyphens only.'
}

export function emailError(text) {
  const value = String(text ?? '').trim()
  if (!value) return 'Enter your email.'
  if (value.length > 254) return 'That email is too long.'
  return EMAIL_RE.test(value) ? '' : 'Enter an email like name@example.com.'
}

export function phoneError(text) {
  if (!String(text ?? '').trim()) return 'Enter your mobile number.'
  return normalizePkMobile(text) ? '' : 'Enter a Pakistani mobile number, like 0300-1234567 or +92 300 1234567.'
}

export const cityError = (text) => (String(text ?? '').trim() ? '' : 'Choose your city.')

// REQ-1: at least 8 characters with letters and digits.
export function passwordError(text) {
  const value = String(text ?? '')
  if (!value) return 'Enter a password.'
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (value.length > 128) return 'Use 128 characters or fewer.'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Use both letters and numbers.'
  return ''
}

// Advice only; passwordError is the rule. 0 (empty) .. 4 (strong).
export function passwordStrength(text) {
  const value = String(text ?? '')
  if (!value) return { score: 0, label: '' }
  let score = 0
  if (value.length >= PASSWORD_MIN) score++
  if (value.length >= 12) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++
  if (passwordError(value)) score = Math.min(score, 1)
  score = Math.max(score, 1)
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}

// REQ-1 role details (server: lib/validators.js businessNameSchema, bioSchema).
export function businessNameError(text) {
  const value = String(text ?? '').trim()
  if (!value) return 'Enter your business name.'
  if (value.length < 2) return 'Business name must be at least 2 characters.'
  return value.length > 150 ? 'Business name must be 150 characters or fewer.' : ''
}

export function bioError(text) {
  const value = String(text ?? '').trim()
  if (!value) return 'Add a short description of your services.'
  return value.length > 500 ? 'Keep the description to 500 characters or fewer.' : ''
}
