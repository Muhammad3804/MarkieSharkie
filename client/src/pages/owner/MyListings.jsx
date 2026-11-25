import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { reopenListingForChanges } from '../../api/host.js'
import { getListingPhotoChecks, listMyListings, retryListingPhotoChecks, setListingActive, withdrawEdits } from '../../api/owner.js'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import { ToastProvider } from '../../features/admin/toast.jsx'
import { useToast } from '../../features/admin/toastContext.js'
import { resetDraftStore } from '../../features/host/draftStore.js'

// /owner/listings: the venue owner's listings (EUC-04, REQ-5, REQ-7). Status per listing, edit a live venue (some
// changes go live at once, the rest wait for the admin: srs-alignment #35), withdraw waiting edits, deactivate /
// reactivate, and "Edit and resubmit" for listings the admin sent back.

const AI_REJECTION_REASON = 'AI-generated images'
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })
const day = (iso) => (iso ? dateFmt.format(new Date(iso)) : '')

const TONES = {
  success: 'bg-success-bg text-success',
  pending: 'bg-pending-bg text-pending',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-surface text-ink',
}

function statusOf(v) {
  if (v.approvalStatus === 'approved') return v.isActive ? { label: 'Live', tone: 'success' } : { label: 'Deactivated', tone: 'neutral' }
  return (
    {
      pending: { label: 'In review', tone: 'pending' },
      changes_requested: { label: 'Changes requested', tone: 'info' },
      rejected: { label: 'Rejected', tone: 'danger' },
      suspended: { label: 'Suspended by MarkieSharkie', tone: 'danger' },
    }[v.approvalStatus] ?? { label: v.approvalStatus, tone: 'neutral' }
  )
}

