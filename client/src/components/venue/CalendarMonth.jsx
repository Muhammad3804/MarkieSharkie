import { memo } from 'react'
import { addDays, daysInMonth, monthStart, weekdayOf } from '../../lib/days.js'
import { DAY_STATES } from '../../features/booking/calendarNav.js'
import { SLOT_PRESETS } from '../../lib/booking.js'

// Month grid shared by the venue page calendar and the booking panel's date picker. WAI-ARIA grid pattern: one
// tab stop (roving tabindex); arrows move a day / week, Home / End to the week's start / end, Page Up / Down a
// month (Shift + Page Up / Down a year). Past days stay focusable for navigation but can't be picked.
// Dates are yyyy-mm-dd keys in Pakistan time (todayKey in lib/format.js).

const WEEKDAYS = [
  ['S', 'Sunday'],
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['T', 'Thursday'],
  ['F', 'Friday'],
  ['S', 'Saturday'],
]
const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const noon = (key) => new Date(`${key}T12:00:00Z`)

// One month as an ARIA grid. dayState(key) -> { state, perSlot } from useSlotAvailability.
export function CalendarMonth({ year, month, today, nav, selectedKey, onSelect, dayState, labelId, compact = false }) {
  const first = monthStart(year, month)
  const lead = weekdayOf(first)
  const total = daysInMonth(year, month)
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: total }, (_, i) => addDays(first, i))]
  while (cells.length % 7) cells.push(null)

  return (
    <table role="grid" aria-labelledby={labelId} onKeyDown={nav.onGridKeyDown} className="w-full table-fixed border-collapse text-center">
      <thead>
        <tr>
          {WEEKDAYS.map(([short, long]) => (
            <th key={long} scope="col" abbr={long} className={`pb-2 font-semibold text-muted-warm ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
              {short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <tr key={row}>
            {cells.slice(row * 7, row * 7 + 7).map((key, col) =>
              key ? (
                <td key={key} role="gridcell" aria-selected={selectedKey === key} className="p-0.5">
                  <Day dayKey={key} today={today} info={dayState(key)} selected={selectedKey === key} tabbable={nav.tabKey === key} onSelect={onSelect} onFocusDay={nav.setFocusKey} compact={compact} />
                </td>
              ) : (
                <td key={`empty-${col}`} role="gridcell" aria-hidden="true" />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const slotDot = (perSlot) => (perSlot.free === perSlot.total ? 'bg-success' : perSlot.free === 0 ? 'bg-danger' : 'bg-pending')
const slotWords = (perSlot, label) => (perSlot.free === perSlot.total ? `${label} free` : perSlot.free === 0 ? `${label} booked` : `${label} ${perSlot.free} of ${perSlot.total} halls free`)

// Memoized: a two-month view renders ~60 days, and typing in the booking panel shouldn't re-render them.
const Day = memo(function Day({ dayKey, today, info, selected, tabbable, onSelect, onFocusDay, compact }) {
  const past = info.state === 'past'
  const full = info.state === 'full'
  const isToday = dayKey === today
  const known = info.state !== 'unknown'
  const detail = past ? 'past date' : !known ? 'loading availability' : `${DAY_STATES[info.state].label}: ${SLOT_PRESETS.map((s) => slotWords(info.perSlot[s.value], s.label)).join(', ')}`
  return (
    <button
      type="button"
      data-day={dayKey}
      tabIndex={tabbable ? 0 : -1}
      aria-disabled={past || undefined}
      aria-current={isToday ? 'date' : undefined}
      aria-label={`${dayName.format(noon(dayKey))}${isToday ? ', today' : ''}, ${detail}`}
      onFocus={() => onFocusDay(dayKey)}
      onClick={() => !past && onSelect(dayKey)}
      className={`relative mx-auto flex w-full max-w-12 flex-col items-center justify-center gap-[3px] rounded-xl font-medium tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary motion-reduce:transition-none ${
        compact ? 'h-10 text-[13px]' : 'h-11 text-[14px]'
      } ${
        selected
          ? 'bg-primary text-white shadow-[0_6px_16px_-6px_rgba(122,23,49,0.55)]'
          : past
            ? 'cursor-not-allowed text-day-past'
            : full
              ? 'cursor-pointer text-muted-warm line-through decoration-danger/70 hover:bg-surface'
              : 'cursor-pointer text-ink-strong hover:bg-blush'
      } ${isToday && !selected ? 'ring-1 ring-primary ring-inset font-semibold text-primary' : ''}`}
    >
      <span className="leading-none">{Number(dayKey.slice(8))}</span>
      {/* One dot per slot (Lunch, Evening). Text equivalent is in the aria-label. */}
      <span aria-hidden="true" className={`flex h-1.5 gap-[3px] ${past || !known ? 'invisible' : ''}`}>
        {SLOT_PRESETS.map((s) => (
          <span key={s.value} className={`size-1.5 rounded-full ${selected ? 'bg-white' : slotDot(info.perSlot[s.value])}`} />
        ))}
      </span>
    </button>
  )
})

// Legend under the calendar; the "dots" line explains the per-slot markers.
export function CalendarLegend({ compact = false }) {
  return (
    <div className={`flex flex-col gap-2 ${compact ? 'text-[12px]' : 'text-[13px]'} text-muted-warm`}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Calendar legend">
        {Object.entries(DAY_STATES).map(([key, { label, dot }]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
            <span className={key === 'full' ? 'line-through decoration-danger/70' : ''}>{label}</span>
          </li>
        ))}
      </ul>
      <p>Dots under each date: left = Lunch, right = Evening.</p>
    </div>
  )
}

export function MonthNavButton({ direction, disabled, onClick, className = '' }) {
  return (
    <button
      type="button"
      aria-label={direction < 0 ? 'Previous month' : 'Next month'}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-ink-strong shadow-[0_1px_2px_rgba(41,28,31,0.06)] transition-colors hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:border-line disabled:text-outline-strong disabled:shadow-none disabled:hover:border-line ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={direction < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
      </svg>
    </button>
  )
}
