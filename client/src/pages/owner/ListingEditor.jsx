import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { loadListingForEdit, saveListingEdits, withdrawEdits } from '../../api/owner.js'
import Button from '../../components/ui/Button.jsx'
import { ToastProvider } from '../../features/admin/toast.jsx'
import { useToast } from '../../features/admin/toastContext.js'
import { deletePhotos } from '../../features/host/photoStore.js'
import { validateStep } from '../../features/host/schema.js'
import { HeadingLevelContext, WizardContext } from '../../features/host/WizardContext.js'
import { BridalSuiteStep, DirectionsStep, EventsStep, HallsStep, LocationStep, NameStep, PinStep, VenueTypeStep } from '../../features/host/steps/AboutSteps.jsx'
import { LayoutStep, WalkthroughStep } from '../../features/host/steps/HallMediaSteps.jsx'
import { CustomStep, HouseRulesStep, MenusStep, RulesStep } from '../../features/host/steps/PackageSteps.jsx'
import PhotosStep from '../../features/host/steps/PhotosStep.jsx'
import { AmenitiesStep, TitleStep } from '../../features/host/steps/StandOutSteps.jsx'

// /owner/listings/:id/edit/:section: edit a live venue with the "Become a host" steps (EUC-04, EUC-07). The draft
// lives in this page's memory; Save sends the whole listing. What goes live at once and what waits for the admin
// (REQ-5) is decided by the server (srs-alignment #35), and each section says which kind it is.

const SECTIONS = [
  {
    id: 'basics',
    title: 'Name and location',
    kind: 'approval',
    note: 'Name, type, address, map pin and events are checked by our team before customers see them. The Google Maps link goes live at once.',
    steps: [
      ['venue-type', VenueTypeStep],
      ['name', NameStep],
      ['location', LocationStep],
      ['pin', PinStep],
      ['events', EventsStep],
    ],
  },
  {
    id: 'halls',
    title: 'Halls',
    kind: 'approval',
    note: 'Hall changes (capacity, size, layout, walkthroughs, adding or removing a hall) are checked by our team first. Halls with bookings can’t be removed.',
    steps: [
      ['halls', HallsStep],
      ['bridal-suite', BridalSuiteStep],
      ['layout', LayoutStep],
      ['walkthrough', WalkthroughStep],
    ],
  },
  {
    id: 'description',
    title: 'Amenities and description',
    kind: 'mixed',
    note: 'Your title goes live at once. Amenities and the description are checked by our team first.',
    steps: [
      ['amenities', AmenitiesStep],
      ['title', TitleStep],
    ],
  },
  {
    id: 'photos',
    title: 'Photos',
    kind: 'live',
    note: 'Photo changes go live at once. New photos pass our automatic check first (it takes a few seconds).',
    steps: [['photos', PhotosStep]],
  },
  {
    id: 'directions',
    title: 'Directions and house rules',
    kind: 'live',
    note: 'These go live as soon as you save.',
    steps: [
      ['directions', DirectionsStep],
      ['house-rules', HouseRulesStep],
    ],
  },
  {
    id: 'menus',
    title: 'Menus and add-ons',
    kind: 'live',
    note: 'Prices and menus go live as soon as you save. Bookings already made keep the package and price they were made with.',
    steps: [
      ['menus', MenusStep],
      ['custom', CustomStep],
    ],
  },
  {
    id: 'rules',
    title: 'Booking rules',
    kind: 'approval',
    note: 'Days, time slots, the advance and the cancellation policy are checked by our team first. Existing bookings keep their terms.',
    steps: [['rules', RulesStep]],
  },
]
const ALL_STEPS = SECTIONS.flatMap((s) => s.steps.map(([id]) => ({ id, section: s })))
const KIND_LABEL = { approval: 'Needs approval', live: 'Goes live at once', mixed: 'Some changes need approval' }
const KIND_TONE = { approval: 'bg-pending-bg text-pending', live: 'bg-success-bg text-success', mixed: 'bg-info-bg text-info' }

export default function ListingEditor() {
  return (
    <ToastProvider>
      <MotionConfig reducedMotion="user">
        <Editor />
      </MotionConfig>
    </ToastProvider>
  )
}

