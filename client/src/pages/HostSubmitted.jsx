import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import { getSubmissionStatus, loadLastSubmission, reopenListingForChanges } from '../api/host.js'
import HostIcon from '../features/host/icons.jsx'
import { resetDraftStore } from '../features/host/draftStore.js'

// Shown after "Submit for review". The venue is approval_status 'pending' until an admin approves it, rejects it
// with a reason (REQ-7) or asks for changes. Photos are checked for AI images first (REQ-9). The status comes from
// GET /api/owner/venues and is re-read every 20 seconds and when the tab comes back into view.
const NEXT_STEPS = [
  { icon: 'file-check', title: 'We verify your listing', text: 'Our team checks your venue details and approves your listing, or tells you what to fix.' },
  { icon: 'camera', title: 'We check your photos', text: 'Each photo is checked for AI-generated images. You’ll see the result for every photo.' },
  { icon: 'sparkles', title: 'You go live', text: 'Once approved, customers can find your venue, check availability and send booking requests.' },
]

const STATUS_VIEW = {
  pending: { icon: 'clock', badge: 'Pending verification', tone: 'bg-pending-bg text-pending', title: 'Our team will verify your listing' },
  approved: { icon: 'check', badge: 'Approved', tone: 'bg-success-bg text-success', title: 'Your listing is live' },
  changes_requested: { icon: 'file-check', badge: 'Changes requested', tone: 'bg-info-bg text-info', title: 'A few changes are needed' },
  rejected: { icon: 'x', badge: 'Not approved', tone: 'bg-danger-bg text-danger', title: 'Your listing wasn’t approved' },
  missing: { icon: 'x', badge: 'Not found', tone: 'bg-surface text-muted-warm', title: 'We can’t find this listing' },
  suspended: { icon: 'x', badge: 'Suspended', tone: 'bg-danger-bg text-danger', title: 'Your listing is paused' },
}

export default function HostSubmitted() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [listing] = useState(() => (state?.name ? state : loadLastSubmission()))
  // undefined while loading, null when the listing isn't in this account (e.g. another login), else the status.
  const [current, setCurrent] = useState(undefined)
  useEffect(() => {
    if (!listing?.venueId) return undefined
    let live = true
    const load = () =>
      getSubmissionStatus(listing.venueId)
        .then((status) => live && setCurrent(status))
        .catch(() => live && setCurrent((previous) => previous ?? undefined))
    load()
    const timer = setInterval(load, 20_000)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [listing?.venueId])
  // A submission we remember but can no longer find in this account.
  const missing = Boolean(listing?.venueId) && current === null
  const approval = missing ? 'missing' : (current?.status ?? 'pending')
  const view = STATUS_VIEW[approval] ?? STATUS_VIEW.pending
  const [reopening, setReopening] = useState({ busy: false, error: '' })
  const name = listing ? <strong className="font-semibold text-ink-strong">{listing.name}</strong> : 'your venue'
  // The submitted draft is gone from storage; drop the wizard's in-memory copy too.
  useEffect(() => resetDraftStore(), [])

  async function editAndResubmit() {
    setReopening({ busy: true, error: '' })
    const ok = await reopenListingForChanges(listing.venueId).catch(() => false)
    if (!ok) {
      setReopening({ busy: false, error: 'We couldn’t open your listing for editing. Try again.' })
      return
    }
    resetDraftStore()
    navigate('/host/new/review')
  }

  return (
    <>
      <title>{`${view.badge} | Your listing | MarkieSharkie`}</title>
      <section className="page-container max-w-3xl py-12 sm:py-20">
        <div className={`flex size-16 items-center justify-center rounded-full ${approval === 'pending' ? 'bg-rose text-primary' : view.tone}`}>
          <HostIcon name={approval === 'pending' ? 'check' : view.icon} className="size-8" strokeWidth={2.5} />
        </div>
        <h1 className="mt-6 font-heading text-[34px] font-semibold leading-tight text-balance text-ink-strong sm:text-[44px]">{view.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink sm:text-[19px]">
          {approval === 'approved' && <>Customers can now find {name} on the home page and in Explore, check availability and send booking requests.</>}
          {approval === 'rejected' && <>Our team couldn’t approve {name}. Here’s why:</>}
          {approval === 'missing' && <>{name} is no longer in our records. It may have been removed. You can list it again.</>}
          {approval === 'changes_requested' && <>Our team reviewed {name} and needs a few changes before it can go live:</>}
          {approval === 'suspended' && <>Our team has hidden {name} from customers for now: {current.suspensionReason}</>}
          {approval === 'pending' && (
            <>
              Thanks for listing {name}
              {listing?.city && ` in ${listing.city}`}. We’ll notify you when it’s approved, or tell you what to change.
            </>
          )}
        </p>
        {(approval === 'rejected' || approval === 'changes_requested') && (
          <blockquote className="mt-4 rounded-2xl border border-line bg-surface p-5 text-[16px] leading-relaxed text-ink-strong">“{current.rejectionReason || current.changesNote}”</blockquote>
        )}
        <dl className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-5" aria-live="polite">
          <dt className="text-[15px] text-muted-warm">Status</dt>
          <dd className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[14px] font-semibold ${view.tone}`}>
            <HostIcon name={view.icon} className="size-4" strokeWidth={2} />
            {view.badge}
          </dd>
        </dl>

        {approval === 'approved' && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to={`/venues/${listing.venueId}`} className="min-h-12 px-7 text-[16px]">View your listing</Button>
            <Button to="/host" variant="outline" className="min-h-12 px-7 text-[16px]">List another venue</Button>
          </div>
        )}
        {approval === 'changes_requested' && (
          <div className="mt-8 flex flex-col gap-2">
            <div className="flex flex-wrap gap-3">
              <Button onClick={editAndResubmit} disabled={reopening.busy} className="min-h-12 px-7 text-[16px]">{reopening.busy ? 'Opening…' : 'Edit and resubmit'}</Button>
              <Button to="/" variant="outline" className="min-h-12 px-7 text-[16px]">Back to home</Button>
            </div>
            {reopening.error && <p role="alert" className="text-[15px] text-danger">{reopening.error}</p>}
          </div>
        )}
        {(approval === 'rejected' || approval === 'missing') && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/host" className="min-h-12 px-7 text-[16px]">List another venue</Button>
            <Button to="/" variant="outline" className="min-h-12 px-7 text-[16px]">Back to home</Button>
          </div>
        )}

        {approval === 'pending' && (
          <>
        <h2 className="mt-12 font-heading text-[22px] font-semibold text-ink-strong">What happens next</h2>
        <ol className="mt-5 grid gap-5">
          {NEXT_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
                <HostIcon name={step.icon} className="size-5" />
              </span>
              <div>
                <h3 className="text-[17px] font-semibold text-ink-strong">
                  <span className="sr-only">{index + 1}. </span>
                  {step.title}
                </h3>
                <p className="mt-1 text-[16px] leading-relaxed text-ink">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button to="/" className="min-h-12 px-7 text-[16px]">
            Back to home
          </Button>
          <Button to="/host" variant="outline" className="min-h-12 px-7 text-[16px]">
            List another venue
          </Button>
        </div>
          </>
        )}
      </section>
    </>
  )
}
