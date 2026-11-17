import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { MotionConfig, motion } from 'motion/react'
import { InvitationError, getMyReply, getPublicInvitation, isRsvpOpen, submitRsvp } from '../api/invitations.js'
import InvitationCard, { InviteFonts } from '../features/invitations/InvitationCard.jsx'
import { WizardContext } from '../features/host/WizardContext.js'
import { Counter, ErrorText, TextField } from '../features/host/fields.jsx'
import { decodeCard, mapsUrl } from '../features/invitations/link.js'
import { formatContact, formatLongDate } from '../features/invitations/format.js'
import { MAX_PARTY_SIZE } from '../features/invitations/options.js'
import { validateRsvp } from '../features/invitations/schema.js'
import { downloadIcsFile, eventIcs } from '../features/booking/ics.js'
import { todayKey } from '../lib/format.js'
import { formatPkMobile } from '../lib/phone.js'

// /invite/:id: the guest's invitation (REQ-38, REQ-39, EUC-26/27). Public, no account, no site chrome.
// The card comes from the local mock store when this browser has it, otherwise from the link's #c= hash
// (features/invitations/link.js), so a QR scanned on any phone opens. The guest replies Attending (with a party
// size) or Can't make it; this device remembers the reply so it can be changed until the reply-by day.
// TODO(pwa): cache this page so it opens offline once loaded (docs/ui-and-dashboards.md, EUC-27 2.1).

const MY_REPLIES = 'markiesharkie:my-rsvps' // { [invitationId]: inviteToken } on this device
function readToken(invitationId) {
  try {
    return JSON.parse(localStorage.getItem(MY_REPLIES) ?? '{}')[invitationId] ?? null
  } catch {
    return null
  }
}
function writeToken(invitationId, token) {
  try {
    const all = JSON.parse(localStorage.getItem(MY_REPLIES) ?? '{}')
    localStorage.setItem(MY_REPLIES, JSON.stringify({ ...all, [invitationId]: token }))
  } catch {
    // blocked storage: the reply is still saved, this device just won't recognise it after a reload
  }
}

const THEMES = {
  classic: { page: 'bg-[radial-gradient(120%_80%_at_50%_0%,#5a1024_0%,#2b0811_70%)]', text: 'text-[#f3e6d0]' },
  floral: { page: 'bg-[linear-gradient(180deg,#fdf3f3_0%,#f8e4e9_100%)]', text: 'text-[#6b4b55]' },
  modern: { page: 'bg-surface', text: 'text-muted-warm' },
  mehndi: { page: 'bg-[radial-gradient(120%_80%_at_50%_0%,#1f5233_0%,#0d2417_70%)]', text: 'text-[#f6e7c4]' },
}

export default function GuestInvitation() {
  const { id } = useParams()
  const { hash } = useLocation()
  const linkCard = useMemo(() => decodeCard(hash, id), [hash, id])
  const [state, setState] = useState({ status: 'loading', card: null })

  useEffect(() => {
    let cancelled = false
    getPublicInvitation(id)
      .then((stored) => {
        if (cancelled) return
        const card = stored ?? linkCard
        setState(card ? { status: 'ready', card } : { status: 'not-found', card: null })
      })
      .catch((error) => {
        console.error('[invitations] guest load failed', error)
        if (!cancelled) setState(linkCard ? { status: 'ready', card: linkCard } : { status: 'not-found', card: null })
      })
    return () => {
      cancelled = true
    }
  }, [id, linkCard])

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface p-4" aria-busy="true" aria-label="Opening your invitation">
        <div className="aspect-[5/7] w-full max-w-[440px] animate-pulse rounded-2xl bg-line motion-reduce:animate-none" />
      </main>
    )
  }
  if (state.status === 'not-found') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
        <title>Invitation not found · MarkieSharkie</title>
        <h1 className="font-heading text-[28px] font-semibold text-ink-strong">We couldn’t open this invitation</h1>
        <p className="max-w-[44ch] text-[16px] text-muted-warm">The link may be incomplete. Ask the host to send it again, or scan the QR code on the card.</p>
        <Link to="/" className="inline-flex min-h-12 items-center rounded-xl border border-line bg-white px-6 text-[15px] font-semibold text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-primary">
          Go to MarkieSharkie
        </Link>
      </main>
    )
  }
  return <Invitation card={state.card} />
}

