import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button.jsx'
import { clearDraft, loadDraft } from '../api/host.js'
import { hasProgress } from '../features/host/draft.js'
import { PHASES, STEPS, stepIndex } from '../features/host/steps.js'
import { PHASE_IMAGES } from '../features/host/phaseImages.js'
import { clearPhotos } from '../features/host/photoStore.js'
import { resetDraftStore } from '../features/host/draftStore.js'
import { timeAgo } from '../lib/format.js'
import { useRequireAuth } from '../features/auth/authContext.js'
import heroImage from '../assets/gallery/hall-4.webp'

// /host: "Become a host" landing. Explains the three phases and starts the wizard, or resumes a saved draft.
export default function HostIntro() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => loadDraft())
  const resumable = hasProgress(draft) ? draft : null
  const requireAuth = useRequireAuth()
  // Listing needs an account: log in first (subtitle "Log in to list your venue"), then open the wizard.
  const startListing = (step = 'about') => requireAuth('host', () => navigate(`/host/new/${step}`))

  function startOver() {
    if (!window.confirm('Delete your saved listing and start again? This can’t be undone.')) return
    clearDraft()
    clearPhotos()
    resetDraftStore()
    setDraft(null)
  }

  return (
    <>
      <title>Become a host | MarkieSharkie</title>
      <meta name="description" content="List your marquee or banquet hall on MarkieSharkie and take bookings from families across Pakistan." />

      <section className="page-container grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:py-20">
        <div>
          <p className="mb-4 text-[15px] font-semibold uppercase tracking-wide text-primary">Become a host</p>
          <h1 className="font-heading text-[40px] font-semibold leading-[1.05] text-balance text-ink-strong sm:text-[56px] lg:text-[64px]">
            List your marquee on MarkieSharkie
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-ink sm:text-[19px]">
            Reach families planning weddings and events in your city. Show your halls, menus and live availability, and manage every booking in one place.
          </p>

          {resumable ? (
            <ContinueCard draft={resumable} onContinue={() => startListing(resumable.lastStep)} onStartOver={startOver} />
          ) : (
            <Button onClick={() => startListing()} className="mt-8 min-h-14 px-8 text-[17px]">
              Let’s get started
            </Button>
          )}
        </div>
        <img src={heroImage} alt="A crystal chandelier under a draped banquet hall ceiling" width="720" height="540" fetchPriority="high" className="aspect-[4/3] w-full rounded-3xl object-cover" />
      </section>

      <section aria-labelledby="phases-title" className="bg-surface py-14 sm:py-20">
        <div className="page-container">
          <h2 id="phases-title" className="font-heading text-[30px] font-semibold text-ink-strong sm:text-[36px]">
            It’s easy to get started
          </h2>
          <p className="mt-3 max-w-[60ch] text-[17px] text-ink">Three short steps, about 15 minutes in total. Your progress is saved as you go.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {PHASES.map((phase) => (
              <li key={phase.number} className="overflow-hidden rounded-3xl bg-white shadow-card">
                <img src={PHASE_IMAGES[phase.number]} alt="" width="480" height="300" loading="lazy" className="aspect-[16/10] w-full object-cover" />
                <div className="p-6">
                  <p className="text-[15px] font-semibold text-primary">Step {phase.number}</p>
                  <h3 className="mt-1 font-heading text-[22px] font-semibold text-ink-strong">{phase.title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-ink">{phase.intro}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-[70ch] text-[15px] leading-relaxed text-muted-warm">
            Every new listing is checked by our team before it goes live, and every photo is checked to make sure it’s real. MarkieSharkie never takes payments
            from your customers; you record advances and balances yourself.
          </p>
          {!resumable && (
            <Button onClick={() => startListing()} className="mt-8 min-h-14 px-8 text-[17px]">
              Let’s get started
            </Button>
          )}
        </div>
      </section>
    </>
  )
}

function ContinueCard({ draft, onContinue, onStartOver }) {
  const index = Math.max(0, stepIndex(draft.lastStep))
  const percent = Math.round((index / STEPS.length) * 100)
  const place = [draft.venue.area, draft.venue.city].filter(Boolean).join(', ')
  return (
    <section aria-labelledby="continue-title" className="mt-8 rounded-3xl border border-line bg-white p-6 shadow-card sm:p-7">
      <h2 id="continue-title" className="font-heading text-[22px] font-semibold text-ink-strong">
        Continue your listing
      </h2>
      <p className="mt-1 text-[16px] text-ink">
        {draft.venue.name.trim() || 'Untitled venue'}
        {place && <span className="text-muted-warm"> · {place}</span>}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-[14px] tabular-nums text-muted-warm">{percent}% done</span>
      </div>
      {draft.updatedAt && <p className="mt-2 text-[14px] text-muted-warm">Last edited {timeAgo(draft.updatedAt)}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button onClick={onContinue} className="min-h-12 px-7 text-[16px]">
          Continue
        </Button>
        <button
          type="button"
          onClick={onStartOver}
          className="min-h-11 cursor-pointer rounded-md px-2 text-[15px] font-medium text-ink underline underline-offset-4 hover:text-danger focus-visible:outline-2 focus-visible:outline-primary"
        >
          Start over
        </button>
      </div>
    </section>
  )
}