function Badge({ tone, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${TONES[tone]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

export default function MyListings() {
  return (
    <ToastProvider>
      <ListingsPage />
    </ToastProvider>
  )
}

function ListingsPage() {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [version, setVersion] = useState(0)
  const [dialog, setDialog] = useState(null) // { kind: 'deactivate' | 'reactivate' | 'withdraw', venue }
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    listMyListings()
      .then((rows) => !cancelled && setState({ status: 'ready', rows }))
      .catch(() => !cancelled && setState((s) => ({ ...s, status: 'error' })))
    return () => {
      cancelled = true
    }
  }, [version])

  const copy = dialog && DIALOGS[dialog.kind](dialog.venue)
  return (
    <main id="main" className="mx-auto w-full max-w-[960px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <title>My listings | MarkieSharkie</title>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 data-page-heading tabIndex={-1} className="font-heading text-[28px] font-semibold leading-tight text-ink-strong outline-none sm:text-[34px]">
            My listings
          </h1>
          <p className="mt-1 text-[15px] text-muted-warm">Edit your venues, check their status and pause bookings when you need to.</p>
        </div>
        <Button to="/host" variant="outline" className="min-h-11 px-5">
          List another venue
        </Button>
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true" aria-label="Loading your listings" className="mt-8 grid gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[24px] bg-surface motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {state.status === 'error' && (
        <div role="alert" className="mt-8 rounded-2xl border border-line bg-white p-6">
          <p className="text-[16px] font-semibold text-ink-strong">We couldn’t load your listings.</p>
          <Button onClick={reload} className="mt-4 min-h-11 px-5">
            Try again
          </Button>
        </div>
      )}
      {state.status === 'ready' && !state.rows.length && (
        <div className="mt-8 rounded-2xl border border-dashed border-outline-strong px-5 py-10 text-center">
          <p className="text-[17px] font-semibold text-ink-strong">You haven’t listed a venue yet</p>
          <p className="mx-auto mt-1 max-w-[42ch] text-[14px] text-muted-warm">List your marquee or hall and our team will review it, usually within two working days.</p>
          <Button to="/host" className="mt-5 min-h-11 px-5">
            Become a host
          </Button>
        </div>
      )}
      {state.status === 'ready' && state.rows.length > 0 && (
        <ul className="mt-8 grid gap-4">
          {state.rows.map((v) => (
            <ListingCard key={v.id} venue={v} onAction={(kind) => setDialog({ kind, venue: v })} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(dialog)}
        title={copy?.title}
        body={copy?.body}
        warning={copy?.warning}
        confirmLabel={copy?.confirm}
        tone={copy?.tone}
        field={copy?.field}
        onClose={() => setDialog(null)}
        onConfirm={async (text) => {
          const { kind, venue } = dialog
          if (kind === 'withdraw') await withdrawEdits(venue.id)
          else await setListingActive(venue.id, kind === 'reactivate', text)
          reload()
          return copy.done
        }}
      />
    </main>
  )
}

const DIALOGS = {
  deactivate: (v) => ({
    title: `Deactivate ${v.name}?`,
    body: 'It disappears from search and its page, and nobody can send new booking requests. Confirmed bookings stay valid, and you still answer requests you already have.',
    confirm: 'Deactivate',
    tone: 'danger',
    field: { label: 'Reason (optional, only for you and our team)', hint: 'For example: renovation until March.', minLength: 0 },
    done: `${v.name} is deactivated.`,
  }),
  reactivate: (v) => ({
    title: `Reactivate ${v.name}?`,
    body: 'It shows in search again and customers can book it.',
    confirm: 'Reactivate',
    tone: 'primary',
    done: `${v.name} is live again.`,
  }),
  withdraw: (v) => ({
    title: 'Withdraw your waiting changes?',
    body: `The changes to ${v.name} that are waiting for our team are dropped. Your live listing stays as it is.`,
    confirm: 'Withdraw changes',
    tone: 'danger',
    done: 'Your waiting changes were withdrawn.',
  }),
}

function ListingCard({ venue: v, onAction }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [reopening, setReopening] = useState(false)
  const status = statusOf(v)
  const live = v.approvalStatus === 'approved'
  const revision = v.revision
  const checks = v.photoChecks ?? {}
  const rejectedPhotos = (checks.rejected_ai ?? 0) + (checks.flagged_for_review ?? 0) + (checks.rejected_admin ?? 0)
  // #42: a listing in review with rejected photos can't be approved, so the owner may replace them and resubmit.
  const canResubmit = v.approvalStatus === 'changes_requested' || v.approvalStatus === 'rejected' || (v.approvalStatus === 'pending' && rejectedPhotos > 0)
  const aiRejected = v.approvalStatus === 'rejected' && v.rejectionReason === AI_REJECTION_REASON

  async function resubmit() {
    setReopening(true)
    const ok = await reopenListingForChanges(v.id).catch(() => false)
    if (!ok) {
      setReopening(false)
      toast('We couldn’t open this listing for editing. Try again.', { tone: 'error' })
      return
    }
    resetDraftStore()
    navigate('/host/new/review')
  }

  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-[24px] border border-line bg-white p-4 sm:flex-row sm:p-5">
      <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-2xl bg-surface sm:w-48">
        {v.coverUrl && <img src={v.coverUrl} alt="" loading="lazy" className="size-full object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-semibold text-ink-strong">{v.name}</h2>
            <p className="text-[14px] text-muted-warm">{[v.area, v.city].filter(Boolean).join(', ')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {revision?.status === 'pending' && <Badge tone="pending">Edits waiting for approval</Badge>}
          </div>
        </div>

        {v.approvalStatus === 'changes_requested' && v.changesNote && <Note tone="info" title="What to change">{v.changesNote}</Note>}
        {aiRejected && (
          <Note tone="danger" title="Not selected: the images appear to be AI-generated">
            Take real photographs of your venue (the hall, stage, seating and entrance) and replace the photos marked below, then press Edit and resubmit. A resubmission starts a fresh review.
          </Note>
        )}
        {v.approvalStatus === 'rejected' && v.rejectionReason && !aiRejected && <Note tone="danger" title="Why it was rejected">{v.rejectionReason}</Note>}
        {v.approvalStatus === 'pending' && rejectedPhotos > 0 && (
          <Note tone="danger" title={`${rejectedPhotos} photo${rejectedPhotos === 1 ? '' : 's'} can’t be used`}>
            We can’t approve the listing while it has photos that look AI-generated or were removed. Replace them with real photos and resubmit.
          </Note>
        )}
        {v.approvalStatus === 'suspended' && v.suspensionReason && <Note tone="danger" title="Why it was suspended">{v.suspensionReason}</Note>}
        {revision?.status === 'pending' && (
          <Note tone="pending" title={`Sent for approval on ${day(revision.submittedAt)}`}>
            Customers still see your current listing until our team approves the changes.
          </Note>
        )}
        {revision?.status === 'rejected' && (
          <Note tone="danger" title={`Your edits from ${day(revision.submittedAt)} weren’t approved`}>
            {revision.note}
          </Note>
        )}
        {v.approvalStatus === 'pending' && <p className="text-[14px] text-muted-warm">Submitted on {day(v.submittedAt)}. We’ll review it soon.</p>}

        <div className="mt-auto flex flex-wrap gap-2">
          {live && (
            <Button to={`/owner/listings/${v.id}/edit`} className="min-h-11 px-5">
              Edit listing<span className="sr-only">: {v.name}</span>
            </Button>
          )}
          {live && v.isActive && (
            <Button to={`/venues/${v.id}`} variant="outline" className="min-h-11 px-5">
              View live page<span className="sr-only">: {v.name}</span>
            </Button>
          )}
          {canResubmit && (
            <Button onClick={resubmit} disabled={reopening} className="min-h-11 px-5 disabled:opacity-60">
              {reopening ? 'Opening…' : 'Edit and resubmit'}
            </Button>
          )}
          {revision?.status === 'pending' && (
            <Button variant="outline" onClick={() => onAction('withdraw')} className="min-h-11 px-5">
              Withdraw changes
            </Button>
          )}
          {(live || v.approvalStatus === 'suspended') &&
            (v.isActive ? (
              <button type="button" onClick={() => onAction('deactivate')} className="min-h-11 cursor-pointer rounded-[20px] px-4 text-[14px] font-medium text-danger underline underline-offset-4 hover:bg-danger-bg focus-visible:outline-2 focus-visible:outline-primary">
                Deactivate<span className="sr-only">: {v.name}</span>
              </button>
            ) : (
              <Button variant="outline" onClick={() => onAction('reactivate')} className="min-h-11 px-5">
                Reactivate<span className="sr-only">: {v.name}</span>
              </Button>
            ))}
        </div>
        {!live && v.approvalStatus !== 'suspended' && <PhotoResults venue={v} />}
      </div>
    </li>
  )
}

function Note({ tone, title, children }) {
  return (
    <div className={`rounded-xl px-4 py-3 text-[14px] leading-relaxed ${TONES[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-0.5 text-ink">{children}</p>}
    </div>
  )
}

// #42: the photo check per photo: a summary line, and on request each photo with its result and score.
const CHECK_TEXT = {
  accepted: { text: 'Accepted', tone: 'text-success' },
  rejected_ai: { text: 'Looks AI-generated', tone: 'text-danger' },
  flagged_for_review: { text: 'Waiting for our team', tone: 'text-pending' },
  rejected_admin: { text: 'Removed by our team', tone: 'text-danger' },
  pending: { text: 'Not checked yet', tone: 'text-pending' },
}

function PhotoResults({ venue: v }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: 'idle', photos: [] })
  const [retrying, setRetrying] = useState(false)
  const c = v.photoChecks ?? {}
  const total = Object.values(c).reduce((a, b) => a + b, 0)
  if (!total) return null

  async function load() {
    setState({ status: 'loading', photos: [] })
    try {
      setState({ status: 'ready', photos: await getListingPhotoChecks(v.id) })
    } catch {
      setState({ status: 'error', photos: [] })
    }
  }
  async function retry() {
    setRetrying(true)
    try {
      await retryListingPhotoChecks(v.id)
      toast('Checking your photos again. This page updates in a moment.')
      setTimeout(load, 3000)
    } catch {
      toast('We couldn’t start the check. Try again.', { tone: 'error' })
    } finally {
      setRetrying(false)
    }
  }

  const summary = [
    c.accepted && `${c.accepted} accepted`,
    c.rejected_ai && `${c.rejected_ai} look AI-generated`,
    c.pending && `${c.pending} not checked yet`,
    (c.flagged_for_review || c.rejected_admin) && `${(c.flagged_for_review ?? 0) + (c.rejected_admin ?? 0)} reviewed by our team`,
  ].filter(Boolean)
  const panelId = `photos-${v.id}`
  return (
    <div className="text-[14px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-ink">Photo check: {summary.join(' · ')}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((o) => !o)
            if (!open && state.status !== 'ready') load()
          }}
          className="min-h-10 cursor-pointer font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {open ? 'Hide photo results' : 'See photo results'}
        </button>
        {c.pending > 0 && (
          <button type="button" onClick={retry} aria-disabled={retrying || undefined} className="min-h-10 cursor-pointer font-semibold text-ink-strong underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
            {retrying ? 'Retrying…' : 'Retry the check'}
          </button>
        )}
      </div>
      {open && (
        <div id={panelId} className="mt-2">
          {state.status === 'loading' && <p aria-busy="true" className="text-muted-warm">Loading photos…</p>}
          {state.status === 'error' && (
            <p role="alert" className="text-danger">
              Couldn’t load the photos.{' '}
              <button type="button" onClick={load} className="cursor-pointer font-semibold underline">Try again</button>
            </p>
          )}
          {state.status === 'ready' && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {state.photos.map((p, index) => {
                const status = p.check?.status ?? 'pending'
                const look = CHECK_TEXT[status] ?? CHECK_TEXT.pending
                return (
                  <li key={p.imageId} className="flex flex-col gap-1">
                    <img src={p.url} alt={`Photo ${index + 1}: ${look.text}`} loading="lazy" className={`aspect-[4/3] w-full rounded-xl object-cover ${status === 'accepted' ? '' : 'opacity-80 outline-2 outline-danger'}`} />
                    <span className={`text-[13px] font-semibold ${look.tone}`}>
                      {look.text}
                      {p.check?.aiScorePercent != null && ` · AI score ${p.check.aiScorePercent}%`}
                    </span>
                    {status === 'rejected_ai' && <span className="text-[12px] text-muted-warm">Won’t be shown. Replace it with a real photo.</span>}
                    {p.check?.reason && <span className="text-[12px] text-muted-warm">Our team: {p.check.reason}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
