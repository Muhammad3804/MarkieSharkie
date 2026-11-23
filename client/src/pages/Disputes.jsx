import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { DISPUTE_STATUS_LABELS, categoryLabel, listMyDisputes } from '../api/disputes.js'
import { useAuth } from '../features/auth/authContext.js'
import { STATUS_TONES, secondaryButton } from '../features/disputes/ui.js'
import { formatEventDate } from '../lib/format.js'

// /disputes: problems reported on the user's bookings (REQ-48), by them or the other side, with their status.
// Customers and venue owners only (the server returns 403 to other roles).
const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]
const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })

export default function Disputes() {
  const { user } = useAuth()
  const [tab, setTab] = useState('open')
  const [state, setState] = useState({ status: 'loading', data: [], tab: null })
  const [attempt, setAttempt] = useState(0)
  const headingId = useId()
  const allowed = user && (user.role === 'customer' || user.role === 'venue_owner')
  const bookingsPath = user?.role === 'venue_owner' ? '/owner/bookings' : '/bookings'

  useEffect(() => {
    if (!allowed) return
    let live = true
    listMyDisputes({ status: tab })
      .then(({ data }) => live && setState({ status: 'ready', data, tab }))
      .catch(() => live && setState({ status: 'error', data: [], tab }))
    return () => {
      live = false
    }
  }, [tab, attempt, allowed])

  if (!allowed)
    return (
      <div className="page-container py-14">
        <title>Reported problems · MarkieSharkie</title>
        <h1 className="font-heading text-[30px] font-bold text-ink-strong">Reported problems</h1>
        <p className="mt-2 max-w-[52ch] text-[16px] text-muted-warm">Problems are reported on a booking by its customer or its venue owner.</p>
      </div>
    )
  const loading = state.status === 'loading' || state.tab !== tab

  return (
    <div className="page-container py-10 sm:py-14">
      <div className="mx-auto max-w-[880px]">
        <title>Reported problems · MarkieSharkie</title>
        <h1 className="font-heading text-[30px] font-bold text-ink-strong sm:text-[36px]">Reported problems</h1>
        <p className="mt-2 text-[16px] text-muted-warm">
          Problems you or the other side reported on a booking. A MarkieSharkie admin reviews each one. To report a new one, use “Report a problem” on the booking in{' '}
          <Link to={bookingsPath} className="font-medium text-primary underline-offset-2 hover:underline">{user.role === 'venue_owner' ? 'your booking requests' : 'My bookings'}</Link>.
        </p>

        <div role="tablist" aria-label="Status" className="mt-6 flex gap-2">
          {TABS.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={`min-h-10 rounded-full border px-4 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-primary ${tab === t.value ? 'border-primary bg-rose text-primary' : 'border-line text-ink hover:border-ink-strong'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <section aria-labelledby={headingId} aria-busy={loading} className="mt-6">
          <h2 id={headingId} className="sr-only">{tab === 'open' ? 'Open problems' : 'Closed problems'}</h2>
          {loading ? (
            <div className="grid gap-3" aria-label="Loading">
              {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />)}
            </div>
          ) : state.status === 'error' ? (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-3xl border border-line p-6">
              <p className="text-[16px] font-semibold text-ink-strong">Couldn’t load your reported problems.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={secondaryButton}>Try again</button>
            </div>
          ) : state.data.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-outline-strong bg-blush/40 p-8 text-[15px] text-muted-warm">
              {tab === 'open' ? 'Nothing open. If something went wrong with a booking, report it from the booking.' : 'No closed problems yet.'}
            </p>
          ) : (
            <ul className="grid gap-3">
              {state.data.map((d) => (
                <li key={d.id}>
                  <Link to={`/disputes/${d.id}`} className="block rounded-3xl border border-line bg-white p-5 transition-colors hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-heading text-[17px] font-semibold text-ink-strong">{categoryLabel(d.category)}</p>
                        <p className="text-[14px] text-ink">
                          {d.booking.eventName || 'Event'} · {d.venue.name} · {formatEventDate(d.booking.eventDate)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${STATUS_TONES[d.status]}`}>{DISPUTE_STATUS_LABELS[d.status]}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[14px] text-muted-warm">{d.description}</p>
                    <p className="mt-2 text-[13px] text-muted-warm">
                      {d.reference} · {d.raisedByYou ? 'Reported by you' : `Reported by the ${d.raisedByRole === 'customer' ? 'customer' : 'venue'}`} on {dateTime.format(new Date(d.createdAt))}
                      {d.noteCount > 0 && ` · ${d.noteCount} message${d.noteCount === 1 ? '' : 's'}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