function Editor() {
  const { id, section: sectionId = 'basics' } = useParams()
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [checks, setChecks] = useState({ touched: new Set(), showAll: false })
  const [serverErrors, setServerErrors] = useState({})
  const [save, setSave] = useState({ status: 'idle', error: '', result: null })
  const fileIds = useRef([])

  useEffect(() => {
    let cancelled = false
    loadListingForEdit(id)
      .then((loaded) => {
        if (cancelled) return
        fileIds.current = loaded.fileIds
        setDraft(loaded.draft)
        setState({ status: 'ready', ...loaded })
      })
      .catch((error) => !cancelled && setState({ status: error?.status === 404 ? 'missing' : 'error' }))
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  // The copies of the server's photos in this browser are only needed while editing.
  useEffect(() => () => void deletePhotos(fileIds.current).catch(() => {}), [])

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = useCallback((recipe) => {
    setDraft((current) => {
      const next = recipe(current)
      return next === current ? current : next
    })
    setDirty(true)
  }, [])

  const section = SECTIONS.find((s) => s.id === sectionId)
  const validation = useMemo(() => {
    if (!draft || !section) return { errors: {} }
    const errors = {}
    for (const [stepId] of section.steps) Object.assign(errors, validateStep(stepId, draft).errors)
    return { errors }
  }, [draft, section])

  const touch = useCallback((path) => setChecks((c) => (c.touched.has(path) ? c : { ...c, touched: new Set(c.touched).add(path) })), [])
  const errorFor = useCallback((path) => serverErrors[path] || (checks.showAll || checks.touched.has(path) ? validation.errors[path] : undefined), [checks, validation, serverErrors])
  const context = useMemo(() => ({ draft, update, errorFor, touch }), [draft, update, errorFor, touch])

  if (!section) return <Navigate to={`/owner/listings/${id}/edit/basics`} replace />
  if (state.status === 'loading') return <EditorSkeleton />
  if (state.status === 'missing' || state.status === 'error')
    return (
      <main id="main" className="mx-auto max-w-[720px] px-4 py-16 text-center">
        <title>Edit listing | MarkieSharkie</title>
        <h1 className="font-heading text-[26px] font-semibold text-ink-strong">{state.status === 'missing' ? 'We couldn’t find that listing' : 'We couldn’t open your listing'}</h1>
        <p className="mt-2 text-[15px] text-muted-warm">{state.status === 'missing' ? 'It may belong to another account.' : 'Check your connection and try again.'}</p>
        <div className="mt-6 flex justify-center gap-3">
          {state.status === 'error' && (
            <Button onClick={() => setAttempt((n) => n + 1)} className="min-h-11 px-5">
              Try again
            </Button>
          )}
          <Button to="/owner/listings" variant="outline" className="min-h-11 px-5">
            Back to my listings
          </Button>
        </div>
      </main>
    )
  if (state.approvalStatus !== 'approved')
    return (
      <main id="main" className="mx-auto max-w-[720px] px-4 py-16 text-center">
        <title>Edit listing | MarkieSharkie</title>
        <h1 className="font-heading text-[26px] font-semibold text-ink-strong">This listing isn’t live yet</h1>
        <p className="mt-2 text-[15px] text-muted-warm">
          {state.approvalStatus === 'suspended'
            ? 'It’s suspended by our team, so it can’t be edited. Contact support.'
            : 'Until it’s approved, change it with “Edit and resubmit” from My listings.'}
        </p>
        <Button to="/owner/listings" className="mt-6 min-h-11 px-5">
          Back to my listings
        </Button>
      </main>
    )

  async function onSave() {
    setChecks((c) => ({ ...c, showAll: true }))
    // Every section has to be valid, not just this one: the whole listing is saved.
    const firstInvalid = ALL_STEPS.find(({ id: stepId }) => !validateStep(stepId, draft).valid)
    if (firstInvalid) {
      const where = firstInvalid.section
      setSave({ status: 'error', error: where.id === section.id ? 'Fix the highlighted fields, then save.' : `Fix “${where.title}” first, then save.`, result: null })
      requestAnimationFrame(() => document.querySelector('main [aria-invalid="true"], main [data-error]')?.scrollIntoView({ block: 'center' }))
      return
    }
    setSave({ status: 'saving', error: '', result: null })
    setServerErrors({})
    try {
      const result = await saveListingEdits(id, draft, state.original)
      setDirty(false)
      setSave({ status: 'saved', error: '', result })
      // The footer says what went live and what waits for approval (a toast would cover the Save button).
      // Reload so new photos and packages get their server ids (the next save references them).
      const loaded = await loadListingForEdit(id)
      fileIds.current = [...new Set([...fileIds.current, ...loaded.fileIds])]
      setDraft(loaded.draft)
      setState({ status: 'ready', ...loaded })
    } catch (error) {
      if (error?.name !== 'SubmitError') console.error('[owner] save failed', error)
      setServerErrors(error?.fieldErrors ?? {})
      setSave({ status: 'error', error: error?.name === 'SubmitError' ? error.message : 'We couldn’t save your changes. Check your connection and try again.', result: null })
    }
  }

  const revision = state.revision
  return (
    <main id="main" className="mx-auto w-full max-w-[1100px] px-4 pb-40 pt-6 sm:px-6 sm:pt-10">
      <title>{`Edit ${state.name} | MarkieSharkie`}</title>
      <Link to="/owner/listings" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-ink underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
        ← My listings
      </Link>
      <h1 className="mt-2 break-words font-heading text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">Edit {state.name}</h1>

      {revision?.status === 'pending' && <PendingBanner revision={revision} venueId={id} onWithdrawn={() => setAttempt((n) => n + 1)} />}
      {revision?.status === 'rejected' && (
        <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-[14px]">
          <p className="font-semibold text-danger">Your last changes weren’t approved</p>
          <p className="mt-0.5 text-ink">{revision.note}</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Listing sections" className="min-w-0">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/owner/listings/${id}/edit/${s.id}`}
                  aria-current={s.id === section.id ? 'page' : undefined}
                  className={`flex min-h-11 items-center rounded-full border px-4 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-primary lg:rounded-xl lg:border-0 ${s.id === section.id ? 'border-primary bg-primary/5 text-primary' : 'border-line text-ink-strong hover:bg-surface'}`}
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${KIND_TONE[section.kind]}`}>{KIND_LABEL[section.kind]}</span>
            <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-ink">{section.note}</p>
          </div>
          <HeadingLevelContext.Provider value={2}>
            <WizardContext.Provider value={context}>
              <div className="flex flex-col gap-14">
                {section.steps.map(([stepId, Step]) => (
                  <section key={stepId} aria-label={stepId.replace('-', ' ')} className="min-w-0">
                    <Step />
                  </section>
                ))}
              </div>
            </WizardContext.Provider>
          </HeadingLevelContext.Provider>
        </div>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        {/* Right padding keeps Save clear of the floating chat button. */}
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 py-3 pl-4 pr-[84px] sm:pl-6">
          <div aria-live="polite" className="min-w-0 flex-1 text-[14px]">
            {save.status === 'error' && <p role="alert" className="text-danger">{save.error}</p>}
            {save.status === 'saved' && <SaveSummary result={save.result} />}
            {save.status !== 'error' && save.status !== 'saved' && <p className="text-muted-warm">{dirty ? 'You have unsaved changes.' : 'No unsaved changes.'}</p>}
          </div>
          <Button onClick={onSave} disabled={save.status === 'saving'} className="min-h-12 px-6 text-[15px] disabled:cursor-wait disabled:opacity-60">
            {save.status === 'saving' ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </footer>
    </main>
  )
}

function SaveSummary({ result }) {
  if (!result) return null
  const { applied, needsApproval } = result
  if (!applied.length && !needsApproval.length) return <p className="text-muted-warm">Nothing changed.</p>
  return (
    <div className="text-ink">
      {applied.length > 0 && (
        <p>
          <span className="font-semibold text-success">Live now:</span> {applied.join(', ')}
        </p>
      )}
      {needsApproval.length > 0 && (
        <p>
          <span className="font-semibold text-pending">Sent for approval:</span> {needsApproval.slice(0, 4).join(', ')}
          {needsApproval.length > 4 ? ` and ${needsApproval.length - 4} more` : ''}
        </p>
      )}
    </div>
  )
}

function PendingBanner({ revision, venueId, onWithdrawn }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function withdraw() {
    if (!window.confirm('Withdraw the changes waiting for approval? Your live listing stays as it is.')) return
    setBusy(true)
    try {
      await withdrawEdits(venueId)
      toast('Your waiting changes were withdrawn.')
      onWithdrawn()
    } catch {
      toast('We couldn’t withdraw the changes. Try again.', { tone: 'error' })
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 rounded-xl bg-pending-bg px-4 py-3 text-[14px]">
      <p className="font-semibold text-pending">Changes waiting for approval</p>
      <p className="mt-0.5 text-ink">
        Customers see your current listing until our team approves these. This editor shows the changes you sent; saving again replaces them.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-11 cursor-pointer font-semibold text-ink-strong underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
          {open ? 'Hide the list' : `See what changed (${revision.changes.length})`}
        </button>
        <button type="button" onClick={withdraw} disabled={busy} className="min-h-11 cursor-pointer font-semibold text-danger underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60">
          Withdraw changes
        </button>
      </div>
      {open && (
        <ul className="mt-2 grid gap-1.5">
          {revision.changes.map((c) => (
            <li key={`${c.section}-${c.label}`} className="min-w-0 break-words">
              <span className="font-medium text-ink-strong">{c.label}:</span> <span className="text-muted-warm line-through">{c.before}</span> → <span className="text-ink-strong">{c.after}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EditorSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading your listing" className="mx-auto w-full max-w-[1100px] px-4 pt-10 sm:px-6">
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
      <div className="mt-8 h-96 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
    </main>
  )
}
