import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookingError, cancelBooking, devOwnerAction, listMyBookings } from '../api/bookings.js'
import { subscribeMockStores } from '../api/mockStore.js'
import StatusBadge from '../features/booking/StatusBadge.jsx'
import { downloadIcs } from '../features/booking/ics.js'
import { policyInfo, refundFor } from '../features/booking/pricing.js'
import { bookingReference, slotPreset } from '../lib/booking.js'
import { daysBetween } from '../lib/days.js'
import { formatEventDate, todayKey } from '../lib/format.js'
import { formatAmount, formatPaisa, toPaisa } from '../lib/money.js'

// /bookings: the customer's bookings with live status (REQ-21) and cancel with a reason (REQ-22).
// TODO(auth): customer only; this moves into the /app dashboard once accounts exist. Until the owner dashboard is
// built, development builds show the owner's accept / reject / record-advance actions on each booking.
const ACTIVE = ['requested', 'held', 'confirmed']
const isUpcoming = (booking) => ACTIVE.includes(booking.status)
const canCancel = (booking, today) => isUpcoming(booking) && daysBetween(today, booking.date) > 0

export default function MyBookings() {
  const [state, setState] = useState({ status: 'loading', bookings: [] })
  const [version, setVersion] = useState(0)
  const [cancelling, setCancelling] = useState(null)
  const [notice, setNotice] = useState('')
  const noticeRef = useRef(null)
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const [today] = useState(todayKey)

  // Refresh after any change here or in another tab (e.g. the venue accepting).
  useEffect(() => subscribeMockStores(reload), [reload])
  useEffect(() => {
    let cancelled = false
    listMyBookings()
      .then((bookings) => !cancelled && setState({ status: 'ready', bookings }))
      .catch((error) => {
        console.error('[bookings] list failed', error)
        if (!cancelled) setState((current) => (current.status === 'ready' ? current : { status: 'error', bookings: [] }))
      })
    return () => {
      cancelled = true
    }
  }, [version])

  const upcoming = state.bookings.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date))
  const past = state.bookings.filter((b) => !isUpcoming(b))

  return (
    <div className="page-container py-10 sm:py-14">
      <div className="mx-auto max-w-[1040px]">
      <title>My bookings · MarkieSharkie</title>
      <h1 className="font-heading text-[30px] font-bold text-ink-strong sm:text-[36px]">My bookings</h1>
      <p className="mt-2 text-[16px] text-muted-warm">Requests, confirmed events and their status. Payments are made to the venue directly.</p>
      <p ref={noticeRef} tabIndex={-1} role="status" className="mt-4 text-[15px] font-medium text-success outline-none empty:hidden">
        {notice}
      </p>

      {state.status === 'loading' && (
        <div className="mt-8 grid gap-4" aria-busy="true" aria-label="Loading your bookings">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {state.status === 'error' && (
        <div role="alert" className="mt-8 flex flex-col items-start gap-3 rounded-3xl border border-line p-6">
          <p className="text-[16px] font-semibold text-ink-strong">Couldn’t load your bookings.</p>
          <p className="text-[15px] text-muted-warm">Check your connection and try again.</p>
          <button type="button" onClick={reload} className="min-h-11 cursor-pointer rounded-xl bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && state.bookings.length === 0 && (
        <div className="mt-8 flex flex-col items-start gap-3 rounded-3xl border border-dashed border-outline-strong bg-blush/40 p-8">
          <h2 className="font-heading text-[20px] font-semibold text-ink-strong">No bookings yet</h2>
          <p className="max-w-[52ch] text-[15px] text-muted-warm">Find a venue, pick a date and press Check availability. Your requests show up here with their status.</p>
          <Link to="/explore" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Explore venues
          </Link>
        </div>
      )}
      {state.status === 'ready' && state.bookings.length > 0 && (
        <>
          <BookingList title="Upcoming" bookings={upcoming} today={today} onCancel={setCancelling} onNotice={setNotice} empty="No upcoming bookings." />
          <BookingList title="Past and cancelled" bookings={past} today={today} onCancel={setCancelling} onNotice={setNotice} empty="Nothing here yet." />
        </>
      )}

      <CancelDialog
        booking={cancelling}
        today={today}
        onClose={() => setCancelling(null)}
        onCancelled={(booking) => {
          setCancelling(null)
          setNotice(`${bookingReference(booking.bookingId)} cancelled. The venue has been told.`)
          // The Cancel button that opened the dialog is gone (the booking moved lists), so focus the notice.
          requestAnimationFrame(() => noticeRef.current?.focus())
        }}
      />
      </div>
    </div>
  )
}

function BookingList({ title, bookings, today, onCancel, onNotice, empty }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="font-heading text-[20px] font-semibold text-ink-strong">
        {title} <span className="text-muted-warm">({bookings.length})</span>
      </h2>
      {bookings.length === 0 ? (
        <p className="mt-3 text-[15px] text-muted-warm">{empty}</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {bookings.map((booking) => (
            <BookingCard key={booking.bookingId} booking={booking} today={today} onCancel={onCancel} onNotice={onNotice} />
          ))}
        </ul>
      )}
    </section>
  )
}

