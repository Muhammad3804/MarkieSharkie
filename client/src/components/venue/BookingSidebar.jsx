import { useMemo, useState } from 'react'
import { formatEventDate } from '../../lib/format.js'
import { formatPaisa, toPaisa } from '../../lib/money.js'
import { MIN_GUESTS, SLOT_HOLD_MINUTES, SLOT_PRESETS, guestCountError } from '../../lib/booking.js'
import usersIcon from '../../assets/icons/venue/users.svg'
import calendarDaysIcon from '../../assets/icons/venue/calendar-days.svg'
import clockIcon from '../../assets/icons/venue/clock.svg'
import chevronDownIcon from '../../assets/icons/venue/chevron-down.svg'
import shieldCheckIcon from '../../assets/icons/venue/shield-check.svg'
import headphonesIcon from '../../assets/icons/venue/headphones.svg'
import flagIcon from '../../assets/icons/venue/flag.svg'
import ReportListingDialog from './ReportListingDialog.jsx'

const fieldBox =
  'relative flex items-center justify-between px-3.5 py-2.5 focus-within:bg-surface has-[select:focus-visible]:outline-2 has-[select:focus-visible]:-outline-offset-2 has-[select:focus-visible]:outline-primary'
const fieldLabel = 'text-[10px] font-bold uppercase text-muted-warm'
const fieldValue = 'text-[13px] font-medium text-ink-strong'

