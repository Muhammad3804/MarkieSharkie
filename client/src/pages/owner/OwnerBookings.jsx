import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { confirmBooking, listOwnerBookings, rejectBooking } from '../../api/bookings.js'
import { listMyListings } from '../../api/owner.js'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import { ToastProvider } from '../../features/admin/toast.jsx'
import StatusBadge from '../../features/booking/StatusBadge.jsx'
import { EVENT_TYPES } from '../../features/host/options.js'
import { bookingReference, slotPreset } from '../../lib/booking.js'
import { formatEventDate } from '../../lib/format.js'
import { formatAmount } from '../../lib/money.js'
import { formatPkMobile } from '../../lib/phone.js'

// /owner/bookings: the venue owner's booking inbox (EUC-15, REQ-21). Requests to confirm or reject (with a reason),
// confirmed events, and past or cancelled ones, from GET /api/owner/bookings. Tab, venue and page live in the URL.
const TABS = [
  { value: 'requested', label: 'Requests' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'closed', label: 'Past & cancelled' },
  { value: 'all', label: 'All' },
]
const EVENT_LABEL = Object.fromEntries(EVENT_TYPES.map((e) => [e.value, e.label]))
// '19:00' -> '7:00 PM' (the customer pages show 12-hour times too).
const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const stamp = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })

export default function OwnerBookings() {
  return (
    <ToastProvider>
      <Inbox />
    </ToastProvider>
  )
}

