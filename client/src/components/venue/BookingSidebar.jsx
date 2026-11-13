import { useMemo, useState } from 'react'
import { formatEventDate } from '../../lib/format.js'
import { formatPaisa, toPaisa } from '../../lib/money.js'
import { SLOT_HOLD_MINUTES, SLOT_PRESETS, guestOptions } from '../../lib/booking.js'
import calendarDaysIcon from '../../assets/icons/venue/calendar-days.svg'
import clockIcon from '../../assets/icons/venue/clock.svg'
import chevronDownIcon from '../../assets/icons/venue/chevron-down.svg'
import shieldCheckIcon from '../../assets/icons/venue/shield-check.svg'
import headphonesIcon from '../../assets/icons/venue/headphones.svg'
import flagIcon from '../../assets/icons/venue/flag.svg'

const fieldBox =
  'relative flex items-center justify-between px-3.5 py-3 focus-within:bg-surface has-[select:focus-visible]:outline-2 has-[select:focus-visible]:-outline-offset-2 has-[select:focus-visible]:outline-primary'
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

// Booking card (Figma 44:1141). UI only: the hold/booking flow needs the booking API (docs/booking-engine.md),
// so "Check availability" explains that instead of pretending to hold a slot.
export default function BookingSidebar({ venue, booking, onChange, onPickDate }) {
  // The message is tied to the date + slot it was written for, so it disappears once either changes.
  const [status, setStatus] = useState({ key: '', message: '' })
  const [reported, setReported] = useState(false)
  const hall = venue.halls.find((h) => h.hallId === booking.hallId)
  const menu = venue.menuPackages.find((m) => m.menuId === booking.menuId)
  const slot = SLOT_PRESETS.find((s) => s.value === booking.slot)
  const statusKey = `${booking.date}|${booking.slot}`
  const statusMessage = status.key === statusKey ? status.message : ''
  const guestChoices = guestOptions(venue.minGuests, venue.capacity).map((n) => ({ value: String(n), label: `${n} guests` }))

  // Integer paisa only (no float math on money).
  const estimate = useMemo(() => {
    const venuePackage = toPaisa(venue.basePrice)
    const menuTotal = menu ? toPaisa(menu.pricePerHead) * Number(booking.guests) : 0
    return { venuePackage, menuTotal, total: venuePackage + menuTotal }
  }, [venue.basePrice, menu, booking.guests])

  function checkAvailability() {
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
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-[18px] rounded-[18px] border border-line bg-white p-6 shadow-booking">
        <h2 className="sr-only">Book {venue.name}</h2>
        <p id="booking-price" className="flex items-baseline gap-[7px]">
          <span className="font-heading text-[24px] font-semibold tabular-nums text-ink-strong">{formatPaisa(toPaisa(venue.basePrice), 'PKR')}</span>
          <span className="text-[13px] text-muted-warm">starting package</span>
        </p>

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
            <SelectField id="booking-guests" label="Guest count" value={booking.guests} display={`${booking.guests} guests`} onChange={(value) => onChange({ guests: value })} options={guestChoices} />
          </div>
          <div className="border-b border-line">
            <SelectField id="booking-hall" label="Hall" value={booking.hallId} display={hall?.name ?? 'Select hall'} onChange={(value) => onChange({ hallId: value })} options={[{ value: '', label: 'Select hall' }, ...venue.halls.map((h) => ({ value: h.hallId, label: h.name }))]} />
          </div>
          <SelectField id="booking-menu" label="Menu" value={booking.menuId} display={menu ? `${menu.name} · ${formatPaisa(toPaisa(menu.pricePerHead))} per guest` : 'Select menu'} onChange={(value) => onChange({ menuId: value })} options={[{ value: '', label: 'Select menu' }, ...venue.menuPackages.map((m) => ({ value: m.menuId, label: `${m.name} (${formatPaisa(toPaisa(m.pricePerHead))} per guest)` }))]} />
        </div>

        <p className="flex items-center gap-2 text-[12px] text-muted-warm">
          <img src={shieldCheckIcon} alt="" width="16" height="16" />
          Your slot is held for {SLOT_HOLD_MINUTES} minutes while you confirm
        </p>

        <button type="button" onClick={checkAvailability} className="flex h-[52px] items-center justify-center rounded-[12px] bg-primary text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Check availability
        </button>
        <p role="status" className="text-center text-[12px] text-muted-warm empty:hidden">{statusMessage}</p>
        <p className="text-center text-[12px] text-muted-warm">No payment is required to send an inquiry</p>

        <div className="h-px bg-line" />
        <dl className="flex flex-col gap-3 text-[13px] tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-warm">Venue package</dt>
            <dd className="text-ink-strong">{formatPaisa(estimate.venuePackage, 'PKR')}</dd>
          </div>
          {menu && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-warm">
                {menu.name} × {booking.guests} guests
              </dt>
              <dd className="text-ink-strong">{formatPaisa(estimate.menuTotal, 'PKR')}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-warm">Marketplace service</dt>
            <dd className="text-ink-strong">Included</dd>
          </div>
          {menu && (
            <div className="flex justify-between border-t border-line pt-3 font-semibold">
              <dt className="text-ink-strong">Estimated total</dt>
              <dd className="text-ink-strong">{formatPaisa(estimate.total, 'PKR')}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="flex items-center gap-3.5 rounded-[12px] bg-surface p-[18px]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
          <img src={headphonesIcon} alt="" width="19" height="19" />
        </span>
        <div className="flex flex-col gap-[3px]">
          <p className="text-[13px] font-semibold text-ink-strong">Need help choosing?</p>
          <p className="text-[12px] leading-[1.35] text-muted-warm">A venue advisor can compare packages and available dates.</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <button type="button" onClick={() => setReported(true)} disabled={reported} className="flex items-center justify-center gap-2 text-[12px] text-muted-warm underline hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-primary disabled:no-underline disabled:hover:text-muted-warm">
          <img src={flagIcon} alt="" width="15" height="15" />
          Report this listing
        </button>
        <p role="status" className="text-[12px] text-muted-warm empty:hidden">{reported ? 'Thanks. Reporting isn’t connected yet, so nothing was sent.' : ''}</p>
      </div>
    </div>
  )
}
