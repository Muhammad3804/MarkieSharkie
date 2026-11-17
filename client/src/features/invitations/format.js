import { formatPkMobile } from '../../lib/phone.js'

// Card wording: "Saturday, 20 December 2026" and "7:00 PM – 11:00 PM" (Pakistan time; slot times are PKT already).
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export function formatLongDate(dayKey) {
  if (!dayKey) return ''
  const [year, month, day] = dayKey.split('-').map(Number)
  return longDate.format(new Date(Date.UTC(year, month - 1, day, 12))).replace(/^(\w+) /, '$1, ')
}

export function formatClock(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export const formatTimeRange = (start, end) => [formatClock(start), formatClock(end)].filter(Boolean).join(' – ')

export const formatContact = (phone) => (phone ? formatPkMobile(phone) : '')
