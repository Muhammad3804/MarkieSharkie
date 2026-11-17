import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getBooking } from '../../../api/bookings.js'
import { clearBookingDraft } from '../draft.js'
import { dropHold } from '../hold.js'
import FlowHeaderShell from '../FlowHeader.jsx'
import StatusBadge from '../StatusBadge.jsx'
import { downloadIcs } from '../ics.js'
import { bookingReference, slotPreset } from '../../../lib/booking.js'
import { formatEventDate } from '../../../lib/format.js'
import { formatAmount } from '../../../lib/money.js'

const NEXT_STEPS = [
  ['The venue reviews your request', 'Usually within a day. Your slot stays reserved for you meanwhile.'],
  ['Pay the advance', 'Once accepted, pay the advance to the venue directly. They record it here.'],
  ['Your booking is confirmed', 'Then you can send invitations and book décor for the event.'],
]

// /venues/:id/book/confirmation?ref=<bookingId>: the request is in, status "Pending owner approval" (REQ-19, REQ-21).
export default function BookingConfirmation({ venue }) {
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref')
  const [state, setState] = useState({ ref: null, status: 'loading', booking: null })
  const [attempt, setAttempt] = useState(0)
  const headingRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!ref) return
    getBooking(ref)
      .then((booking) => !cancelled && setState({ ref, status: booking ? 'ready' : 'not-found', booking }))
      .catch((error) => {
        console.error('[bookings] getBooking failed', error)
        if (!cancelled) setState({ ref, status: 'error', booking: null })
      })
    return () => {
      cancelled = true
    }
  }, [ref, attempt])

  // The request is in: forget the draft and this tab's hold reference (the slot is booked, so nothing is released).
  useEffect(() => {
    clearBookingDraft(venue.id)
    dropHold(venue.id).catch((error) => console.warn('[bookings] hold cleanup failed', error))
  }, [venue.id])

  const current = !ref ? { status: 'not-found' } : state.ref === ref ? state : { status: 'loading' }
  useEffect(() => {
    if (current.status === 'ready') headingRef.current?.focus()
  }, [current.status])

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <title>{`Booking requested · ${venue.name} | MarkieSharkie`}</title>
      <FlowHeaderShell>
        <Link to="/bookings" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-[14px] font-medium text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-5 sm:text-[15px]">
          My bookings
        </Link>
      </FlowHeaderShell>
      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14" aria-busy={current.status === 'loading' || undefined}>
        {current.status === 'loading' && (
          <div className="flex flex-col gap-4" aria-label="Loading your booking">
            <div className="size-14 animate-pulse rounded-full bg-surface motion-reduce:animate-none" />
            <div className="h-9 w-3/4 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
            <div className="h-64 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />
          </div>
        )}
        {current.status === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-3">
            <h1 className="font-heading text-[28px] font-semibold text-ink-strong">Couldn’t load your booking</h1>
            <p className="text-[16px] text-muted-warm">Your request was sent. Check your connection and try again, or open My bookings.</p>
            <button type="button" onClick={() => {
                setState({ ref: null, status: 'loading', booking: null })
                setAttempt((n) => n + 1)
              }} className="min-h-12 cursor-pointer rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Try again
            </button>
          </div>
        )}
        {current.status === 'not-found' && (
          <div className="flex flex-col items-start gap-3">
            <h1 className="font-heading text-[28px] font-semibold text-ink-strong">Booking not found</h1>
            <p className="text-[16px] text-muted-warm">We couldn’t find that booking. Your requests are listed in My bookings.</p>
            <Link to="/bookings" className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Open My bookings
            </Link>
          </div>
        )}
        {current.status === 'ready' && <Confirmed booking={current.booking} headingRef={headingRef} />}
      </main>
    </div>
  )
}

function Confirmed({ booking, headingRef }) {
  const slot = slotPreset(booking.slot)
  return (
    <>
      <span className="flex size-14 items-center justify-center rounded-full bg-success-bg text-success" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="mt-5 font-heading text-[28px] font-semibold leading-tight text-balance text-ink-strong outline-none sm:text-[36px]">
        Request sent to {booking.venueName}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusBadge booking={booking} />
        <p className="text-[15px] text-muted-warm">
          Reference <span className="font-semibold tabular-nums text-ink-strong">{bookingReference(booking.bookingId)}</span>
        </p>
      </div>

      <article className="mt-8 rounded-3xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(41,28,31,0.05),0_16px_40px_-16px_rgba(41,28,31,0.18)] sm:p-6">
        <h2 className="font-heading text-[19px] font-semibold text-ink-strong">{booking.eventName}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-warm">When</dt>
            <dd className="text-ink-strong">
              {formatEventDate(booking.date)}, {slot.label} ({slot.time})
            </dd>
          </div>
          <div>
            <dt className="text-muted-warm">Where</dt>
            <dd className="text-ink-strong">
              {booking.hallName}, {booking.venueName}
            </dd>
          </div>
          <div>
            <dt className="text-muted-warm">Guests</dt>
            <dd className="text-ink-strong">{booking.guestCount.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt className="text-muted-warm">Total</dt>
            <dd className="font-semibold tabular-nums text-ink-strong">
              {formatAmount(booking.totalAmount, 'Rs.')} <span className="font-normal text-muted-warm">· advance {formatAmount(booking.advanceDue, 'Rs.')}</span>
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => downloadIcs(booking)}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary px-5 text-[15px] font-semibold text-primary hover:bg-blush focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
            </svg>
            Add to calendar
          </button>
          <Link to="/bookings" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(122,23,49,0.6)] hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            View my bookings
          </Link>
        </div>
      </article>

      <section aria-labelledby="next-title" className="mt-10">
        <h2 id="next-title" className="font-heading text-[20px] font-semibold text-ink-strong">
          What happens next
        </h2>
        <ol className="mt-4 grid gap-4">
          {NEXT_STEPS.map(([title, body], index) => (
            <li key={title} className="flex gap-4">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ${index === 0 ? 'bg-primary text-white' : 'bg-rose text-primary'}`} aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <p className="text-[16px] font-semibold text-ink-strong">{title}</p>
                <p className="text-[15px] text-muted-warm">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <p className="mt-8 text-[14px] text-muted-warm">
        <Link to={`/venues/${booking.venueId}`} className="font-medium text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
          Back to {booking.venueName}
        </Link>
      </p>
    </>
  )
}
