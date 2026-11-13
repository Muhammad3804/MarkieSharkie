import { memo, useMemo, useState } from 'react'
import { SectionTitle } from './AboutSection.jsx'
import chevronLeftIcon from '../../assets/icons/venue/chevron-left.svg'
import chevronRightIcon from '../../assets/icons/venue/chevron-right.svg'
import calendarIcon from '../../assets/icons/venue/calendar.svg'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function buildMonth(year, month) {
  const first = new Date(year, month, 1)
  const days = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= days; day++) cells.push(new Date(year, month, day))
  while (cells.length % 7) cells.push(null)
  return { label: monthName.format(first), cells }
}

// Two-month calendar (Figma 46:4 / 73:608). Booked days come from time_slots (mock: venue.bookedDates).
// Selecting a day updates the booking sidebar. Live slot status over Socket.io is not connected yet.
export default function AvailabilityCalendar({ ref, bookedDates, selectedDate, onSelect, title = 'Check availability' }) {
  // Read the clock once per mount (an initializer, not render).
  const [today] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  })
  const [offset, setOffset] = useState(0)
  const booked = useMemo(() => new Set(bookedDates), [bookedDates])
  const months = useMemo(
    () => [0, 1].map((i) => buildMonth(today.getFullYear(), today.getMonth() + offset + i)),
    [today, offset],
  )

  const nav = (direction, disabled, extra = '') => (
    <button
      type="button"
      aria-label={direction < 0 ? 'Previous month' : 'Next month'}
      disabled={disabled}
      onClick={() => setOffset((value) => value + direction)}
      className={`flex size-7 items-center justify-center rounded-full bg-surface hover:bg-line focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 ${extra}`}
    >
      <img src={direction < 0 ? chevronLeftIcon : chevronRightIcon} alt="" width="14" height="14" />
    </button>
  )

  return (
    <section ref={ref} aria-labelledby="availability-title" className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <SectionTitle id="availability-title">{title}</SectionTitle>
        <p className="text-[13px] text-muted-warm">Select your event date to see package pricing</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {months.map((month, index) => (
          <div key={month.label} className={`flex flex-col gap-4 ${index === 1 ? 'hidden md:flex' : ''}`}>
            <div className="flex items-center justify-between">
              {nav(-1, offset === 0, index === 1 ? 'md:invisible' : '')}
              <h3 aria-hidden className="font-heading text-[15px] font-semibold text-ink-strong">{month.label}</h3>
              {nav(1, offset >= 11, index === 0 ? 'md:invisible' : '')}
            </div>
            <table className="w-full table-fixed border-collapse text-center">
              <caption className="sr-only">{month.label}</caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((day, i) => (
                    <th key={i} scope="col" className="pb-2 text-[12px] font-semibold text-muted-warm">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: month.cells.length / 7 }, (_, row) => (
                  <tr key={row}>
                    {month.cells.slice(row * 7, row * 7 + 7).map((date, col) => (
                      <td key={col} className="py-1">
                        {date ? (
                          <Day date={date} today={today} booked={booked.has(dayKey(date))} selected={selectedDate === dayKey(date)} onSelect={onSelect} />
                        ) : (
                          <span aria-hidden className="text-[13px] text-outline-strong">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p className="flex items-center gap-2 text-[13px] text-muted-warm">
        <img src={calendarIcon} alt="" width="15" height="15" />
        Minimum booking: 1 day in advance · Prices may vary by season
      </p>
    </section>
  )
}

// Memoized: ~60 days render per view, and booking changes elsewhere on the page shouldn't re-render them.
const Day = memo(function Day({ date, today, booked, selected, onSelect }) {
  const key = dayKey(date)
  const past = date <= today
  const disabled = past || booked
  const status = past ? ', unavailable' : booked ? ', booked' : ''
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${dayName.format(date)}${status}`}
      onClick={() => onSelect(key)}
      className={`relative mx-auto flex h-8 w-10 items-center justify-center rounded-full text-[13px] focus-visible:outline-2 focus-visible:outline-primary ${
        selected
          ? 'bg-ink-strong font-semibold text-white'
          : past
            ? 'text-day-past'
            : booked
              ? 'text-outline-strong'
              : 'text-ink-strong hover:bg-surface'
      }`}
    >
      {date.getDate()}
      {booked && !past && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-[#d92d20]">
          ✕
        </span>
      )}
    </button>
  )
})
