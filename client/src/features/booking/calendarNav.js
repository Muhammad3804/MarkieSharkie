import { useState } from 'react'
import { addDays, addMonths, monthDiff, monthOf, monthStart, weekdayOf } from '../../lib/days.js'

// Calendar navigation shared by the venue page calendar and the booking panel's date picker
// (components/venue/CalendarMonth.jsx renders the grid). Day keys are yyyy-mm-dd in Pakistan time.

const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const noon = (key) => new Date(`${key}T12:00:00Z`)
export const monthLabel = (year, month) => monthName.format(noon(monthStart(year, month)))

export const LAST_MONTH_OFFSET = 12 // the calendar opens up to 12 months ahead

// Navigation state for `count` visible months: { offset, maxOffset, months, tabKey, focusKey, shift, onGridKeyDown,
// setFocusKey }. Offset 0 = the current month; it can't go earlier (no past months).
export function useCalendarNav({ today, count, selectedKey }) {
  const first = monthStart(monthOf(today).year, monthOf(today).month)
  const maxOffset = LAST_MONTH_OFFSET - (count - 1)
  const lastDay = addDays(addMonths(first, LAST_MONTH_OFFSET + 1), -1)
  const initialOffset = selectedKey && selectedKey >= today ? Math.min(maxOffset, Math.max(0, monthDiff(today, selectedKey) - (count - 1))) : 0
  const [rawOffset, setOffset] = useState(initialOffset)
  const offset = Math.min(rawOffset, maxOffset) // the view can widen (1 -> 2 months) after a resize
  const [focusKey, setFocusKey] = useState(selectedKey && selectedKey >= today ? selectedKey : today)

  const months = Array.from({ length: count }, (_, i) => {
    const { year, month } = monthOf(addMonths(first, offset + i))
    return { year, month }
  })
  const visibleFirst = monthStart(months[0].year, months[0].month)
  const visibleLast = addDays(addMonths(visibleFirst, count), -1)
  // The roving tab stop must be on a visible day.
  const tabKey = focusKey < visibleFirst || focusKey > visibleLast ? (today >= visibleFirst && today <= visibleLast ? today : visibleFirst) : focusKey

  const shift = (direction) => setOffset((value) => Math.min(maxOffset, Math.max(0, value + direction)))

  // Arrow-key move: scroll the view to the new day if needed, then focus it once React has rendered it.
  function moveTo(key, root) {
    const next = key < first ? first : key > lastDay ? lastDay : key
    const diff = monthDiff(first, next)
    setOffset((value) => (diff < value ? diff : diff > value + count - 1 ? Math.min(maxOffset, diff - (count - 1)) : value))
    setFocusKey(next)
    requestAnimationFrame(() => root.querySelector(`[data-day="${next}"]`)?.focus())
  }

  function onGridKeyDown(event) {
    const key = event.target.dataset?.day
    if (!key) return
    const moves = {
      ArrowLeft: () => addDays(key, -1),
      ArrowRight: () => addDays(key, 1),
      ArrowUp: () => addDays(key, -7),
      ArrowDown: () => addDays(key, 7),
      Home: () => addDays(key, -weekdayOf(key)),
      End: () => addDays(key, 6 - weekdayOf(key)),
      PageUp: () => addMonths(key, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(key, event.shiftKey ? 12 : 1),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    moveTo(move(), event.currentTarget.closest('[data-calendar]') ?? document)
  }

  return { offset, maxOffset, months, tabKey, focusKey, shift, onGridKeyDown, setFocusKey }
}

export const DAY_STATES = {
  available: { label: 'Available', dot: 'bg-success' },
  few: { label: 'Few slots left', dot: 'bg-pending' },
  full: { label: 'Fully booked', dot: 'bg-danger' },
  past: { label: 'Past', dot: 'bg-day-past' },
}
