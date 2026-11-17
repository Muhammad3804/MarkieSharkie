import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import FlowHeaderShell from '../features/booking/FlowHeader.jsx'
import { useVenue } from '../features/venues/useVenue.js'
import { WizardContext } from '../features/host/WizardContext.js'
import HelpDrawer from '../features/host/HelpDrawer.jsx'
import { BookingError, requestBooking } from '../api/bookings.js'
import { updateBookingDraft, useBookingDraft } from '../features/booking/draft.js'
import { currentHold, dropHold, startHold } from '../features/booking/hold.js'
import { validateBookingStep } from '../features/booking/schema.js'
import { BOOKING_STEPS, bookingStepIndex } from '../features/booking/steps.js'
import { priceBreakdown } from '../features/booking/pricing.js'
import { HoldExpiredDialog, HoldTimer } from '../features/booking/HoldTimer.jsx'
import { AddOnsStep, DetailsStep, PriceStep, ReviewStep, SelectionStep } from '../features/booking/steps/BookingSteps.jsx'
import BookingConfirmation from '../features/booking/steps/BookingConfirmation.jsx'
import { slotPreset } from '../lib/booking.js'

// Booking flow: /venues/:id/book/:step, one topic per screen like the host wizard (pages/HostWizard.jsx).
// The draft autosaves after every change (features/booking/draft.js), so refresh, Back and Save & exit are safe.
// "Your selection" places a 10-minute hold (REQ-18) with a countdown on every step; when it runs out the slot is
// released and a modal offers to hold it again. Leaving the flow releases the hold (docs/booking-engine.md
// "Customer leaves"); a refresh keeps it.
// Logged-in only (RequireAuth in app/router.jsx); the API calls in api/bookings.js act as the signed-in mock user.
const STEP_VIEWS = {
  selection: SelectionStep,
  details: DetailsStep,
  'add-ons': AddOnsStep,
  price: PriceStep,
  review: ReviewStep,
}

export default function BookingFlow() {
  const { id, step } = useParams()
  const { status, venue, reload } = useVenue(id)
  const { draft, saved } = useBookingDraft(id)

  if (status === 'loading') return <FlowMessage loading />
  if (status === 'not-found') return <FlowMessage title="Venue not found" body="This venue doesn’t exist or is no longer listed." venueId={null} />
  if (status === 'error') return <FlowMessage title="Couldn’t load this venue" body="Check your connection and try again. Your booking draft is saved." onRetry={reload} venueId={id} />
  if (step === 'confirmation') return <BookingConfirmation venue={venue} />

  const index = bookingStepIndex(step)
  // Nothing to book yet: start from the venue page's booking panel.
  if (!draft) return <Navigate to={`/venues/${id}?tab=availability`} replace />
  if (index < 0) return <Navigate to={`/venues/${id}/book/selection`} replace />
  const blocked = BOOKING_STEPS.slice(0, index).find((s) => !validateBookingStep(s.id, draft, venue).valid)
  if (blocked) return <Navigate to={`/venues/${id}/book/${blocked.id}`} replace />
  return <Flow key={venue.id} venue={venue} step={step} index={index} draft={draft} saved={saved} />
}

