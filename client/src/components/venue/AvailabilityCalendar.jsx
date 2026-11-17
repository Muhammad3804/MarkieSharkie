import { useCallback, useId, useSyncExternalStore } from 'react'
import { SectionTitle } from './AboutSection.jsx'
import { CalendarLegend, CalendarMonth, MonthNavButton } from './CalendarMonth.jsx'
import { monthLabel, useCalendarNav } from '../../features/booking/calendarNav.js'
import { SLOT_PRESETS, SLOT_STATUS_LABELS } from '../../lib/booking.js'
import { formatEventDate } from '../../lib/format.js'

const WIDE = '(min-width: 48rem)'
const subscribeWide = (onChange) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const isWide = () => window.matchMedia(WIDE).matches

// Venue page calendar (Figma 46:4 / 73:608): two months from md, one below. Live per-hall, per-slot status from
// useSlotAvailability (held and booked slots show as taken for everyone, across tabs). Picking a day lists each
// hall's Lunch / Evening slots; picking a free one fills the booking panel.
export default function AvailabilityCalendar({ ref, venue, availability, booking, onChange, title = 'Check availability' }) {
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true)
  const count = wide ? 2 : 1
  const { today, dayState, slotStatus, status, reload } = availability
  const nav = useCalendarNav({ today, count, selectedKey: booking.date })
  const id = useId()
  const selectDate = useCallback((date) => onChange({ date }), [onChange])

  return (
    <section ref={ref} aria-labelledby="availability-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <SectionTitle id="availability-title">{title}</SectionTitle>
        <p className="text-[14px] text-muted-warm">Live availability for every hall. Dates and times are in Pakistan time.</p>
      </div>

      <div className="rounded-[20px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(41,28,31,0.05),0_12px_32px_-12px_rgba(41,28,31,0.14)] sm:p-6">
        {status === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-3 py-6">
            <p className="text-[15px] font-medium text-ink-strong">Couldn’t load availability.</p>
            <p className="text-[14px] text-muted-warm">Check your connection and try again. You can still pick a date; we check the slot before holding it.</p>
            <button type="button" onClick={reload} className="min-h-11 cursor-pointer rounded-full border border-primary px-5 text-[14px] font-medium text-primary hover:bg-blush focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Try again
            </button>
          </div>
        ) : null}
        <div data-calendar aria-busy={status === 'loading'} className={`grid gap-8 ${count === 2 ? 'md:grid-cols-2' : ''}`}>
          {nav.months.map((month, index) => {
            const labelId = `${id}-month-${index}`
            return (
              // Keyed by position, not month: the wrapper (and a focused Prev / Next button) survives a month change.
              <div key={index} className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <MonthNavButton direction={-1} disabled={nav.offset === 0} onClick={() => nav.shift(-1)} className={index > 0 ? 'invisible' : ''} />
                  <h3 id={labelId} aria-live="polite" className="font-heading text-[16px] font-semibold text-ink-strong">
                    {monthLabel(month.year, month.month)}
                  </h3>
                  <MonthNavButton direction={1} disabled={nav.offset >= nav.maxOffset} onClick={() => nav.shift(1)} className={index < count - 1 ? 'invisible' : ''} />
                </div>
                <CalendarMonth year={month.year} month={month.month} today={today} nav={nav} selectedKey={booking.date} onSelect={selectDate} dayState={dayState} labelId={labelId} />
              </div>
            )
          })}
        </div>
        <p role="status" className="sr-only">
          {status === 'loading' ? 'Loading availability' : ''}
        </p>
        <div className="mt-5 border-t border-line pt-4">
          <CalendarLegend />
        </div>
      </div>

      {booking.date && <DaySlots venue={venue} booking={booking} slotStatus={slotStatus} onChange={onChange} />}
    </section>
  )
}

// The picked day, per hall and slot. Free slots are buttons that fill the booking panel.
function DaySlots({ venue, booking, slotStatus, onChange }) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-blush/60 p-4 sm:p-5">
      <h3 className="font-heading text-[16px] font-semibold text-ink-strong">{formatEventDate(booking.date)}</h3>
      <ul className="flex flex-col gap-3">
        {venue.halls.map((hall) => (
          <li key={hall.hallId} className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(41,28,31,0.06)] sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <p className="min-w-0 text-[14px]">
              <span className="block font-semibold text-ink-strong">{hall.name}</span>
              <span className="text-muted-warm">Up to {hall.capacity.toLocaleString('en-US')} guests</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {SLOT_PRESETS.map((slot) => {
                const status = slotStatus(hall.hallId, booking.date, slot.value)
                const free = status === 'available'
                const picked = booking.hallId === hall.hallId && booking.slot === slot.value
                return (
                  <button
                    key={slot.value}
                    type="button"
                    aria-disabled={!free || undefined}
                    aria-pressed={picked}
                    aria-label={`${hall.name}, ${slot.label} ${slot.time}: ${SLOT_STATUS_LABELS[status]}`}
                    onClick={() => free && onChange({ hallId: hall.hallId, slot: slot.value })}
                    className={`flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-w-[132px] ${
                      picked
                        ? 'border-primary bg-primary text-white'
                        : free
                          ? 'cursor-pointer border-outline-strong bg-white text-ink-strong hover:border-primary'
                          : 'cursor-not-allowed border-line bg-surface text-muted-warm'
                    }`}
                  >
                    <span className="font-semibold">{slot.label}</span>
                    <span className={picked ? 'text-white/85' : free ? 'text-success' : ''}>{SLOT_STATUS_LABELS[status]}</span>
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-warm">Pick a free slot, then press Check availability in the booking panel.</p>
    </div>
  )
}
