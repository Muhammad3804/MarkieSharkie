const pkr = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })

// "3:05 PM", shown in Pakistan time like every other timestamp in the app.
export function formatTime(date) {
  return time.format(date)
}

const eventDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })

// "Sat, 20 Dec 2026" (docs/ui-and-dashboards.md date format). Takes a yyyy-mm-dd day key.
export function formatEventDate(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return eventDate.format(new Date(Date.UTC(year, month - 1, day, 12))).replace(/^(\w+) /, '$1, ')
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// "3 weeks ago", "1 month ago".
export function timeAgo(iso, now = Date.now()) {
  const days = Math.round((now - Date.parse(iso)) / 86400000)
  if (days < 7) return relative.format(-days, 'day')
  if (days < 30) return relative.format(-Math.round(days / 7), 'week')
  if (days < 365) return relative.format(-Math.round(days / 30), 'month')
  return relative.format(-Math.round(days / 365), 'year')
}

// Money arrives from the API as a decimal string ("3755.00"); never do float math on it, only display it.
export function formatPKR(amount) {
  return `Rs. ${pkr.format(Number(amount))}`
}