function Invitation({ card }) {
  const theme = THEMES[card.template] ?? THEMES.classic
  const today = todayKey()
  const open = isRsvpOpen(card.rsvpBy, today) && today < card.eventDate

  function addToCalendar() {
    const ics = eventIcs({
      uid: card.invitationId,
      date: card.eventDate,
      start: card.startTime,
      end: card.endTime,
      summary: card.title,
      location: [card.hallName, card.venueName, card.venueAddress].filter(Boolean).join(', '),
      description: `Hosted by ${card.hostNames}. Invitation: ${window.location.href}`,
    })
    downloadIcsFile(ics, 'invitation.ics')
  }

  return (
    <MotionConfig reducedMotion="user">
      <title>{`${card.title} · Invitation`}</title>
      <InviteFonts />
      <main className={`min-h-dvh overflow-x-clip px-4 py-8 sm:py-14 ${theme.page}`}>
        <div className="mx-auto flex w-full max-w-[460px] flex-col gap-5" style={{ perspective: 1200 }}>
          <motion.div
            initial={{ opacity: 0, y: 28, rotateX: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: '50% 0%' }}
            className="overflow-hidden rounded-2xl shadow-[0_30px_70px_-24px_rgba(0,0,0,0.55)]"
          >
            <InvitationCard card={card} titleAs="h1" />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }} className="flex flex-col gap-5">
            <section aria-label="Directions and calendar" className="grid gap-3 rounded-3xl bg-white p-5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.35)] sm:grid-cols-2">
              <a href={mapsUrl(card)} target="_blank" rel="noopener noreferrer" className={`${primaryButton} sm:col-span-2`}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
                Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <button type="button" onClick={addToCalendar} className={secondaryButton}>
                Add to calendar
              </button>
              {card.contactPhone ? (
                <a href={`tel:${card.contactPhone}`} className={secondaryButton}>
                  Call the host
                </a>
              ) : null}
            </section>

            <Rsvp card={card} open={open} />
          </motion.div>

          <p className={`pb-4 text-center text-[13px] ${theme.text}`}>
            Sent with{' '}
            <Link to="/" className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-current">
              MarkieSharkie
            </Link>
          </p>
        </div>
      </main>
    </MotionConfig>
  )
}

const primaryButton =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[16px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(122,23,49,0.6)] transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const secondaryButton =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-[15px] font-semibold text-ink-strong transition-colors hover:border-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

function Rsvp({ card, open }) {
  const [reply, setReply] = useState(() => {
    const token = readToken(card.invitationId)
    return token ? getMyReply(card.invitationId, token) : null
  })
  const [editing, setEditing] = useState(false)
  // The control that had focus unmounts when the form opens or closes, so focus moves on purpose:
  // to the saved reply (announced via its heading text) or back to "Change my reply".
  const focusNext = useRef(null) // 'summary' | 'change' | null, applied after the next render
  const summaryRef = useRef(null)
  const changeRef = useRef(null)
  useEffect(() => {
    if (!focusNext.current) return
    ;(focusNext.current === 'summary' ? summaryRef : changeRef).current?.focus()
    focusNext.current = null
  })
  const deadline = card.rsvpBy ? formatLongDate(card.rsvpBy) : ''

  return (
    <section aria-labelledby="rsvp-title" className="rounded-3xl bg-white p-5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.35)] sm:p-6">
      <h2 id="rsvp-title" className="font-heading text-[22px] font-semibold text-ink-strong">
        {open ? 'Will you attend?' : 'RSVP closed'}
      </h2>
      {open ? (
        <p className="mt-1 text-[15px] text-muted-warm">Please reply by {deadline}.</p>
      ) : (
        <p className="mt-1 text-[15px] text-muted-warm">
          Replies closed on {deadline}.{card.contactPhone && <> To change your plans, call the host on {formatContact(card.contactPhone)}.</>}
        </p>
      )}

      {reply && !editing && <ReplySummary ref={summaryRef} reply={reply} />}
      {open && reply && !editing && (
        <button ref={changeRef} type="button" onClick={() => setEditing(true)} className={`${secondaryButton} mt-4 w-full`}>
          Change my reply
        </button>
      )}
      {open && (!reply || editing) && (
        <RsvpForm
          card={card}
          reply={reply}
          onCancel={
            reply
              ? () => {
                  setEditing(false)
                  focusNext.current = 'change'
                }
              : null
          }
          onSaved={(saved) => {
            setReply(saved)
            setEditing(false)
            focusNext.current = 'summary'
          }}
        />
      )}
    </section>
  )
}