function BookingCard({ booking, today, onCancel, onNotice }) {
  const slot = slotPreset(booking.slot)
  const reference = bookingReference(booking.bookingId)
  return (
    <li data-booking={booking.bookingId} className="rounded-3xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(41,28,31,0.05),0_16px_40px_-18px_rgba(41,28,31,0.18)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-[18px] font-semibold text-ink-strong">{booking.eventName}</h3>
          <p className="text-[15px] text-ink">
            <Link to={`/venues/${booking.venueId}`} className="font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
              {booking.venueName}
            </Link>{' '}
            · {booking.hallName}, {booking.venueCity}
          </p>
        </div>
        <StatusBadge booking={booking} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-4">
        <div>
          <dt className="text-muted-warm">Date</dt>
          <dd className="font-medium text-ink-strong">{formatEventDate(booking.date)}</dd>
        </div>
        <div>
          <dt className="text-muted-warm">Time</dt>
          <dd className="font-medium text-ink-strong">
            {slot.label}, {slot.time}
          </dd>
        </div>
        <div>
          <dt className="text-muted-warm">Guests</dt>
          <dd className="font-medium text-ink-strong">{booking.guestCount.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt className="text-muted-warm">Total</dt>
          <dd className="font-medium tabular-nums text-ink-strong">{formatAmount(booking.totalAmount, 'Rs.')}</dd>
        </div>
      </dl>
      <StatusNote booking={booking} />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="mr-auto text-[13px] text-muted-warm">
          Ref <span className="font-semibold tabular-nums text-ink">{reference}</span>
        </span>
        {isUpcoming(booking) && (
          <button type="button" onClick={() => downloadIcs(booking)} className={secondaryButton}>
            Add to calendar
          </button>
        )}
        {canCancel(booking, today) && (
          <button type="button" onClick={() => onCancel(booking)} className={`${secondaryButton} border-danger/40 text-danger hover:border-danger hover:bg-danger-bg`}>
            Cancel booking<span className="sr-only"> {reference}</span>
          </button>
        )}
      </div>
      {import.meta.env.DEV && <DevOwnerActions booking={booking} onNotice={onNotice} />}
    </li>
  )
}

function StatusNote({ booking }) {
  const text = {
    requested: 'Waiting for the venue to accept. Your slot is reserved meanwhile.',
    held: `Accepted. Pay the advance of ${formatAmount(booking.advanceDue, 'Rs.')} to the venue to confirm.`,
    confirmed: `Advance of ${formatAmount(booking.advanceAmount, 'Rs.')} recorded. You’re all set.`,
    completed: 'This event has taken place.',
  }[booking.status]
  if (booking.status === 'cancelled') return <p className="mt-3 text-[14px] text-muted-warm">Reason: {booking.cancellationReason}</p>
  return text ? <p className="mt-3 text-[14px] text-muted-warm">{text}</p> : null
}

const secondaryButton =
  'inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-[14px] font-semibold text-ink-strong transition-colors hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// DEV ONLY: stands in for the owner dashboard (REQ-21, EUC-15) so the whole status path can be demoed.
function DevOwnerActions({ booking, onNotice }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const actions = { requested: [['accept', 'Accept request'], ['reject', 'Reject']], held: [['advance', 'Record advance'], ['reject', 'Reject']] }[booking.status]
  if (!actions) return null
  async function run(action, label) {
    setBusy(true)
    setError('')
    try {
      await devOwnerAction(booking.bookingId, action)
      onNotice(`Owner (dev): ${label.toLowerCase()} done for ${bookingReference(booking.bookingId)}.`)
    } catch (err) {
      setError(err instanceof BookingError ? err.message : 'That didn’t work.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-info/40 bg-info-bg/60 px-3 py-2">
      <span className="text-[12px] font-semibold uppercase text-info">Owner (dev only)</span>
      {actions.map(([action, label]) => (
        <button key={action} type="button" disabled={busy} onClick={() => run(action, label)} className="min-h-9 cursor-pointer rounded-lg border border-info/40 bg-white px-3 text-[13px] font-medium text-info hover:bg-info-bg focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60">
          {label}
        </button>
      ))}
      {error && (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      )}
    </div>
  )
}

// Cancel with a required reason (REQ-22). Shows what the venue's policy returns; the policy never blocks cancelling.
function CancelDialog({ booking, today, onClose, onCancelled }) {
  const dialog = useRef(null)
  const [reason, setReason] = useState('')
  const [state, setState] = useState({ status: 'idle', error: '' })
  const [shownFor, setShownFor] = useState(null)
  if (booking && shownFor !== booking.bookingId) {
    setShownFor(booking.bookingId)
    setReason('')
    setState({ status: 'idle', error: '' })
  }

  useEffect(() => {
    const element = dialog.current
    if (booking && !element.open) element.showModal()
    if (!booking && element.open) element.close()
  }, [booking])

  const daysBefore = booking ? daysBetween(today, booking.date) : 0
  const advancePaid = booking ? toPaisa(booking.advanceAmount) : 0
  const refund = booking ? refundFor(booking.bookingTerms, advancePaid, daysBefore) : null
  const busy = state.status === 'working'

  async function confirm(event) {
    event.preventDefault()
    if (busy) return
    if (reason.trim().length < 5) {
      setState({ status: 'idle', error: 'Tell the venue why you’re cancelling (at least 5 characters).' })
      document.getElementById('cancel-reason')?.focus()
      return
    }
    setState({ status: 'working', error: '' })
    try {
      const cancelled = await cancelBooking(booking.bookingId, reason)
      onCancelled(cancelled)
    } catch (error) {
      setState({ status: 'idle', error: error instanceof BookingError ? error.message : 'We couldn’t cancel. Check your connection and try again.' })
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="cancel-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[500px] rounded-3xl bg-white p-0 shadow-[0_24px_64px_-16px_rgba(41,28,31,0.35)] backdrop:bg-ink-strong/45"
    >
      {booking && (
        <form onSubmit={confirm} noValidate className="flex flex-col gap-4 p-6 sm:p-7">
          <h2 id="cancel-title" className="font-heading text-[22px] font-semibold text-ink-strong">
            Cancel this booking?
          </h2>
          <p className="text-[15px] text-ink">
            {booking.eventName} at {booking.venueName}, {formatEventDate(booking.date)}. The slot is released for other customers.
          </p>
          <div className="rounded-2xl bg-blush p-4 text-[15px]">
            <p className="font-semibold text-ink-strong">{policyInfo(booking.bookingTerms).label} cancellation policy</p>
            {advancePaid === 0 ? (
              <p className="mt-1 text-ink">You haven’t paid an advance yet, so there’s nothing to refund.</p>
            ) : (
              <p className="mt-1 text-ink">
                Cancelling {daysBefore} day{daysBefore === 1 ? '' : 's'} before the event returns {refund.percent}%: <strong className="tabular-nums">{formatPaisa(refund.paisa, 'Rs.')}</strong> of your {formatPaisa(advancePaid, 'Rs.')} advance.
              </p>
            )}
            <p className="mt-1 text-[13px] text-muted-warm">The venue returns any refund to you directly. MarkieSharkie doesn’t handle payments.</p>
          </div>
          <div>
            <label htmlFor="cancel-reason" className="mb-2 block text-[15px] font-medium text-ink-strong">
              Reason for cancelling
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={state.error ? 'true' : undefined}
              aria-describedby={state.error ? 'cancel-error' : undefined}
              className="block w-full resize-y rounded-xl border border-outline-strong px-4 py-3 text-[16px] text-ink-strong hover:border-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary aria-[invalid=true]:border-danger"
            />
            {state.error && (
              <p id="cancel-error" role="alert" className="mt-2 text-[14px] text-danger">
                {state.error}
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" autoFocus onClick={onClose} disabled={busy} className="min-h-12 cursor-pointer rounded-xl border border-line px-5 text-[15px] font-semibold text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Keep booking
            </button>
            <button type="submit" aria-disabled={busy || undefined} className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-danger px-5 text-[15px] font-semibold text-white hover:bg-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger ${busy ? 'cursor-wait opacity-80' : ''}`}>
              {busy && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
              {busy ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
