import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatEventDate } from '../../lib/format.js'
import { formatPaisa, toPaisa } from '../../lib/money.js'
import { MIN_GUESTS, SLOT_HOLD_MINUTES, SLOT_PRESETS, SLOT_STATUS_LABELS, guestCountError, slotPreset } from '../../lib/booking.js'
import { BookingError, checkSlot } from '../../api/bookings.js'
import { priceBreakdown } from '../../features/booking/pricing.js'
import { startHold } from '../../features/booking/hold.js'
import { loadBookingDraft, newBookingDraft, saveBookingDraft } from '../../features/booking/draft.js'
import DatePickerPopover from './DatePickerPopover.jsx'
import usersIcon from '../../assets/icons/venue/users.svg'
import calendarDaysIcon from '../../assets/icons/venue/calendar-days.svg'
import clockIcon from '../../assets/icons/venue/clock.svg'
import chevronDownIcon from '../../assets/icons/venue/chevron-down.svg'
import shieldCheckIcon from '../../assets/icons/venue/shield-check.svg'
import headphonesIcon from '../../assets/icons/venue/headphones.svg'
import flagIcon from '../../assets/icons/venue/flag.svg'
import ReportListingDialog from './ReportListingDialog.jsx'
import { useRequireAuth } from '../../features/auth/authContext.js'

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

const takenMessage = (status, hall, slot, date) =>
  `${hall.name} is ${status === 'held' ? 'on hold for another customer' : status === 'blocked' ? 'unavailable' : 'already booked'} for ${slot.label.toLowerCase()} on ${formatEventDate(date)}.`

