import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import { loadLastSubmission } from '../api/host.js'
import HostIcon from '../features/host/icons.jsx'
import { resetDraftStore } from '../features/host/draftStore.js'

// Shown after "Submit for review". The venue is approval_status 'pending' until an admin approves it, or
// rejects it with a reason (REQ-7). Photos are checked for AI images first (REQ-9).
const NEXT_STEPS = [
  { icon: 'file-check', title: 'We verify your listing', text: 'Our team checks your venue details and approves your listing, or tells you what to fix.' },
  { icon: 'camera', title: 'We check your photos', text: 'Each photo is checked for AI-generated images. You’ll see the result for every photo.' },
  { icon: 'sparkles', title: 'You go live', text: 'Once approved, customers can find your venue, check availability and send booking requests.' },
]

export default function HostSubmitted() {
  const { state } = useLocation()
  const listing = state?.name ? state : loadLastSubmission()
  // The submitted draft is gone from storage; drop the wizard's in-memory copy too.
  useEffect(() => resetDraftStore(), [])

  return (
    <>
      <title>Listing submitted | MarkieSharkie</title>
      <section className="page-container max-w-3xl py-12 sm:py-20">
        <div className="flex size-16 items-center justify-center rounded-full bg-rose text-primary">
          <HostIcon name="check" className="size-8" strokeWidth={2.5} />
        </div>
        <h1 className="mt-6 font-heading text-[34px] font-semibold leading-tight text-balance text-ink-strong sm:text-[44px]">Our team will verify your listing</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink sm:text-[19px]">
          Thanks for listing {listing ? <strong className="font-semibold text-ink-strong">{listing.name}</strong> : 'your venue'}
          {listing?.city && ` in ${listing.city}`}. We’ll notify you when it’s approved, or
          tell you what to change.
        </p>
        <dl className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-5">
          <dt className="text-[15px] text-muted-warm">Status</dt>
          <dd className="inline-flex items-center gap-2 rounded-full bg-pending-bg px-3 py-1 text-[14px] font-semibold text-pending">
            <HostIcon name="clock" className="size-4" strokeWidth={2} />
            Pending verification
          </dd>
        </dl>

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
      </section>
    </>
  )
}
