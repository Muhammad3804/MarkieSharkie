import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import Logo from '../components/ui/Logo.jsx'
import { clearDraft, submitListing } from '../api/host.js'
import { setLastStep, updateDraft, useDraftState } from '../features/host/draftStore.js'
import { validateStep } from '../features/host/schema.js'
import { PHASES, STEPS, phaseProgress, stepIndex } from '../features/host/steps.js'
import { WizardContext } from '../features/host/WizardContext.js'
import { clearPhotos } from '../features/host/photoStore.js'
import HelpDrawer from '../features/host/HelpDrawer.jsx'
import PhaseIntro from '../features/host/steps/PhaseIntro.jsx'
import { BridalSuiteStep, DirectionsStep, EventsStep, HallsStep, LocationStep, NameStep, PinStep, VenueTypeStep } from '../features/host/steps/AboutSteps.jsx'
import { LayoutStep, WalkthroughStep } from '../features/host/steps/HallMediaSteps.jsx'
import { AmenitiesStep, TitleStep } from '../features/host/steps/StandOutSteps.jsx'
import PhotosStep from '../features/host/steps/PhotosStep.jsx'
import { CustomStep, HouseRulesStep, MenusStep, RulesStep } from '../features/host/steps/PackageSteps.jsx'
import ReviewStep from '../features/host/steps/ReviewStep.jsx'

// "Become a host" listing wizard: /host/new/:step. One question per screen, autosaved to this device after every
// change. The URL holds the step, so refresh and the browser's back button work.
// Logged-in only (RequireAuth in app/router.jsx). TODO(auth): a venue_owner guard (RequireRole) once accounts have
// roles (REQ-1, CLAUDE.md rule 6), keeping the draft.
const STEP_VIEWS = {
  about: () => <PhaseIntro phase={1} />,
  'venue-type': VenueTypeStep,
  name: NameStep,
  location: LocationStep,
  pin: PinStep,
  directions: DirectionsStep,
  halls: HallsStep,
  'bridal-suite': BridalSuiteStep,
  events: EventsStep,
  'stand-out': () => <PhaseIntro phase={2} />,
  amenities: AmenitiesStep,
  photos: PhotosStep,
  layout: LayoutStep,
  walkthrough: WalkthroughStep,
  title: TitleStep,
  finish: () => <PhaseIntro phase={3} />,
  menus: MenusStep,
  custom: CustomStep,
  rules: RulesStep,
  'house-rules': HouseRulesStep,
  review: ReviewStep,
}

// The first step before `index` that isn't valid yet; you can't skip ahead past it by editing the URL.
function firstBlockedStep(draft, index) {
  return STEPS.slice(0, index).find((step) => !validateStep(step.id, draft).valid)
}

export default function HostWizard() {
  const { step } = useParams()
  const index = stepIndex(step)
  const { draft, saved } = useDraftState()

  if (index < 0) return <Navigate to="/host/new/about" replace />
  const blocked = firstBlockedStep(draft, index)
  if (blocked) return <Navigate to={`/host/new/${blocked.id}`} replace />
  return <Wizard step={step} index={index} draft={draft} saved={saved} />
}

