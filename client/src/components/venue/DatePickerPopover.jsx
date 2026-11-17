import { useEffect, useId, useRef } from 'react'
import { CalendarLegend, CalendarMonth, MonthNavButton } from './CalendarMonth.jsx'
import { monthLabel, useCalendarNav } from '../../features/booking/calendarNav.js'

// The booking panel's date picker: a one-month calendar in a non-modal popover under the date field, with the same
// rules and live states as the page calendar. Esc or a click outside closes it and returns focus to the field.
export default function DatePickerPopover({ availability, selectedKey, onSelect, onClose, anchorRef }) {
  const { today, dayState } = availability
  const nav = useCalendarNav({ today, count: 1, selectedKey })
  const panelRef = useRef(null)
  const labelId = useId()
  const month = nav.months[0]

  // Start on the selected day (or today), like a native picker.
  useEffect(() => {
    panelRef.current?.querySelector('[data-day][tabindex="0"]')?.focus()
  }, [])

  useEffect(() => {
    function onPointerDown(event) {
      if (panelRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return
      onClose({ restoreFocus: false })
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose, anchorRef])

  return (
    <div
      ref={panelRef}
      role="dialog"
      data-calendar
      aria-label="Choose your event date"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose({ restoreFocus: true })
        }
      }}
      className="absolute inset-x-0 top-full z-20 mt-2 rounded-[18px] border border-line bg-white p-4 shadow-[0_2px_6px_rgba(41,28,31,0.06),0_18px_44px_-12px_rgba(41,28,31,0.28)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <MonthNavButton direction={-1} disabled={nav.offset === 0} onClick={() => nav.shift(-1)} />
        <h3 id={labelId} aria-live="polite" className="font-heading text-[15px] font-semibold text-ink-strong">
          {monthLabel(month.year, month.month)}
        </h3>
        <MonthNavButton direction={1} disabled={nav.offset >= nav.maxOffset} onClick={() => nav.shift(1)} />
      </div>
      <CalendarMonth compact year={month.year} month={month.month} today={today} nav={nav} selectedKey={selectedKey} onSelect={onSelect} dayState={dayState} labelId={labelId} />
      <div className="mt-3 border-t border-line pt-3">
        <CalendarLegend compact />
      </div>
    </div>
  )
}
