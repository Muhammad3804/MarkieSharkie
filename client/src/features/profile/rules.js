import { normalizePkMobile } from '../../lib/phone.js'

// Profile field rules, the same limits as the server's PATCH /me (server/src/lib/validators.js and
// modules/users/schemas.js), so a value the form accepts is a value the server accepts. Each returns '' when fine.

const text = (value) => String(value ?? '').trim()

export function nameError(value) {
  const v = text(value)
  if (!v) return 'Enter your full name.'
  if (v.length < 2) return 'Name must be at least 2 characters.'
  return v.length > 100 ? 'Name must be 100 characters or fewer.' : ''
}

export function phoneError(value, label = 'mobile number') {
  if (!text(value)) return `Enter your ${label}.`
  return normalizePkMobile(value) ? '' : 'Enter a Pakistani mobile number, like 0300-1234567 or +92 300 1234567.'
}

export function cityError(value, label = 'city') {
  const v = text(value)
  if (!v || v.length < 2) return `Choose your ${label}.`
  return v.length > 100 ? 'City must be 100 characters or fewer.' : ''
}

export function businessNameError(value) {
  const v = text(value)
  if (!v) return 'Enter your business name.'
  if (v.length < 2) return 'Business name must be at least 2 characters.'
  return v.length > 150 ? 'Business name must be 150 characters or fewer.' : ''
}

export function bioError(value) {
  const v = text(value)
  if (!v) return 'Add a short description of your services.'
  return v.length > 500 ? 'Keep the description to 500 characters or fewer.' : ''
}

// Optional preferences: empty is fine.
export function guestCountError(value) {
  const v = text(value)
  if (!v) return ''
  if (!/^\d+$/.test(v)) return 'Enter the number of guests as a whole number.'
  const n = Number(v)
  if (n < 1) return 'Guests must be at least 1.'
  return n > 10000 ? 'Guests must be 10,000 or fewer.' : ''
}

export function budgetError(value) {
  const v = text(value).replace(/,/g, '')
  if (!v) return ''
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) return 'Enter an amount in rupees, like 350000.'
  return /^0+(\.0+)?$/.test(v) ? 'Enter an amount greater than 0.' : ''
}

export const BIO_MAX = 500