function ReplySummary({ reply, ref }) {
  const yes = reply.response === 'yes'
  return (
    <div ref={ref} tabIndex={-1} className={`mt-4 flex items-start gap-3 rounded-2xl p-4 outline-none focus-visible:outline-2 focus-visible:outline-primary ${yes ? 'bg-success-bg' : 'bg-surface'}`}>
      <span aria-hidden="true" className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white ${yes ? 'bg-success' : 'bg-muted-warm'}`}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          {yes ? <path d="m5 12 5 5L20 7" /> : <path d="M6 6l12 12M18 6 6 18" />}
        </svg>
      </span>
      <div className="text-[15px]">
        <p className="font-semibold text-ink-strong">
          {yes ? `Thanks, ${reply.name}. You’re attending${reply.partySize > 1 ? ` with ${reply.partySize} people in total` : ''}.` : `Thanks for letting us know, ${reply.name}. You can’t make it.`}
        </p>
        <p className="mt-0.5 text-muted-warm">Reply saved for {formatPkMobile(reply.phone)}.</p>
      </div>
    </div>
  )
}

function RsvpForm({ card, reply, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({ name: reply?.name ?? '', phone: reply ? formatPkMobile(reply.phone) : '', response: reply?.response ?? '', partySize: reply?.partySize || 1 }))
  const [touched, setTouched] = useState(() => new Set())
  const [showAll, setShowAll] = useState(false)
  const [submit, setSubmit] = useState({ status: 'idle', error: '' })
  const validation = validateRsvp(form)
  const errorFor = useCallback((path) => (showAll || touched.has(path) ? validation.errors[path] : undefined), [showAll, touched, validation])
  const touch = useCallback((path) => setTouched((t) => (t.has(path) ? t : new Set(t).add(path))), [])
  const context = useMemo(() => ({ errorFor, touch }), [errorFor, touch])
  const busy = submit.status === 'working'
  const set = (changes) => setForm((f) => ({ ...f, ...changes }))
  const responseError = errorFor('response')

  async function send(event) {
    event.preventDefault()
    if (busy) return
    if (!validation.valid) {
      setShowAll(true)
      requestAnimationFrame(() => (document.querySelector('#rsvp-form [aria-invalid="true"]') ?? document.querySelector('#rsvp-form [data-error]')?.closest('fieldset')?.querySelector('input'))?.focus())
      return
    }
    setSubmit({ status: 'working', error: '' })
    try {
      const result = await submitRsvp(card.invitationId, form, card)
      writeToken(card.invitationId, result.inviteToken)
      onSaved(result.reply)
    } catch (error) {
      console.error('[invitations] rsvp failed', error)
      setSubmit({ status: 'error', error: error instanceof InvitationError ? error.message : 'We couldn’t send your reply. Check your connection and try again.' })
    }
  }

  return (
    <WizardContext.Provider value={context}>
      <form id="rsvp-form" noValidate onSubmit={send} className="mt-5 flex flex-col gap-5">
        <fieldset aria-describedby={responseError ? 'field-response-error' : undefined}>
          <legend className="mb-3 text-[15px] font-medium text-ink-strong">Your reply</legend>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['yes', 'Attending'],
              ['no', 'Can’t make it'],
            ].map(([value, label]) => {
              const checked = form.response === value
              return (
                <label key={value} className={`flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border px-3 text-center text-[16px] font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${checked ? 'border-primary bg-blush text-primary shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-outline-strong text-ink-strong hover:border-ink-strong'}`}>
                  <input type="radio" name="response" value={value} checked={checked} onChange={() => set({ response: value })} onBlur={() => touch('response')} className="sr-only" />
                  {label}
                </label>
              )
            })}
          </div>
          <ErrorText id="field-response-error">{responseError}</ErrorText>
        </fieldset>

        {form.response === 'yes' && (
          <div className="rounded-2xl bg-surface p-4">
            <Counter id="field-partySize" label="People coming, including you" value={form.partySize} min={1} max={MAX_PARTY_SIZE} onChange={(partySize) => set({ partySize })} />
          </div>
        )}

        <TextField path="name" label="Your name" value={form.name} onChange={(name) => set({ name })} autoComplete="name" dir="auto" maxLength={60} />
        <TextField path="phone" type="tel" inputMode="tel" autoComplete="tel" label="Mobile number" hint="Only the host sees it. Use the same number to change your reply later." placeholder="0300-1234567" value={form.phone} onChange={(phone) => set({ phone })} />

        <div className="flex flex-col gap-3">
          <button type="submit" aria-disabled={busy || undefined} className={`${primaryButton} ${busy ? 'cursor-wait opacity-80' : ''}`}>
            {busy && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
            {busy ? 'Sending…' : reply ? 'Update my reply' : 'Send reply'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className={secondaryButton}>
              Keep my earlier reply
            </button>
          )}
          {submit.error && (
            <p role="alert" className="text-[14px] text-danger">
              {submit.error}
            </p>
          )}
        </div>
      </form>
    </WizardContext.Provider>
  )
}
