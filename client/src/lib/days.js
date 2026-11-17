// yyyy-mm-dd day keys (a calendar date with no time zone). Maths runs at UTC noon so DST never shifts a day.
const toDate = (key) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}
const toKey = (date) => date.toISOString().slice(0, 10)

export function addDays(key, days) {
  const date = toDate(key)
  date.setUTCDate(date.getUTCDate() + days)
  return toKey(date)
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86400000)
}

// 0 = Sunday.
export const weekdayOf = (key) => toDate(key).getUTCDay()

// { year, month } (month 0-11) of a key, and the key of the first day of a month offset from it.
export function monthOf(key) {
  const date = toDate(key)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}
export function monthStart(year, month) {
  return toKey(new Date(Date.UTC(year, month, 1, 12)))
}
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
}
// Months from a's month to b's month.
export function monthDiff(a, b) {
  const x = monthOf(a)
  const y = monthOf(b)
  return (y.year - x.year) * 12 + (y.month - x.month)
}
// Same day in another month, clamped to that month's length (31 Jan + 1 month = 28/29 Feb).
export function addMonths(key, months) {
  const { year, month } = monthOf(key)
  const day = Number(key.slice(8))
  const target = new Date(Date.UTC(year, month + months, 1, 12))
  const last = daysInMonth(target.getUTCFullYear(), target.getUTCMonth())
  target.setUTCDate(Math.min(day, last))
  return toKey(target)
}