// Booking card (Figma 44:1141), compacted so the whole panel fits a 720px-tall screen without scrolling.
// One live total near the button: menu × guests + hall hire (integer paisa; add-ons come later in the flow).
// "Check availability" checks that exact hall slot: free -> asks to log in if needed, places a 10-minute hold
// (REQ-18) and opens the booking flow; taken -> says so inline and offers the nearest free dates and other free
// halls (EUC-14 2.1).
export default function BookingSidebar({ venue, booking, onChange, availability }) {
  const navigate = useNavigate()
  const requireAuth = useRequireAuth()
  // The message is tied to the selection it was written for, so it disappears once anything changes.
  const [status, setStatus] = useState({ key: '', kind: '', message: '', alternatives: null })
  const [checking, setChecking] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reported, setReported] = useState(false)
  const [reporting, setReporting] = useState(false)
  const dateRef = useRef(null)
  // The guest limit comes from the selected hall, so changing hall revalidates the count automatically.
  const hall = venue.halls.find((h) => h.hallId === booking.hallId) ?? venue.halls[0]
  const menu = venue.menuPackages.find((m) => m.menuId === booking.menuId) ?? venue.menuPackages[0] ?? { menuId: '', name: 'No menu', pricePerHead: '0.00' }
  const slot = slotPreset(booking.slot)
  const statusKey = `${booking.date}|${booking.slot}|${booking.guests}|${hall.hallId}|${menu.menuId}`
  const shown = status.key === statusKey ? status : null
  const guestError = guestCountError(booking.guests, hall)
  const guests = guestError ? null : Number(booking.guests)
  const slotState = (hallId, value) => (booking.date ? availability.slotStatus(hallId, booking.date, value) : 'available')
  const taken = (state) => state !== 'available' && state !== 'unknown'

  // Integer paisa only (no float math on money).
  const price = useMemo(() => (guests === null ? null : priceBreakdown(venue, { hallId: hall.hallId, guests, menuId: menu.menuId })), [venue, hall.hallId, guests, menu.menuId])

  const closePicker = useCallback(({ restoreFocus }) => {
    setPickerOpen(false)
    if (restoreFocus) dateRef.current?.focus()
  }, [])
  const pickDate = useCallback(
    (date) => {
      onChange({ date })
      closePicker({ restoreFocus: true })
    },
    [onChange, closePicker],
  )

  function showFailure(error) {
    if (error instanceof BookingError && error.code === 'SLOT_UNAVAILABLE') {
      setStatus({ key: statusKey, kind: 'taken', message: `${error.message} Try another date or hall.`, alternatives: error.details })
    } else {
      console.error('[bookings] check availability failed', error)
      setStatus({ key: statusKey, kind: 'error', message: error instanceof BookingError ? error.message : 'We couldn’t check this slot. Check your connection and try again.' })
    }
  }

  // Holding a slot needs an account (holds are per customer). Runs right away when logged in, or after the
  // login modal with this same selection (the modal blocks the panel, so it can't change in between).
  async function holdAndContinue(selection) {
    setChecking(true)
    try {
      await startHold(venue.id, selection)
      const draft = loadBookingDraft(venue.id) ?? newBookingDraft(venue)
      // A different slot means new terms to agree to.
      const sameSlot = draft.hallId === selection.hallId && draft.date === selection.date && draft.slot === selection.slot
      saveBookingDraft(venue.id, { ...draft, ...selection, guests: booking.guests, menuId: menu.menuId, agreed: sameSlot && draft.agreed, lastStep: 'selection' })
      navigate(`/venues/${venue.id}/book/selection`)
    } catch (error) {
      showFailure(error)
    } finally {
      setChecking(false)
    }
  }

  // The check itself is public: a taken slot shows alternatives without asking anyone to log in.
  async function checkAvailability() {
    if (checking) return
    if (guestError) {
      setStatus({ key: statusKey, kind: 'error', message: 'Fix the guest count first.' })
      document.getElementById('booking-guests')?.focus()
      return
    }
    if (!booking.date) {
      setStatus({ key: statusKey, kind: 'error', message: 'Pick an event date first.' })
      setPickerOpen(true)
      return
    }
    setChecking(true)
    const selection = { hallId: hall.hallId, date: booking.date, slot: booking.slot }
    try {
      const result = await checkSlot({ venueId: venue.id, ...selection, halls: venue.halls })
      if (!result.available) {
        setStatus({ key: statusKey, kind: 'taken', message: takenMessage(result.status, hall, slot, booking.date), alternatives: result.alternatives })
        return
      }
      await requireAuth('availability', () => holdAndContinue(selection))
    } catch (error) {
      showFailure(error)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-white p-5 shadow-booking">
        <h2 className="sr-only">Book {venue.name}</h2>
        <div className="relative rounded-[12px] border border-outline-strong">
          <div className="grid grid-cols-2 border-b border-line">
            <button
              ref={dateRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((open) => !open)}
              className={`${fieldBox} cursor-pointer rounded-tl-[12px] border-r border-line text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`}
            >
              <span className="flex flex-col gap-1">
                <span className={fieldLabel}>Event date</span>
                <span className={fieldValue}>{booking.date ? formatEventDate(booking.date) : 'Select a date'}</span>
              </span>
              <img src={calendarDaysIcon} alt="" width="17" height="17" />
            </button>
            <SelectField
              id="booking-slot"
              label="Start time"
              value={booking.slot}
              display={taken(slotState(hall.hallId, booking.slot)) ? `${slot.label} · ${SLOT_STATUS_LABELS[slotState(hall.hallId, booking.slot)]}` : slot.label}
              icon={clockIcon}
              onChange={(value) => onChange({ slot: value })}
              options={SLOT_PRESETS.map((s) => {
                const state = slotState(hall.hallId, s.value)
                return { value: s.value, label: `${s.label} (${s.time})${taken(state) ? ` · ${SLOT_STATUS_LABELS[state]}` : ''}` }
              })}
            />
          </div>
          {pickerOpen && (
            <DatePickerPopover
              availability={availability}
              selectedKey={booking.date}
              anchorRef={dateRef}
              onClose={closePicker}
              onSelect={pickDate}
            />
          )}
          <div className="border-b border-line">
            <SelectField
              id="booking-hall"
              label="Hall"
              value={hall.hallId}
              display={`${hall.name} · up to ${hall.capacity.toLocaleString('en-US')} guests`}
              onChange={(value) => onChange({ hallId: value })}
              options={venue.halls.map((h) => {
                const state = slotState(h.hallId, booking.slot)
                return { value: h.hallId, label: `${h.name} (up to ${h.capacity.toLocaleString('en-US')} guests)${taken(state) ? ` · ${SLOT_STATUS_LABELS[state]}` : ''}` }
              })}
            />
          </div>
          <div className={`border-b border-line ${guestError ? 'bg-danger-bg' : ''}`}>
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
            <p id="booking-guests-hint" aria-live="polite" className={`-mt-1 px-3.5 pb-2 text-[11px] ${guestError ? 'font-medium text-danger' : 'text-muted-warm'}`}>
              {guestError ?? `${MIN_GUESTS} to ${hall.capacity.toLocaleString('en-US')} guests in ${hall.name}`}
            </p>
          </div>
          <SelectField id="booking-menu" label="Menu" value={menu.menuId} display={`${menu.name} · ${formatPaisa(toPaisa(menu.pricePerHead), 'Rs.')} per guest`} onChange={(value) => onChange({ menuId: value })} options={venue.menuPackages.map((m) => ({ value: m.menuId, label: `${m.name} (${formatPaisa(toPaisa(m.pricePerHead), 'Rs.')} per guest)` }))} />
        </div>

        <p className="flex items-center gap-2 text-[12px] text-muted-warm">
          <img src={shieldCheckIcon} alt="" width="16" height="16" />
          Your slot is held for {SLOT_HOLD_MINUTES} minutes while you confirm
        </p>

        <div className="flex flex-col gap-0.5 border-t border-line pt-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[13px] text-muted-warm">{price === null ? 'Enter a guest count' : `${price.guests.toLocaleString('en-US')} guests · ${menu.name} + hall`}</span>
            <span id="booking-price" className="font-heading text-[22px] font-semibold tabular-nums text-ink-strong">{price === null ? 'Rs. –' : formatPaisa(price.totalPaisa, 'Rs.')}</span>
          </p>
          {price && price.billable > price.guests && <p className="text-[11px] text-muted-warm">{menu.name} is charged for at least {price.billable.toLocaleString('en-US')} guests.</p>}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={checkAvailability}
            aria-disabled={checking || undefined}
            className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-primary text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${checking ? 'cursor-wait opacity-80' : ''}`}
          >
            {checking && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
            {checking ? 'Checking…' : 'Check availability'}
          </button>
          <p className="text-center text-xs text-muted-warm">Marketplace services included</p>
          <div role="status" aria-live="polite">
            {shown && <StatusMessage status={shown} hall={hall} onChange={onChange} />}
          </div>
          <p className="text-center text-[12px] text-muted-warm">No payment is required to request a booking</p>
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
        <button type="button" onClick={() => requireAuth('reportListing', () => setReporting(true))} disabled={Boolean(reported)} className="flex items-center justify-center gap-2 text-[12px] text-muted-warm underline hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-primary disabled:no-underline disabled:hover:text-muted-warm">
          <img src={flagIcon} alt="" width="15" height="15" />
          {reported ? 'Listing reported' : 'Report this listing'}
        </button>
        <p role="status" className="text-center text-[12px] text-muted-warm empty:hidden">{reported || ''}</p>
      </div>
      <ReportListingDialog venue={venue} open={reporting} onClose={() => setReporting(false)} onSent={setReported} />
    </div>
  )
}

const chip =
  'min-h-9 cursor-pointer rounded-full border border-outline-strong bg-white px-3 text-[12px] font-medium text-ink-strong transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// Inline result under the button. When the slot is taken: the nearest free dates (same hall + time) and the other
// halls free at that time, as one-tap chips.
function StatusMessage({ status, hall, onChange }) {
  if (status.kind !== 'taken') return <p className="text-center text-[12px] font-medium text-danger">{status.message}</p>
  const { dates = [], halls = [] } = status.alternatives ?? {}
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/20 bg-danger-bg px-3 py-2.5 text-left">
      <p className="text-[12px] font-medium text-danger">{status.message}</p>
      {dates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase text-muted-warm">Nearest free dates in {hall.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {dates.map((date) => (
              <button key={date} type="button" className={chip} onClick={() => onChange({ date })}>
                {formatEventDate(date)}
              </button>
            ))}
          </div>
        </div>
      )}
      {halls.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase text-muted-warm">Free at the same time</p>
          <div className="flex flex-wrap gap-1.5">
            {halls.map((other) => (
              <button key={other.hallId} type="button" className={chip} onClick={() => onChange({ hallId: other.hallId })}>
                {other.name} · {other.capacity.toLocaleString('en-US')} guests
              </button>
            ))}
          </div>
        </div>
      )}
      {dates.length === 0 && halls.length === 0 && <p className="text-[12px] text-muted-warm">No free dates nearby. Try another month on the calendar.</p>}
    </div>
  )
}
