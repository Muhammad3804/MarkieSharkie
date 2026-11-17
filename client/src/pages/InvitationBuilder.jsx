import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import FlowHeaderShell from '../features/booking/FlowHeader.jsx'
import HelpDrawer from '../features/host/HelpDrawer.jsx'
import { WizardContext, useWizard } from '../features/host/WizardContext.js'
import { ErrorText, StepHeading, TextArea, TextField } from '../features/host/fields.jsx'
import { InvitationError, getInvitationContext, saveInvitation, toPublicCard } from '../api/invitations.js'
import InvitationCard, { InviteFonts } from '../features/invitations/InvitationCard.jsx'
import QrShare from '../features/invitations/QrShare.jsx'
import { useQrCode } from '../features/invitations/useQrCode.js'
import { newInviteDraft, saveInviteDraft, updateInviteDraft, useInviteDraft } from '../features/invitations/draft.js'
import { INVITE_EVENT_TYPES, INVITE_TEMPLATES, LIMITS } from '../features/invitations/options.js'
import { validateInviteStep } from '../features/invitations/schema.js'
import { INVITE_STEPS, inviteStepIndex } from '../features/invitations/steps.js'
import { inviteUrl, mapsUrl } from '../features/invitations/link.js'
import { formatLongDate, formatTimeRange } from '../features/invitations/format.js'
import { bookingReference } from '../lib/booking.js'
import { addDays } from '../lib/days.js'
import { todayKey } from '../lib/format.js'
import { normalizePkMobile } from '../lib/phone.js'

// /bookings/:id/invite/:step: QR invitation builder (REQ-36), one topic per screen like the booking flow:
// pick a design -> details (prefilled from the booking, live preview) -> review & generate (QR + share).
// Only for a Confirmed booking. Frontend only, on the mock api/invitations.js.
// TODO(auth): customer only, and only for their own booking (the mock acts as the demo customer).