function Wizard({ step, index, draft, saved }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromReview = searchParams.get('from') === 'review' && step !== 'review'
  const current = STEPS[index]
  const [checks, setChecks] = useState({ step, touched: new Set(), showAll: false })
  const [helpOpen, setHelpOpen] = useState(false)
  const [submit, setSubmit] = useState({ status: 'idle', error: '' })
  // Field errors the server sent back on submit (e.g. venue.googleMapsUrl); shown under the field until it changes.
  const [serverErrors, setServerErrors] = useState({})
  const [announcement, setAnnouncement] = useState('')

  // Which way to slide: forward when the step index grows (Next or browser forward), back otherwise.
  const [slideState, setSlideState] = useState({ index, direction: 1, moved: false })
  if (slideState.index !== index) setSlideState({ index, direction: index > slideState.index ? 1 : -1, moved: true })
  // Reduced motion: crossfade only, no sideways shift (MotionConfig alone still jumps the exiting step).
  const reduceMotion = useReducedMotion()
  const offset = reduceMotion ? 0 : slideState.direction * 48

  // Remember where the host is, so "Continue your listing" reopens this step. The first intro doesn't count.
  // Every edit is saved straight away by updateDraft (autosave).
  const startedListing = Boolean(draft.lastStep)
  useEffect(() => {
    if (step !== 'about' || startedListing) setLastStep(step)
  }, [step, startedListing])

  const update = useCallback(
    (recipe) => {
      setServerErrors((current) => (Object.keys(current).length ? {} : current))
      updateDraft(recipe)
    },
    [],
  )
  const validation = useMemo(() => validateStep(step, draft), [step, draft])

  // Errors show once a field is left (blur) or after Next is pressed. Reset on every step.
  const stepChecks = useMemo(() => (checks.step === step ? checks : { step, touched: new Set(), showAll: false }), [checks, step])
  const touch = useCallback(
    (path) =>
      setChecks((c) => {
        const base = c.step === step ? c : { step, touched: new Set(), showAll: false }
        if (base.touched.has(path)) return base
        return { ...base, touched: new Set(base.touched).add(path) }
      }),
    [step],
  )
  const errorFor = useCallback(
    (path) => serverErrors[path] ?? (stepChecks.showAll || stepChecks.touched.has(path) ? validation.errors[path] : undefined),
    [stepChecks, validation, serverErrors],
  )
  const context = useMemo(() => ({ draft, update, errorFor, touch }), [draft, update, errorFor, touch])

  const goTo = (id) => navigate(`/host/new/${id}`)

  async function submitForReview() {
    setSubmit({ status: 'submitting', error: '' })
    try {
      const result = await submitListing(draft)
      clearDraft()
      clearPhotos()
      // The success page resets the in-memory draft once this wizard has unmounted.
      navigate('/host/submitted', { replace: true, state: result })
    } catch (error) {
      // SubmitError carries a message for the person (server field errors, missing files, wrong account type).
      if (error?.name !== 'SubmitError') console.error('[host] submit failed', error)
      setServerErrors(error?.fieldErrors ?? {})
      setSubmit({
        status: 'error',
        error: error?.name === 'SubmitError' ? `${error.message} Your draft is saved.` : 'We couldn’t submit your listing. Your draft is saved; check your connection and try again.',
      })
    }
  }

  function next() {
    if (submit.status === 'submitting') return
    if (!validation.valid) {
      const count = Object.keys(validation.errors).length
      setChecks((c) => ({ step, touched: c.step === step ? c.touched : new Set(), showAll: true }))
      // Alternate a trailing no-break space so the same message is announced again on a second press.
      setAnnouncement((previous) => {
        const text = `Fix ${count === 1 ? 'one thing' : `${count} things`} before you continue.`
        return previous === text ? `${text}\u00a0` : text
      })
      // After the errors render: focus the first invalid field, or bring the first message into view.
      requestAnimationFrame(() => {
        const field = document.querySelector('main [aria-invalid="true"]')
        if (field) return field.focus()
        // Group errors (cards, photos): focus the first control in the group that owns the message.
        const message = document.querySelector('main [data-error]')
        const group = message?.closest('fieldset, section') ?? message?.parentElement
        group?.querySelector('input:not([hidden]), button, select, textarea')?.focus({ preventScroll: true })
        message?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
      return
    }
    setAnnouncement('')
    if (step === 'review') submitForReview()
    else if (fromReview) goTo('review')
    else goTo(STEPS[index + 1].id)
  }

  function back() {
    if (index === 0) navigate('/host')
    else goTo(STEPS[index - 1].id)
  }

  function saveAndExit() {
    // Leaving from the first intro without answering anything shouldn't create a "Continue your listing" card.
    if (draft.lastStep || step !== 'about') setLastStep(draft.lastStep ?? step)
    if (!saved) {
      if (!window.confirm('Your draft couldn’t be saved on this device (storage is blocked or full). Leave anyway?')) return
    }
    navigate('/')
  }

  // Enter = Next when focus is on the page or a heading rather than a control.
  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  })
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return
      // Interactive elements handle Enter themselves (inputs submit the form, buttons and links activate).
      if (event.target.closest?.(INTERACTIVE)) return
      event.preventDefault()
      nextRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const View = STEP_VIEWS[step]
  const progress = phaseProgress(step)
  const phase = PHASES[current.phase - 1]
  const overall = Math.round((index / STEPS.length) * 100)
  const nextLabel = step === 'review' ? 'Submit for review' : current.intro && index === 0 ? 'Get started' : fromReview ? 'Back to review' : 'Next'
  const wide = current.intro

  return (
    <MotionConfig reducedMotion="user">
      <title>{`Become a host · ${phase.title} | MarkieSharkie`}</title>
      <div data-host-wizard className="flex min-h-dvh flex-col bg-white">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-[72px] max-w-screen-2xl items-center justify-between gap-3 px-4 sm:h-[88px] sm:px-6 lg:px-12">
            <div className="h-[53px] w-[60px] shrink-0 overflow-hidden sm:w-[145px]">
              <Logo className="origin-top-left scale-[0.6]" />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className={`hidden text-[13px] md:inline ${saved ? 'text-muted-warm' : 'text-danger'} ${draft.lastStep ? '' : 'invisible'}`}>{saved ? 'Draft saved' : 'Not saved on this device'}</span>
              <button type="button" onClick={() => setHelpOpen(true)} className={pillButton} aria-haspopup="dialog">
                Questions?
              </button>
              <button type="button" onClick={saveAndExit} className={pillButton}>
                Save &amp; exit
              </button>
            </div>
          </div>
        </header>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            next()
          }}
          className="flex flex-1 flex-col"
        >
          <main className="flex flex-1 flex-col pb-[136px]">
            <WizardContext.Provider value={context}>
              <AnimatePresence mode="wait" initial={false} custom={offset}>
                <motion.div
                  key={step}
                  custom={offset}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className={`mx-auto flex w-full flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12 ${wide ? 'max-w-6xl justify-center lg:px-12' : ['photos', 'layout', 'walkthrough', 'menus', 'review'].includes(step) ? 'max-w-[840px]' : 'max-w-[720px]'}`}
                >
                  {slideState.moved && <StepFocus />}
                  <View />
                </motion.div>
              </AnimatePresence>
            </WizardContext.Provider>
          </main>

          <footer className="fixed inset-x-0 bottom-0 z-30 bg-white pb-[env(safe-area-inset-bottom)]">
            <div
              role="progressbar"
              aria-label="Listing progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overall}
              aria-valuetext={`Step ${phase.number} of 3, ${phase.title}`}
              className="grid grid-cols-3 gap-2"
            >
              {progress.map((fill, i) => (
                <div key={PHASES[i].number} className="h-1.5 overflow-hidden bg-line">
                  <div
                    className="h-full origin-left bg-ink-strong transition-transform duration-500 ease-out motion-reduce:transition-none"
                    style={{ transform: `scaleX(${fill})` }}
                  />
                </div>
              ))}
            </div>
            <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 lg:px-12">
              <button
                type="button"
                onClick={back}
                className="min-h-12 cursor-pointer rounded-lg px-3 text-[16px] font-semibold text-ink-strong underline underline-offset-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
              >
                Back
              </button>
              <p className="hidden text-[14px] text-muted-warm sm:block" aria-hidden="true">
                Step {phase.number} of 3 · {phase.title}
              </p>
              <button
                type="submit"
                aria-disabled={!validation.valid || submit.status === 'submitting'}
                aria-describedby={submit.error ? 'submit-error' : undefined}
                className={`inline-flex min-h-12 min-w-[120px] cursor-pointer items-center justify-center gap-2 rounded-xl px-6 text-[16px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-14 sm:px-8 ${
                  validation.valid ? 'bg-primary text-white hover:bg-primary/90' : 'bg-line text-ink'
                } ${submit.status === 'submitting' ? 'cursor-wait' : ''}`}
              >
                {submit.status === 'submitting' && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />}
                {submit.status === 'submitting' ? 'Submitting…' : nextLabel}
              </button>
            </div>
            <div aria-live="polite" className="sr-only">
              {announcement}
            </div>
            {submit.error && (
              <p id="submit-error" role="alert" className="mx-auto max-w-screen-2xl px-4 pb-3 text-right text-[14px] text-danger sm:px-6 lg:px-12">
                {submit.error}
              </p>
            )}
          </footer>
        </form>

        <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} help={current.help} />
      </div>
    </MotionConfig>
  )
}

const INTERACTIVE = 'input, textarea, select, button, a, [role="switch"], [contenteditable], dialog, .leaflet-container'

const pillButton =
  'min-h-10 cursor-pointer rounded-full border border-line px-3.5 text-[14px] font-medium text-ink-strong transition-colors hover:border-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-11 sm:px-5 sm:text-[15px]'

const slide = {
  enter: (offset) => ({ opacity: 0, x: offset }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit: (offset) => ({ opacity: 0, x: -offset, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }),
}

// After moving to another step (not on first load): scroll to the top and move focus to the new question's
// heading, so keyboard and screen reader users start at the question (focus-on-route-change).
function StepFocus() {
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('main [data-step-heading]')?.focus({ preventScroll: true })
  }, [])
  return null
}