function Inbox() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'requested'
  const venueId = params.get('venue') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const key = `${tab}|${venueId}|${page}`
  const [result, setResult] = useState({ key: null, status: 'loading', data: null })
  const [attempt, setAttempt] = useState(0)
  const [venues, setVenues] = useState([])
  const [dialog, setDialog] = useState(null) // { kind: 'confirm' | 'reject', booking }
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    listMyListings()
      .then((rows) => setVenues(rows.filter((v) => v.approvalStatus === 'approved' || v.approvalStatus === 'suspended')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    listOwnerBookings({ status: tab, venueId, page })
      .then((data) => !cancelled && setResult({ key, status: 'ready', data }))
      .catch(() => !cancelled && setResult({ key, status: 'error', data: null }))
    return () => {
      cancelled = true
    }
  }, [tab, venueId, page, key, attempt])

  // New requests can arrive while the page is open: read again when the tab comes back into view.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const set = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (k === 'tab' && v === 'requested') || (k === 'page' && v === 1)) next.delete(k)
      else next.set(k, String(v))
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }
  const status = result.key === key ? result.status : 'loading'
  const data = result.key === key ? result.data : null
  const rows = data?.data ?? []
  const counts = data?.counts

  return (
    <main id="main" className="mx-auto w-full max-w-[1040px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <title>Booking requests | MarkieSharkie</title>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 data-page-heading tabIndex={-1} className="font-heading text-[28px] font-semibold leading-tight text-ink-strong outline-none sm:text-[34px]">
            Bookings
          </h1>
          <p className="mt-1 text-[15px] text-muted-warm">Confirm or decline requests for your venues. Each slot is held for the customer until you decide.</p>
        </div>
        <Button to="/owner/listings" variant="outline" className="min-h-11 px-5">
          My listings
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Booking status" className="-mx-1 flex max-w-full flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-current={t.value === tab ? 'page' : undefined}
              onClick={() => set({ tab: t.value })}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${t.value === tab ? 'border-primary bg-primary/5 text-primary' : 'border-line text-ink-strong hover:bg-surface'}`}
            >
              {t.label}
              {counts && <span className="rounded-full bg-surface px-2 text-[12px] tabular-nums text-ink">{counts[t.value]}</span>}
            </button>
          ))}
        </nav>
        {venues.length > 1 && (
          <label className="flex min-w-0 items-center gap-2 text-[14px] text-ink-strong">
            Venue
            <select value={venueId} onChange={(e) => set({ venue: e.target.value })} className="h-11 min-w-0 max-w-[220px] cursor-pointer rounded-xl border border-outline-strong bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-primary">
              <option value="">All venues</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {status === 'loading' && (
        <div aria-busy="true" aria-label="Loading bookings" className="mt-6 grid gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="mt-6 rounded-2xl border border-line bg-white p-6">
          <p className="text-[16px] font-semibold text-ink-strong">We couldn’t load your bookings.</p>
          <Button onClick={reload} className="mt-4 min-h-11 px-5">
            Try again
          </Button>
        </div>
      )}
      {status === 'ready' && rows.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-outline-strong px-5 py-10 text-center">
          <p className="text-[17px] font-semibold text-ink-strong">{tab === 'requested' ? 'No requests waiting' : 'Nothing here yet'}</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-muted-warm">
            {tab === 'requested' ? 'When a customer books one of your halls, the request shows up here for you to confirm.' : 'Bookings show up here as customers book your venues.'}
          </p>
        </div>
      )}
      {status === 'ready' && rows.length > 0 && (
        <>
          <ul className="mt-6 grid gap-4">
            {rows.map((b) => (
              <InboxCard key={b.bookingId} booking={b} onAction={(kind) => setDialog({ kind, booking: b })} />
            ))}
          </ul>
          {data.pageCount > 1 && (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3 text-[14px]">
              <Button variant="outline" disabled={page <= 1} onClick={() => set({ page: page - 1 })} className="min-h-11 px-4 disabled:opacity-40">
                Previous
              </Button>
              <span className="text-muted-warm">
                Page {page} of {data.pageCount}
              </span>
              <Button variant="outline" disabled={page >= data.pageCount} onClick={() => set({ page: page + 1 })} className="min-h-11 px-4 disabled:opacity-40">
                Next
              </Button>
            </nav>
          )}
        </>
      )}

      <ConfirmDialog
        open={dialog?.kind === 'confirm'}
        title={dialog && `Confirm ${dialog.booking.eventName || 'this booking'}?`}
        body={dialog && `${formatEventDate(dialog.booking.date)}, ${slotPreset(dialog.booking.slot).label}, ${dialog.booking.hallName}. ${dialog.booking.guestCount} guests, ${formatAmount(dialog.booking.totalAmount, 'Rs.')}. The customer sees it as confirmed and can send invitations.`}
        confirmLabel="Confirm booking"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          try {
            await confirmBooking(dialog.booking.bookingId)
          } catch (error) {
            reload()
            throw error
          }
          reload()
          return `${bookingReference(dialog.booking.bookingId)} confirmed.`
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'reject'}
        title={dialog && `Decline ${dialog.booking.eventName || 'this request'}?`}
        body="The slot opens up for other customers. The customer sees your reason."
        confirmLabel="Decline request"
        tone="danger"
        field={{ label: 'Reason for the customer', required: true, minLength: 5, hint: 'Be specific, e.g. “The hall is closed for renovation that week.”' }}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          try {
            await rejectBooking(dialog.booking.bookingId, reason)
          } catch (error) {
            reload()
            throw error
          }
          reload()
          return `${bookingReference(dialog.booking.bookingId)} declined. The slot is free again.`
        }}
      />
    </main>
  )
}

function InboxCard({ booking: b, onAction }) {
  const slot = slotPreset(b.slot)
  const open = b.status === 'requested' || b.status === 'held'
  const created = b.events?.[0]?.at ?? b.createdAt
  return (
    <li className="min-w-0 rounded-3xl border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words font-heading text-[18px] font-semibold text-ink-strong">{b.eventName || EVENT_LABEL[b.eventType]}</h2>
          <p className="text-[14px] text-ink">
            {b.venueName} · {b.hallName}
          </p>
        </div>
        <StatusBadge booking={b} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-4">
        <div>
          <dt className="text-muted-warm">Date</dt>
          <dd className="font-medium text-ink-strong">{formatEventDate(b.date)}</dd>
        </div>
        <div>
          <dt className="text-muted-warm">Time</dt>
          <dd className="font-medium text-ink-strong">
            {slot.label}, {time12(b.startTime)} – {time12(b.endTime)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-warm">Guests</dt>
          <dd className="font-medium text-ink-strong">
            {b.guestCount.toLocaleString('en-US')} · {EVENT_LABEL[b.eventType]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-warm">Total</dt>
          <dd className="font-medium tabular-nums text-ink-strong">{formatAmount(b.totalAmount, 'Rs.')}</dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-2 rounded-2xl bg-surface px-4 py-3 text-[14px] sm:grid-cols-2">
        <p className="min-w-0 break-words">
          <span className="text-muted-warm">Host: </span>
          <span className="font-medium text-ink-strong">{b.hostName || b.customer?.name}</span>{' '}
          {b.hostPhone && (
            <a href={`tel:${b.hostPhone}`} className="text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
              {formatPkMobile(b.hostPhone)}
            </a>
          )}
        </p>
        <p className="min-w-0 break-words">
          <span className="text-muted-warm">Menu: </span>
          <span className="text-ink-strong">
            {b.menuName ?? 'None'}
            {b.menuPricePerHead ? ` (${formatAmount(b.menuPricePerHead, 'Rs.')} × ${b.billableGuests})` : ''}
          </span>
        </p>
        {b.addOns.length > 0 && (
          <p className="min-w-0 break-words sm:col-span-2">
            <span className="text-muted-warm">Add-ons: </span>
            {b.addOns.map((a) => `${a.quantity} × ${a.name} (${formatAmount(a.unitPrice, 'Rs.')})`).join(', ')}
          </p>
        )}
        {b.specialRequests && (
          <p className="min-w-0 whitespace-pre-line break-words sm:col-span-2">
            <span className="text-muted-warm">Requests: </span>“{b.specialRequests}”
          </p>
        )}
        {b.status === 'cancelled' && b.cancellationReason && (
          <p className="min-w-0 break-words sm:col-span-2">
            <span className="text-muted-warm">Reason: </span>
            {b.cancellationReason.replace(/^Rejected by the venue: /, '')}
            {Number(b.refundAmount) > 0 && ` · Refund owed to the customer: ${formatAmount(b.refundAmount, 'Rs.')} (${b.refundPercent}%)`}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="mr-auto text-[13px] text-muted-warm">
          Ref <span className="font-semibold tabular-nums text-ink">{bookingReference(b.bookingId)}</span>
          {created && ` · requested ${stamp.format(new Date(created))}`}
        </span>
        {open && (
          <>
            <Button variant="outline" onClick={() => onAction('reject')} className="min-h-11 px-4">
              Decline<span className="sr-only"> {bookingReference(b.bookingId)}</span>
            </Button>
            <Button onClick={() => onAction('confirm')} className="min-h-11 px-5">
              Confirm<span className="sr-only"> {bookingReference(b.bookingId)}</span>
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