export default function InvitationBuilder() {
  const { id, step } = useParams()
  const [state, setState] = useState({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const { draft, saved } = useInviteDraft(id)

  useEffect(() => {
    let cancelled = false
    getInvitationContext(id)
      .then((context) => !cancelled && setState({ status: 'ready', ...context }))
      .catch((error) => {
        if (cancelled) return
        if (error instanceof InvitationError && error.code === 'NOT_FOUND') setState({ status: 'not-found' })
        else {
          console.error('[invitations] load failed', error)
          setState({ status: 'error' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id, version])

  // First visit: start the draft from the saved invitation or the booking.
  const ready = state.status === 'ready' && state.booking.status === 'confirmed'
  useEffect(() => {
    if (ready && !draft) saveInviteDraft(id, newInviteDraft(state.booking, state.invitation))
  }, [ready, draft, id, state.booking, state.invitation])

  if (state.status === 'loading' || (ready && !draft)) return <Message loading />
  if (state.status === 'not-found') return <Message title="Booking not found" body="This booking doesn’t exist or isn’t yours." />
  if (state.status === 'error') return <Message title="Couldn’t load this booking" body="Check your connection and try again. Your invitation draft is saved." onRetry={() => setVersion((v) => v + 1)} />
  if (!ready) return <Message title="Invitations open once the booking is confirmed" body={`Booking ${bookingReference(state.booking.bookingId)} isn’t confirmed yet. When the venue records your advance, you can make a QR invitation here.`} />

  const index = inviteStepIndex(step)
  if (index < 0) return <Navigate to={`/bookings/${id}/invite/${draft.lastStep ?? 'template'}`} replace />
  const blocked = INVITE_STEPS.slice(0, index).find((s) => !validateInviteStep(s.id, draft, state.booking.date).valid)
  if (blocked) return <Navigate to={`/bookings/${id}/invite/${blocked.id}`} replace />
  return <Builder bookingId={id} step={step} index={index} draft={draft} saved={saved} facts={state.facts} initialInvitation={state.invitation} />
}

function Message({ loading, title, body, onRetry }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <FlowHeaderShell />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-4 px-4 py-16 sm:px-6" aria-busy={loading || undefined}>
        {loading ? (
          <div className="flex flex-col gap-4" aria-label="Loading your invitation">
            <div className="h-10 w-2/3 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
            <div className="h-5 w-1/2 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
            <div className="mt-6 h-72 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />
          </div>
        ) : (
          <>
            <title>{`${title} · MarkieSharkie`}</title>
            <h1 className="font-heading text-[28px] font-semibold text-ink-strong">{title}</h1>
            <p className="max-w-[60ch] text-[16px] text-muted-warm">{body}</p>
            <div className="flex flex-wrap gap-3">
              {onRetry && (
                <button type="button" onClick={onRetry} className="min-h-12 cursor-pointer rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  Try again
                </button>
              )}
              <Link to="/bookings" className="inline-flex min-h-12 items-center rounded-xl border border-line px-6 text-[15px] font-semibold text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-primary">
                Back to my bookings
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

const DRAFT_FIELDS = ['template', 'title', 'eventType', 'hostNames', 'message', 'rsvpBy']
// Has the host changed anything since the invitation was generated?
function differs(draft, invitation) {
  if (!invitation) return true
  if (DRAFT_FIELDS.some((key) => (draft[key] ?? '').trim() !== (invitation[key] ?? '').trim())) return true
  return normalizePkMobile(draft.contactPhone) !== invitation.contactPhone
}

function Builder({ bookingId, step, index, draft, saved, facts, initialInvitation }) {
  const navigate = useNavigate()
  const current = INVITE_STEPS[index]
  const [invitation, setInvitation] = useState(initialInvitation)
  const [checks, setChecks] = useState({ step, touched: new Set(), showAll: false })
  const [helpOpen, setHelpOpen] = useState(false)
  const [submit, setSubmit] = useState({ status: 'idle', error: '' })
  const [announcement, setAnnouncement] = useState('')

  const [slideState, setSlideState] = useState({ index, direction: 1, moved: false })
  if (slideState.index !== index) setSlideState({ index, direction: index > slideState.index ? 1 : -1, moved: true })
  const reduceMotion = useReducedMotion()
  const offset = reduceMotion ? 0 : slideState.direction * 48

  const update = useCallback((changes) => updateInviteDraft(bookingId, changes), [bookingId])
  useEffect(() => {
    updateInviteDraft(bookingId, { lastStep: step })
  }, [bookingId, step])

  const validation = useMemo(() => validateInviteStep(step, draft, facts.eventDate), [step, draft, facts.eventDate])
  const stepChecks = useMemo(() => (checks.step === step ? checks : { step, touched: new Set(), showAll: false }), [checks, step])
  const touch = useCallback(
    (path) =>
      setChecks((c) => {
        const base = c.step === step ? c : { step, touched: new Set(), showAll: false }
        return base.touched.has(path) ? base : { ...base, touched: new Set(base.touched).add(path) }
      }),
    [step],
  )
  const errorFor = useCallback((path) => (stepChecks.showAll || stepChecks.touched.has(path) ? validation.errors[path] : undefined), [stepChecks, validation])

  // The card as guests will see it (preview uses the draft, the share link uses the saved invitation).
  const previewCard = useMemo(() => ({ ...facts, ...draft, invitationId: invitation?.invitationId ?? 'preview' }), [facts, draft, invitation])
  const dirty = differs(draft, invitation)
  const context = useMemo(() => ({ draft, update, errorFor, touch, facts, previewCard, invitation, dirty }), [draft, update, errorFor, touch, facts, previewCard, invitation, dirty])

  const goTo = (id) => navigate(`/bookings/${bookingId}/invite/${id}`)
  const busy = submit.status === 'working'

  async function generate() {
    setSubmit({ status: 'working', error: '' })
    try {
      const result = await saveInvitation(bookingId, draft)
      setInvitation(result)
      setSubmit({ status: 'idle', error: '' })
      setAnnouncement(invitation ? 'Invitation updated. Share the new QR code.' : 'Invitation ready. Share the QR code or the link.')
    } catch (error) {
      console.error('[invitations] save failed', error)
      setSubmit({ status: 'error', error: error instanceof InvitationError ? error.message : 'We couldn’t generate the invitation. Your answers are saved; try again.' })
    }
  }

  function next() {
    if (busy) return
    if (!validation.valid) {
      const count = Object.keys(validation.errors).length
      setChecks({ step, touched: stepChecks.touched, showAll: true })
      setAnnouncement((previous) => {
        const text = `Fix ${count === 1 ? 'one thing' : `${count} things`} before you continue.`
        return previous === text ? `${text} ` : text
      })
      requestAnimationFrame(() => {
        const field = document.querySelector('main [aria-invalid="true"]') ?? document.querySelector('main [data-error]')?.closest('fieldset')?.querySelector('input')
        field?.focus()
      })
      return
    }
    setAnnouncement('')
    if (step === 'review') {
      if (dirty) return generate()
      return navigate('/bookings')
    }
    goTo(INVITE_STEPS[index + 1].id)
  }

  function back() {
    if (index === 0) navigate('/bookings')
    else goTo(INVITE_STEPS[index - 1].id)
  }

  function saveAndExit() {
    if (!saved && !window.confirm('Your invitation draft couldn’t be saved on this device (storage is blocked or full). Leave anyway?')) return
    navigate('/bookings')
  }

  const View = { template: TemplateStep, details: DetailsStep, review: ReviewStep }[step]
  const nextLabel = step !== 'review' ? 'Next' : !dirty ? 'Done' : invitation ? 'Update invitation' : 'Generate invitation'

  return (
    <MotionConfig reducedMotion="user">
      <title>{`Invitation · ${current.title} | MarkieSharkie`}</title>
      <InviteFonts />
      <div className="flex min-h-dvh flex-col bg-white">
        <FlowHeaderShell>
          <span className={`hidden text-[13px] lg:inline ${saved ? 'text-muted-warm' : 'text-danger'}`}>{saved ? 'Draft saved' : 'Not saved on this device'}</span>
          <button type="button" onClick={() => setHelpOpen(true)} className={`${pillButton} hidden sm:inline-flex`} aria-haspopup="dialog">
            Questions?
          </button>
          <button type="button" onClick={saveAndExit} className={`${pillButton} inline-flex`}>
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
                <motion.div key={step} custom={offset} variants={slide} initial="enter" animate="center" exit="exit" className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
                  {slideState.moved && <StepFocus />}
                  <p className="mb-3 text-[14px] font-medium text-muted-warm">
                    Step {index + 1} of {INVITE_STEPS.length} · QR invitation
                  </p>
                  <View />
                </motion.div>
              </AnimatePresence>
            </WizardContext.Provider>
          </main>

          <footer className="fixed inset-x-0 bottom-0 z-30 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(41,28,31,0.16)]">
            <div role="progressbar" aria-label="Invitation progress" aria-valuemin={0} aria-valuemax={INVITE_STEPS.length} aria-valuenow={index + 1} aria-valuetext={`Step ${index + 1} of ${INVITE_STEPS.length}, ${current.title}`} className="grid grid-cols-3 gap-1.5">
              {INVITE_STEPS.map((s, i) => (
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
                {busy ? 'Generating…' : nextLabel}
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

const pillButton =
  'min-h-10 cursor-pointer items-center rounded-full border border-line px-3.5 text-[14px] font-medium text-ink-strong transition-colors hover:border-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-11 sm:px-5 sm:text-[15px]'

const slide = {
  enter: (offset) => ({ opacity: 0, x: offset }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit: (offset) => ({ opacity: 0, x: -offset, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }),
}

function StepFocus() {
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('main [data-step-heading]')?.focus({ preventScroll: true })
  }, [])
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// Step 1: design. Each option is a real radio around a full preview of the card with the host's own details.

function TemplateStep() {
  const { draft, update, errorFor, previewCard } = useWizard()
  const error = errorFor('template')
  return (
    <>
      <StepHeading title="Choose a design" subtitle="Each preview shows your event. You can switch any time; your details stay the same." />
      <fieldset aria-describedby={error ? 'field-template-error' : undefined}>
        <legend className="sr-only">Invitation design</legend>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {INVITE_TEMPLATES.map((template) => {
            const checked = draft.template === template.value
            return (
              <label
                key={template.value}
                className={`group relative flex cursor-pointer flex-col gap-4 rounded-3xl border bg-white p-3 transition-[border-color,box-shadow] duration-150 hover:border-ink-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary sm:p-4 ${
                  checked ? 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary),0_16px_40px_-18px_rgba(122,23,49,0.35)]' : 'border-outline-strong'
                }`}
              >
                <input type="radio" name="template" value={template.value} checked={checked} onChange={() => update({ template: template.value })} className="sr-only" />
                <div aria-hidden="true" className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(41,28,31,0.08),0_10px_24px_-14px_rgba(41,28,31,0.35)]">
                  <InvitationCard card={{ ...previewCard, template: template.value }} titleAs="p" />
                </div>
                <span className="px-1 pb-1">
                  <span className="block text-[17px] font-semibold text-ink-strong">{template.label}</span>
                  <span className="mt-1 block text-[14px] leading-snug text-muted-warm">{template.description}</span>
                </span>
                {checked && (
                  <span className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full bg-primary text-white shadow-md sm:right-6 sm:top-6">
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <ErrorText id="field-template-error">{error}</ErrorText>
      </fieldset>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Step 2: details, with the live preview beside the form (lg+) or behind a toggle (below lg).

function DetailsStep() {
  const { draft, update, errorFor, touch, facts, previewCard } = useWizard()
  const [showPreview, setShowPreview] = useState(false)
  const typeError = errorFor('eventType')
  const today = todayKey()
  const lastReplyDay = addDays(facts.eventDate, -1)
  return (
    <>
      <StepHeading title="Event details" subtitle="We filled in what we know from your booking. Add the rest; the card updates as you type." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-7">
          <div className="lg:hidden">
            <button type="button" aria-expanded={showPreview} aria-controls="mobile-preview" onClick={() => setShowPreview((v) => !v)} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-blush px-4 text-[15px] font-semibold text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {showPreview ? 'Hide card preview' : 'Show card preview'}
              <svg viewBox="0 0 24 24" className={`size-5 transition-transform motion-reduce:transition-none ${showPreview ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div id="mobile-preview" hidden={!showPreview} className="mx-auto mt-4 max-w-[400px]">
              <PreviewCard card={previewCard} />
            </div>
          </div>

          <BookingFacts facts={facts} />

          <TextField path="title" label="Event name" value={draft.title} onChange={(title) => update({ title })} maxLength={LIMITS.title} autoComplete="off" />

          <fieldset aria-describedby={typeError ? 'field-eventType-error' : undefined}>
            <legend className="mb-3 text-[15px] font-medium text-ink-strong">Event type</legend>
            <div className="flex flex-wrap gap-2">
              {INVITE_EVENT_TYPES.map((type) => {
                const checked = draft.eventType === type.value
                return (
                  <label key={type.value} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[15px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${checked ? 'border-primary bg-primary text-white' : 'border-outline-strong text-ink-strong hover:border-ink-strong'}`}>
                    <input type="radio" name="eventType" value={type.value} checked={checked} onChange={() => update({ eventType: type.value })} onBlur={() => touch('eventType')} className="sr-only" />
                    {type.label}
                  </label>
                )
              })}
            </div>
            <ErrorText id="field-eventType-error">{typeError}</ErrorText>
          </fieldset>

          <TextField path="hostNames" label="Host family names" hint="As they should read on the card, like “The Khan and Malik families”." value={draft.hostNames} onChange={(hostNames) => update({ hostNames })} maxLength={LIMITS.hostNames} dir="auto" />

          <TextArea path="message" label="Personal message (optional)" hint={`A line or two for your guests. Up to ${LIMITS.message} characters.`} value={draft.message} onChange={(message) => update({ message })} maxLength={LIMITS.message} rows={3} dir="auto" />

          <div className="grid gap-7 sm:grid-cols-2">
            <TextField path="rsvpBy" type="date" label="Reply by" hint={`Before the event day (${formatLongDate(facts.eventDate)}).`} value={draft.rsvpBy} onChange={(rsvpBy) => update({ rsvpBy })} min={today} max={lastReplyDay} />
            <TextField path="contactPhone" type="tel" inputMode="tel" autoComplete="tel" label="Contact phone" hint="Printed on the card for guests’ questions." placeholder="0300-1234567" value={draft.contactPhone} onChange={(contactPhone) => update({ contactPhone })} />
          </div>
        </div>

        <aside aria-label="Card preview" className="hidden lg:block">
          <div className="sticky top-[112px]">
            <p className="mb-3 text-[14px] font-medium text-muted-warm">Live preview</p>
            <PreviewCard card={previewCard} />
          </div>
        </aside>
      </div>
    </>
  )
}

function PreviewCard({ card, qr = null }) {
  return (
    <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(41,28,31,0.08),0_20px_48px_-20px_rgba(41,28,31,0.45)]">
      <InvitationCard card={card} qr={qr} />
    </div>
  )
}

function BookingFacts({ facts }) {
  const id = useId()
  const rows = [
    ['Venue', facts.venueName],
    ['Hall', facts.hallName],
    ['Date', formatLongDate(facts.eventDate)],
    ['Time', formatTimeRange(facts.startTime, facts.endTime)],
    ['Address', facts.venueAddress],
  ]
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-surface p-5">
      <h2 id={id} className="text-[15px] font-semibold text-ink-strong">
        From your booking
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className={label === 'Address' ? 'sm:col-span-2' : ''}>
            <dt className="text-[13px] text-muted-warm">{label}</dt>
            <dd className="font-medium text-ink-strong">{value}</dd>
          </div>
        ))}
      </dl>
      <a href={mapsUrl(facts)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
        Check the location on Google Maps<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Step 3: review & generate. The QR only exists once the invitation is saved (it encodes the saved link).

function ReviewStep() {
  const { previewCard, invitation, dirty } = useWizard()
  const cardRef = useRef(null)
  const shareCard = useMemo(() => (invitation ? toPublicCard(invitation) : null), [invitation])
  const url = shareCard ? inviteUrl(shareCard) : ''
  const { dataUrl: qr, failed: qrFailed } = useQrCode(url)
  const ready = shareCard && !dirty
  return (
    <>
      <StepHeading
        title={ready ? 'Your invitation is ready' : 'Review your invitation'}
        subtitle={ready ? 'Share the QR code or the link. Replies show up on your booking.' : invitation ? 'You changed some details. Update the invitation to get a new QR code.' : 'Check the card, then generate your QR code and link.'}
      />
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-14">
        <div className="mx-auto w-full max-w-[440px]">
          <div ref={cardRef} className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(41,28,31,0.08),0_20px_48px_-20px_rgba(41,28,31,0.45)]">
            <InvitationCard card={ready ? shareCard : previewCard} qr={!ready ? 'pending' : qrFailed ? null : (qr ?? 'pending')} />
          </div>
        </div>
        {ready ? (
          <QrShare url={url} qr={qr} qrFailed={qrFailed} card={shareCard} cardRef={cardRef} />
        ) : (
          <div className="rounded-3xl border border-dashed border-outline-strong bg-blush/50 p-6">
            <h2 className="font-heading text-[20px] font-semibold text-ink-strong">What happens next</h2>
            <ol className="mt-3 grid list-decimal gap-2 pl-5 text-[15px] text-ink">
              <li>Generating makes a QR code and a link for this card.</li>
              <li>Download the card or QR, or share the link on WhatsApp.</li>
              <li>Guests open it on their phone, no account needed, and reply Attending or Can’t make it.</li>
              <li>You see replies and the guest total on your booking.</li>
            </ol>
          </div>
        )}
      </div>
    </>
  )
}
