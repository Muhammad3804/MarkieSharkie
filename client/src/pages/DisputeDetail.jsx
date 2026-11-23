import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { DISPUTE_STATUS_LABELS, OUTCOME_LABELS, categoryLabel, evidenceObjectUrl, getDispute, replyToDispute } from '../api/disputes.js'
import { ApiError } from '../api/http.js'
import { STATUS_TONES, primaryButton, secondaryButton } from '../features/disputes/ui.js'
import { formatEventDate } from '../lib/format.js'
import { formatAmount } from '../lib/money.js'

// /disputes/:id: one reported problem for the customer or the venue owner of the booking (REQ-48). Both sides see
// the description, the photos and every message; internal admin notes are never sent here. Replies until an admin
// resolves or rejects it. Anyone else gets "not found" from the server.
const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })
const at = (iso) => when.format(new Date(iso))
const SIDE = { customer: 'Customer', venue_owner: 'Venue', admin: 'MarkieSharkie' }

function Photo({ file, index }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    let made = null
    evidenceObjectUrl(file.url)
      .then((u) => {
        made = u
        if (live) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [file.url])
  const label = `Photo ${index + 1}, added by ${file.byYou ? 'you' : file.fromRole === 'customer' ? 'the customer' : 'the venue'}`
  if (failed) return <div className="grid aspect-square place-items-center rounded-xl bg-surface p-2 text-center text-[12px] text-muted-warm">Couldn’t load photo</div>
  if (!url) return <div className="aspect-square animate-pulse rounded-xl bg-surface motion-reduce:animate-none" aria-label="Loading photo" />
  return (
    <a href={url} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <img src={url} alt={label} className="aspect-square w-full object-cover" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

export default function DisputeDetail() {
  const { id } = useParams()
  const { state: navState } = useLocation()
  const [state, setState] = useState({ status: 'loading', dispute: null })
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let live = true
    getDispute(id)
      .then(({ dispute }) => live && setState({ status: 'ready', dispute }))
      .catch((err) => live && setState((s) => (s.status === 'ready' ? s : { status: err instanceof ApiError && err.status === 404 ? 'missing' : 'error', dispute: null })))
    return () => {
      live = false
    }
  }, [id, attempt])

  // The other side or the admin may answer meanwhile.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const d = state.dispute
  return (
    <div className="page-container py-10 sm:py-14">
      <div className="mx-auto max-w-[760px]">
        <title>Reported problem · MarkieSharkie</title>
        <Link to="/disputes" className="text-[14px] font-medium text-primary underline-offset-2 hover:underline">← Reported problems</Link>
        {state.status === 'loading' ? (
          <div className="mt-6 grid gap-3" aria-busy="true" aria-label="Loading">
            <div className="h-10 w-2/3 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
            <div className="h-40 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />
          </div>
        ) : state.status === 'missing' ? (
          <div className="mt-6">
            <h1 className="font-heading text-[28px] font-bold text-ink-strong">Not found</h1>
            <p className="mt-2 text-[16px] text-muted-warm">This problem doesn’t exist or isn’t on one of your bookings.</p>
          </div>
        ) : state.status === 'error' ? (
          <div role="alert" className="mt-6 flex flex-col items-start gap-3 rounded-3xl border border-line p-6">
            <p className="text-[16px] font-semibold text-ink-strong">Couldn’t load this problem.</p>
            <button type="button" onClick={reload} className={secondaryButton}>Try again</button>
          </div>
        ) : (
          <>
            {navState?.opened && (
              <p role="status" className="mt-5 rounded-2xl bg-success-bg px-4 py-3 text-[15px] text-success">
                Sent. A MarkieSharkie admin will review it, and both sides get an email with the decision.
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-heading text-[28px] font-bold text-ink-strong sm:text-[32px]">{categoryLabel(d.category)}</h1>
                <p className="mt-1 text-[15px] text-ink">
                  {d.booking.eventName || 'Event'} · {d.venue.name} · {formatEventDate(d.booking.eventDate)}
                </p>
                <p className="text-[14px] text-muted-warm">
                  Booking {d.reference} · {d.raisedByYou ? 'reported by you' : `reported by the ${d.raisedByRole === 'customer' ? 'customer' : 'venue'}`} on {at(d.createdAt)}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${STATUS_TONES[d.status]}`}>{DISPUTE_STATUS_LABELS[d.status]}</span>
            </div>

            {(d.status === 'resolved' || d.status === 'rejected') && (
              <section aria-label="Decision" className={`mt-6 rounded-3xl p-5 ${d.status === 'resolved' ? 'bg-success-bg' : 'bg-surface'}`}>
                <p className="text-[16px] font-semibold text-ink-strong">
                  {d.status === 'resolved' ? `Decision: ${OUTCOME_LABELS[d.outcome]}` : 'Closed without a decision'}
                </p>
                {d.compensation && (
                  <p className="mt-1 text-[15px] text-ink">
                    Compensation agreed: <span className="font-semibold tabular-nums">{formatAmount(d.compensation, 'Rs.')}</span>. It’s settled between you and the {d.yourRole === 'customer' ? 'venue' : 'customer'}; MarkieSharkie doesn’t move money.
                  </p>
                )}
                <p className="mt-2 whitespace-pre-line text-[15px] text-ink">{d.resolution}</p>
                <p className="mt-2 text-[13px] text-muted-warm">{at(d.resolvedAt)}</p>
              </section>
            )}
            {d.status === 'under_review' && <p className="mt-6 rounded-2xl bg-rose px-4 py-3 text-[15px] text-primary">An admin is reviewing this. You can still add details below.</p>}

            <section aria-labelledby="what-happened" className="mt-6 rounded-3xl border border-line bg-white p-5 sm:p-6">
              <h2 id="what-happened" className="text-[15px] font-semibold text-ink-strong">What happened</h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{d.description}</p>
              {d.files.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {d.files.map((file, i) => <Photo key={file.id} file={file} index={i} />)}
                </div>
              )}
            </section>

            <Messages dispute={d} onSent={(next) => setState({ status: 'ready', dispute: next })} />
          </>
        )}
      </div>
    </div>
  )
}

function Messages({ dispute, onSent }) {
  const id = useId()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listEnd = useRef(null)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!body.trim()) {
      setError('Write a message first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { dispute: next } = await replyToDispute(dispute.id, body)
      setBody('')
      onSent(next)
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ block: 'nearest' }))
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 0 && err.status < 500 ? err.message : 'Couldn’t send. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mt-6">
      <h2 id={`${id}-title`} className="font-heading text-[20px] font-semibold text-ink-strong">Messages</h2>
      <p className="text-[14px] text-muted-warm">Seen by you, the {dispute.yourRole === 'customer' ? 'venue' : 'customer'} and MarkieSharkie.</p>
      {dispute.notes.length === 0 ? (
        <p className="mt-3 text-[15px] text-muted-warm">No messages yet.</p>
      ) : (
        <ol className="mt-3 grid gap-2.5">
          {dispute.notes.map((n) => (
            <li key={n.id} className={`rounded-2xl px-4 py-3 ${n.byYou ? 'ml-6 bg-blush/60 sm:ml-16' : n.authorRole === 'admin' ? 'border border-primary/30 bg-rose' : 'mr-6 bg-surface sm:mr-16'}`}>
              <p className="text-[13px] font-semibold text-ink-strong">
                {n.byYou ? 'You' : n.authorName} <span className="font-normal text-muted-warm">· {SIDE[n.authorRole]} · {at(n.createdAt)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-[15px] text-ink">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
      <div ref={listEnd} />
      {dispute.canReply ? (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <label htmlFor={`${id}-body`} className="text-[14px] font-semibold text-ink-strong">Add a message</label>
          <textarea id={`${id}-body`} rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="w-full rounded-xl border border-outline-strong px-3 py-2.5 text-[15px] text-ink-strong placeholder:text-placeholder focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30" placeholder="More details, or an answer to the other side." />
          {error && <p id={`${id}-error`} role="alert" className="text-[14px] text-danger">{error}</p>}
          <button type="submit" aria-disabled={busy || undefined} className={`${primaryButton} self-start`}>{busy ? 'Sending…' : 'Send message'}</button>
        </form>
      ) : (
        <p className="mt-4 text-[14px] text-muted-warm">This problem is closed. If something else went wrong, report a new problem from the booking.</p>
      )}
    </section>
  )
}