function FlowMessage({ loading, title, body, onRetry, venueId }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <FlowHeaderShell />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-4 px-4 py-16 sm:px-6" aria-busy={loading || undefined}>
        {loading ? (
          <div className="flex flex-col gap-4" aria-label="Loading your booking">
            <div className="h-10 w-2/3 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
            <div className="h-5 w-1/2 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
            <div className="mt-6 h-56 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />
          </div>
        ) : (
          <>
            <title>{`${title} · MarkieSharkie`}</title>
            <h1 className="font-heading text-[28px] font-semibold text-ink-strong">{title}</h1>
            <p className="text-[16px] text-muted-warm">{body}</p>
            <div className="flex flex-wrap gap-3">
              {onRetry && (
                <button type="button" onClick={onRetry} className="min-h-12 cursor-pointer rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  Try again
                </button>
              )}
              <Link to={venueId ? `/venues/${venueId}` : '/explore'} className="inline-flex min-h-12 items-center rounded-xl border border-line px-6 text-[15px] font-semibold text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-primary">
                {venueId ? 'Back to venue' : 'Browse venues'}
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Flow({ venue, step, index, draft, saved }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromReview = searchParams.get('from') === 'review' && step !== 'review'
  const current = BOOKING_STEPS[index]
  const [checks, setChecks] = useState({ step, touched: new Set(), showAll: false })
  const [helpOpen, setHelpOpen] = useState(false)
  const [submit, setSubmit] = useState({ status: 'idle', error: '' })
  const [announcement, setAnnouncement] = useState('')
  const [heldRef, setHold] = useState(() => currentHold(venue.id))
  // The draft is shared by every tab on this venue, the hold is per tab. If another tab changed the draft's slot,
  // this tab's hold no longer covers it: treat it as no hold (Selection then re-holds the draft's slot).
  const hold = heldRef && heldRef.hallId === draft.hallId && heldRef.date === draft.date && heldRef.slot === draft.slot ? heldRef : null
  const [holdError, setHoldError] = useState(null) // { message, alternatives } when "hold this slot" fails
  const [expired, setExpired] = useState(false)
  const [retry, setRetry] = useState({ status: 'idle' })

  const [slideState, setSlideState] = useState({ index, direction: 1, moved: false })
  if (slideState.index !== index) setSlideState({ index, direction: index > slideState.index ? 1 : -1, moved: true })
  const reduceMotion = useReducedMotion()
  const offset = reduceMotion ? 0 : slideState.direction * 48

  const update = useCallback((recipe) => updateBookingDraft(venue.id, recipe), [venue.id])
  useEffect(() => {
    updateBookingDraft(venue.id, { lastStep: step })
  }, [venue.id, step])

  // Leaving the flow (not a refresh, not another step) releases this tab's hold. Deferred so React's StrictMode
  // remount and step changes, which stay inside /book/, don't release it.
  useEffect(() => {
    const prefix = `/venues/${venue.id}/book/`
    return () => {
      setTimeout(() => {
        if (!window.location.pathname.startsWith(prefix)) dropHold(venue.id)
      }, 0)
    }
  }, [venue.id])

  const onExpire = useCallback(() => {
    setHold(null)
    setExpired(true)
    setRetry({ status: 'idle' })
    dropHold(venue.id)
  }, [venue.id])

  const selection = useMemo(() => {
    const hall = venue.halls.find((h) => h.hallId === draft.hallId) ?? venue.halls[0]
    return { hallId: hall.hallId, hallName: hall.name, date: draft.date, slot: draft.slot, slotLabel: slotPreset(draft.slot).label }
  }, [venue.halls, draft.hallId, draft.date, draft.slot])

  async function placeHold() {
    const result = await startHold(venue.id, { hallId: selection.hallId, date: selection.date, slot: selection.slot })
    setHold(result)
    return result
  }

  async function retryHold() {
    if (retry.status === 'working') return
    setRetry({ status: 'working' })
    try {
      await placeHold()
      setExpired(false)
      setRetry({ status: 'idle' })
    } catch (error) {
      setRetry({ status: 'error', message: error instanceof BookingError ? error.message : 'We couldn’t hold the slot. Try again.', alternatives: error instanceof BookingError ? error.details : null })
    }
  }

  const validation = useMemo(() => validateBookingStep(step, draft, venue), [step, draft, venue])
  const price = useMemo(() => priceBreakdown(venue, { hallId: draft.hallId, guests: Number(draft.guests) || 0, menuId: draft.menuId, addOns: draft.addOns }), [venue, draft.hallId, draft.guests, draft.menuId, draft.addOns])

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
  const errorFor = useCallback((path) => (stepChecks.showAll || stepChecks.touched.has(path) ? validation.errors[path] : undefined), [stepChecks, validation])
  const context = useMemo(() => ({ draft, update, errorFor, touch, venue, hold, holdError, price, selection }), [draft, update, errorFor, touch, venue, hold, holdError, price, selection])

  const goTo = (id) => navigate(`/venues/${venue.id}/book/${id}`)
  const busy = submit.status === 'working'

  async function sendRequest() {
    setSubmit({ status: 'working', error: '' })
    try {
      const booking = await requestBooking({ ...draft, venueId: venue.id, slotId: hold.slotId, holdToken: hold.holdToken })
      // The confirmation screen clears the draft and the hold reference once it's showing; clearing them here
      // would re-render this step without a draft and redirect to the venue page before the navigation lands.
      navigate(`/venues/${venue.id}/book/confirmation?ref=${booking.bookingId}`, { replace: true })
    } catch (error) {
      if (error instanceof BookingError && error.code === 'HOLD_EXPIRED') {
        setSubmit({ status: 'idle', error: '' })
        onExpire()
        return
      }
      console.error('[bookings] request failed', error)
      setSubmit({ status: 'error', error: error instanceof BookingError ? error.message : 'We couldn’t send your request. Your answers are saved; check your connection and try again.' })
    }
  }

  async function next() {
    if (busy) return
    if (!validation.valid) {
      const count = Object.keys(validation.errors).length
      setChecks((c) => ({ step, touched: c.step === step ? c.touched : new Set(), showAll: true }))
      setAnnouncement((previous) => {
        const text = `Fix ${count === 1 ? 'one thing' : `${count} things`} before you continue.`
        return previous === text ? `${text} ` : text
      })
      requestAnimationFrame(() => {
        const field = document.querySelector('main [aria-invalid="true"]')
        if (field) return field.focus()
        const message = document.querySelector('main [data-error]')
        const group = message?.closest('fieldset, section') ?? message?.parentElement
        group?.querySelector('input:not([hidden]), button, select, textarea')?.focus({ preventScroll: true })
        message?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
      })
      return
    }
    setAnnouncement('')
    if (step === 'selection' && !hold) {
      setSubmit({ status: 'working', error: '' })
      setHoldError(null)
      try {
        await placeHold()
        setSubmit({ status: 'idle', error: '' })
      } catch (error) {
        setSubmit({ status: 'idle', error: '' })
        setHoldError({ message: error instanceof BookingError ? error.message : 'We couldn’t hold this slot. Check your connection and try again.', alternatives: error instanceof BookingError ? error.details : null })
        return
      }
    }
    if (step === 'review') return sendRequest()
    if (fromReview) goTo('review')
    else goTo(BOOKING_STEPS[index + 1].id)
  }

  function back() {
    if (index === 0) navigate(`/venues/${venue.id}`)
    else goTo(BOOKING_STEPS[index - 1].id)
  }

  function saveAndExit() {
    if (!saved && !window.confirm('Your booking details couldn’t be saved on this device (storage is blocked or full). Leave anyway?')) return
    navigate(`/venues/${venue.id}`)
  }

  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  })
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return
      if (event.target.closest?.(INTERACTIVE)) return
      event.preventDefault()
      nextRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Without a running hold only "Your selection" is reachable (it offers to hold the slot again).
  if (index > 0 && !hold && !expired) return <Navigate to={`/venues/${venue.id}/book/selection`} replace />

  const View = STEP_VIEWS[step]
  const nextLabel = step === 'review' ? 'Request booking' : step === 'selection' && !hold ? 'Hold slot & continue' : fromReview ? 'Back to review' : 'Next'
  const workingLabel = step === 'review' ? 'Sending request…' : 'Holding slot…'

  return (
    <MotionConfig reducedMotion="user">
      <title>{`Book ${venue.name} · ${current.title} | MarkieSharkie`}</title>
      <div className="flex min-h-dvh flex-col bg-white">
        <FlowHeaderShell>
          <span className={`hidden text-[13px] lg:inline ${saved ? 'text-muted-warm' : 'text-danger'}`}>{saved ? 'Draft saved' : 'Not saved on this device'}</span>
          <HoldTimer heldUntil={hold?.heldUntil ?? null} onExpire={onExpire} />
          <button type="button" onClick={() => setHelpOpen(true)} className={`${pillButton} hidden sm:inline-flex`} aria-haspopup="dialog">
            Questions?
          </button>
          <button type="button" onClick={saveAndExit} className={pillButton}>
            Save &amp; exit
          </button>
        </FlowHeaderShell>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            next()
          }}
          className="flex flex-1 flex-col"
        >
          <main className="flex flex-1 flex-col overflow-x-clip pb-[148px]">
            <WizardContext.Provider value={context}>
              <AnimatePresence mode="wait" initial={false} custom={offset}>
                <motion.div key={step} custom={offset} variants={slide} initial="enter" animate="center" exit="exit" className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
                  {slideState.moved && <StepFocus />}
                  <p className="mb-3 text-[14px] font-medium text-muted-warm">
                    Step {index + 1} of {BOOKING_STEPS.length} · {venue.name}
                  </p>
                  <View />
                </motion.div>
              </AnimatePresence>
            </WizardContext.Provider>
          </main>

          <footer className="fixed inset-x-0 bottom-0 z-30 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(41,28,31,0.16)]">
            <div
              role="progressbar"
              aria-label="Booking progress"
              aria-valuemin={0}
              aria-valuemax={BOOKING_STEPS.length}
              aria-valuenow={index + 1}
              aria-valuetext={`Step ${index + 1} of ${BOOKING_STEPS.length}, ${current.title}`}
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${BOOKING_STEPS.length}, minmax(0, 1fr))` }}
            >
              {BOOKING_STEPS.map((s, i) => (
                <div key={s.id} className="h-1.5 overflow-hidden bg-line">
                  <div className="h-full origin-left bg-primary transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${i <= index ? 1 : 0})` }} />
                </div>
              ))}
            </div>
            <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 lg:px-12">
              <button type="button" onClick={back} className="min-h-12 cursor-pointer rounded-lg px-3 text-[16px] font-semibold text-ink-strong underline underline-offset-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary">
                Back
              </button>
              <p className="hidden text-[14px] text-muted-warm sm:block" aria-hidden="true">
                {current.title}
              </p>
              <button
                type="submit"
                aria-disabled={!validation.valid || busy}
                aria-describedby={submit.error ? 'submit-error' : undefined}
                className={`inline-flex min-h-12 min-w-[120px] cursor-pointer items-center justify-center gap-2 rounded-xl px-6 text-[16px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-14 sm:px-8 ${
                  validation.valid ? 'bg-primary text-white shadow-[0_8px_20px_-8px_rgba(122,23,49,0.6)] hover:bg-primary/90' : 'bg-line text-ink'
                } ${busy ? 'cursor-wait' : ''}`}
              >
                {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />}
                {busy ? workingLabel : nextLabel}
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
        <HoldExpiredDialog
          open={expired}
          venueId={venue.id}
          selection={selection}
          retry={retry}
          onRetry={retryHold}
          onClose={() => {
            setExpired(false)
            goTo('selection')
          }}
        />
      </div>
    </MotionConfig>
  )
}

const INTERACTIVE = 'input, textarea, select, button, a, [role="switch"], [contenteditable], dialog'

const pillButton =
  'min-h-10 cursor-pointer items-center rounded-full border border-line px-3.5 text-[14px] font-medium text-ink-strong transition-colors hover:border-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-11 sm:px-5 sm:text-[15px]'

const slide = {
  enter: (offset) => ({ opacity: 0, x: offset }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit: (offset) => ({ opacity: 0, x: -offset, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }),
}

// After a step change: scroll to the top and focus the new step's heading (focus-on-route-change).
function StepFocus() {
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('main [data-step-heading]')?.focus({ preventScroll: true })
  }, [])
  return null
}