// A native <select> stretched over the styled field, so it stays keyboard and screen-reader friendly.
function SelectField({ id, label, value, display, onChange, options, icon = chevronDownIcon }) {
  return (
    <div className={fieldBox}>
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className={fieldLabel}>{label}</label>
        <span aria-hidden className={`${fieldValue} truncate`}>{display}</span>
      </div>
      <img src={icon} alt="" width="17" height="17" className="shrink-0" />
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

// Booking card (Figma 44:1141), compacted so the whole panel fits a 720px-tall screen without scrolling.
// One live total near the button: guests × the selected menu's per-guest price.
// UI only: the hold/booking flow needs the booking API (docs/booking-engine.md), so "Check availability"
// explains that instead of pretending to hold a slot.
export default function BookingSidebar({ venue, booking, onChange, onPickDate }) {
  // The message is tied to the date + slot it was written for, so it disappears once either changes.
  const [status, setStatus] = useState({ key: '', message: '' })
  const [reported, setReported] = useState(false)
  const [reporting, setReporting] = useState(false)
  // The guest limit comes from the selected hall, so changing hall revalidates the count automatically.
  const hall = venue.halls.find((h) => h.hallId === booking.hallId) ?? venue.halls[0]
  const menu = venue.menuPackages.find((m) => m.menuId === booking.menuId) ?? venue.menuPackages[0] ?? { menuId: '', name: 'No menu', pricePerHead: '0.00' }
  const slot = SLOT_PRESETS.find((s) => s.value === booking.slot)
  const statusKey = `${booking.date}|${booking.slot}|${booking.guests}|${hall.hallId}`
  const statusMessage = status.key === statusKey ? status.message : ''
  const guestError = guestCountError(booking.guests, hall)
  const guests = guestError ? null : Number(booking.guests)

  // Integer paisa only (no float math on money).
  const total = useMemo(() => (guests === null ? null : toPaisa(menu.pricePerHead) * guests), [menu.pricePerHead, guests])

  function checkAvailability() {
    if (guestError) {
      setStatus({ key: statusKey, message: 'Fix the guest count first.' })
      document.getElementById('booking-guests')?.focus()
      return
    }
    if (!booking.date) {
      setStatus({ key: statusKey, message: 'Pick an event date first.' })
      onPickDate()
      return
    }
    setStatus({
      key: statusKey,
      message: `Live availability for ${formatEventDate(booking.date)} (${slot.label}) comes from the booking service, which isn’t connected yet.`,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-white p-5 shadow-booking">
        <h2 className="sr-only">Book {venue.name}</h2>
        <div className="overflow-hidden rounded-[12px] border border-outline-strong">
          <div className="grid grid-cols-2 border-b border-line">
            <button type="button" onClick={onPickDate} className={`${fieldBox} border-r border-line text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`}>
              <span className="flex flex-col gap-1">
                <span className={fieldLabel}>Event date</span>
                <span className={fieldValue}>{booking.date ? formatEventDate(booking.date) : 'Select a date'}</span>
              </span>
              <img src={calendarDaysIcon} alt="" width="17" height="17" />
            </button>
            <SelectField id="booking-slot" label="Start time" value={booking.slot} display={slot.label} icon={clockIcon} onChange={(value) => onChange({ slot: value })} options={SLOT_PRESETS.map((s) => ({ value: s.value, label: `${s.label} (${s.time})` }))} />
          </div>
          <div className="border-b border-line">
            <SelectField id="booking-hall" label="Hall" value={hall.hallId} display={`${hall.name} · up to ${hall.capacity.toLocaleString('en-US')} guests`} onChange={(value) => onChange({ hallId: value })} options={venue.halls.map((h) => ({ value: h.hallId, label: `${h.name} (up to ${h.capacity.toLocaleString('en-US')} guests)` }))} />
          </div>
          <div className={`border-b border-line ${guestError ? 'bg-[#fdf2f2]' : ''}`}>
            <div className={`${fieldBox} has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-primary`}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor="booking-guests" className={fieldLabel}>Guest count</label>
                <input
                  id="booking-guests"
                  name="guests"
                  autoComplete="off"
                  type="number"
                  inputMode="numeric"
                  min={MIN_GUESTS}
                  max={hall.capacity}
                  step="1"
                  value={booking.guests}
                  onChange={(event) => onChange({ guests: event.target.value })}
                  aria-invalid={guestError ? true : undefined}
                  aria-describedby="booking-guests-hint"
                  className={`${fieldValue} w-full bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
                />
              </div>
              <img src={usersIcon} alt="" width="17" height="17" className="shrink-0" />
            </div>
            <p id="booking-guests-hint" aria-live="polite" className={`-mt-1 px-3.5 pb-2 text-[11px] ${guestError ? 'font-medium text-[#b42318]' : 'text-muted-warm'}`}>
              {guestError ?? `${MIN_GUESTS} to ${hall.capacity.toLocaleString('en-US')} guests in ${hall.name}`}
            </p>
          </div>
          <SelectField id="booking-menu" label="Menu" value={menu.menuId} display={`${menu.name} · ${formatPaisa(toPaisa(menu.pricePerHead), 'Rs.')} per guest`} onChange={(value) => onChange({ menuId: value })} options={venue.menuPackages.map((m) => ({ value: m.menuId, label: `${m.name} (${formatPaisa(toPaisa(m.pricePerHead), 'Rs.')} per guest)` }))} />
        </div>

        <p className="flex items-center gap-2 text-[12px] text-muted-warm">
          <img src={shieldCheckIcon} alt="" width="16" height="16" />
          Your slot is held for {SLOT_HOLD_MINUTES} minutes while you confirm
        </p>

        <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3">
          <span className="text-[13px] text-muted-warm">{guests === null ? 'Enter a guest count' : `Total for ${guests.toLocaleString('en-US')} guests · ${menu.name}`}</span>
          <span id="booking-price" className="font-heading text-[22px] font-semibold tabular-nums text-ink-strong">{total === null ? 'Rs. –' : formatPaisa(total, 'Rs.')}</span>
        </p>

        <div className="flex flex-col gap-2">
          <button type="button" onClick={checkAvailability} className="flex h-12 items-center justify-center rounded-[12px] bg-primary text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Check availability
          </button>
          <p className="text-center text-xs text-muted-warm">Marketplace services included</p>
          <p role="status" className="text-center text-[12px] text-muted-warm empty:hidden">{statusMessage}</p>
          <p className="text-center text-[12px] text-muted-warm">No payment is required to send an inquiry</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-[12px] bg-surface px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
          <img src={headphonesIcon} alt="" width="19" height="19" />
        </span>
        <div className="flex flex-col gap-[3px]">
          <p className="text-[13px] font-semibold text-ink-strong">Need help choosing?</p>
          <p className="text-[12px] leading-[1.35] text-muted-warm">An advisor can compare packages and dates.</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <button type="button" onClick={() => setReporting(true)} disabled={reported} className="flex items-center justify-center gap-2 text-[12px] text-muted-warm underline hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-primary disabled:no-underline disabled:hover:text-muted-warm">
          <img src={flagIcon} alt="" width="15" height="15" />
          {reported ? 'Listing reported' : 'Report this listing'}
        </button>
        <p role="status" className="text-[12px] text-muted-warm empty:hidden">{reported ? 'Thanks. Our team will look into it.' : ''}</p>
      </div>
      <ReportListingDialog venue={venue} open={reporting} onClose={() => setReporting(false)} onSent={() => setReported(true)} />
    </div>
  )
}
