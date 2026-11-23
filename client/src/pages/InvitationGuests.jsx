import { useCallback, useEffect, useId, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import {
  InvitationError,
  addGuests,
  getInvitationContext,
  listGuests,
  newGuestLink,
  removeGuest,
  resendGuest,
  revokeGuest,
  sendInvitations,
} from '../api/invitations.js'
import Button from '../components/ui/Button.jsx'
import ConfirmDialog from '../features/admin/ConfirmDialog.jsx'
import { ToastProvider } from '../features/admin/toast.jsx'
import { useToast } from '../features/admin/toastContext.js'
import { formatLongDate, formatTimeRange } from '../features/invitations/format.js'
import { normalizePkMobile, formatPkMobile } from '../lib/phone.js'

// /bookings/:id/guests: the host's event page (EUC-25 steps 4-6, EUC-27 host view, REQ-37, REQ-38). Add guests
// (email and / or mobile), send everyone their personal link (email, or copy it to share), and follow replies
// against the hall's capacity. All of it is on the server; links are shown once (only a hash is stored), so
// "New link" makes a fresh one and the old one stops working.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'attending', label: 'Attending' },
  { value: 'declined', label: 'Can’t make it' },
  { value: 'awaiting', label: 'No reply yet' },
  { value: 'not_delivered', label: 'Not delivered' },
]
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

export default function InvitationGuests() {
  return (
    <ToastProvider>
      <GuestsPage />
    </ToastProvider>
  )
}

function GuestsPage() {
  const { id: bookingId } = useParams()
  const location = useLocation()
  const toast = useToast()
  const [context, setContext] = useState({ status: 'loading' })
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [list, setList] = useState({ key: null, status: 'loading', guests: [], totals: null })
  const [version, setVersion] = useState(0)
  const [links, setLinks] = useState({}) // guestId -> link made in this session (shown once by the server)
  const [sendResult, setSendResult] = useState(null)
  const [dialog, setDialog] = useState(null) // { kind, guest }
  const [busy, setBusy] = useState(false)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    getInvitationContext(bookingId)
      .then((c) => !cancelled && setContext({ status: 'ready', ...c }))
      .catch((error) => !cancelled && setContext({ status: error instanceof InvitationError && error.code === 'NOT_FOUND' ? 'not-found' : 'error' }))
    return () => {
      cancelled = true
    }
  }, [bookingId])

  const invitationId = context.invitation?.invitationId
  const key = `${filter}|${q}|${version}`
  useEffect(() => {
    if (!invitationId) return undefined
    let cancelled = false
    const timer = setTimeout(
      () =>
        listGuests(invitationId, { status: filter, q })
          .then((data) => !cancelled && setList({ key, status: 'ready', ...data }))
          .catch(() => !cancelled && setList((s) => ({ ...s, key, status: 'error' }))),
      q ? 250 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [invitationId, filter, q, key])

  // Replies come in while the page is open: read again when the tab comes back into view.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const remember = (results) => setLinks((current) => ({ ...current, ...Object.fromEntries(results.map((r) => [r.guestId, r.link])) }))

  async function sendAll() {
    setBusy(true)
    try {
      const { results } = await sendInvitations(invitationId)
      remember(results)
      setSendResult(results)
      reload()
      if (!results.length) toast('Everyone already has their invitation.')
    } catch (error) {
      toast(error instanceof InvitationError ? error.message : 'We couldn’t send the invitations. Try again.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (context.status === 'loading') return <PageShell loading />
  if (context.status !== 'ready')
    return (
      <PageShell>
        <h1 className="font-heading text-[28px] font-semibold text-ink-strong">{context.status === 'not-found' ? 'Booking not found' : 'We couldn’t load this page'}</h1>
        <p className="mt-2 text-[15px] text-muted-warm">{context.status === 'not-found' ? 'This booking doesn’t exist or isn’t yours.' : 'Check your connection and try again.'}</p>
        <Button to="/bookings" variant="outline" className="mt-6 min-h-11 px-5">
          Back to my bookings
        </Button>
      </PageShell>
    )
  if (!context.invitation)
    return (
      <PageShell>
        <h1 className="font-heading text-[28px] font-semibold text-ink-strong">Make the invitation first</h1>
        <p className="mt-2 text-[15px] text-muted-warm">Pick a design and add your event details, then come back to add guests.</p>
        <Button to={`/bookings/${bookingId}/invite`} className="mt-6 min-h-11 px-5">
          Create the invitation
        </Button>
      </PageShell>
    )

  const inv = context.invitation
  const totals = list.totals
  const status = list.key === key ? list.status : 'loading'

  return (
    <PageShell>
      <title>{`Guests · ${inv.title} | MarkieSharkie`}</title>
      {location.state?.saved && (
        <p role="status" className="mb-4 rounded-xl bg-success-bg px-4 py-3 text-[14px] font-medium text-success">
          {location.state.saved === 'created' ? 'Invitation saved. Now add your guests.' : 'Invitation updated. Guests see the changes on their links.'}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-muted-warm">Your event</p>
          <h1 data-page-heading tabIndex={-1} className="break-words font-heading text-[28px] font-semibold leading-tight text-ink-strong outline-none sm:text-[34px]">
            {inv.title}
          </h1>
          <p className="mt-1 text-[15px] text-ink">
            {formatLongDate(inv.eventDate)} · {formatTimeRange(inv.startTime, inv.endTime)}
          </p>
          <p className="text-[15px] text-muted-warm">
            {inv.venueName}
            {inv.hallName ? `, ${inv.hallName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button to={`/bookings/${bookingId}/invite/review`} variant="outline" className="min-h-11 px-4">
            Edit invitation
          </Button>
          <Button to="/bookings" variant="outline" className="min-h-11 px-4">
            My bookings
          </Button>
        </div>
      </div>

      {totals && <Totals totals={totals} />}

      <AddGuestForm
        onAdd={async (guest) => {
          await addGuests(invitationId, [guest])
          reload()
          toast(`${guest.name} added. Send to give them their link.`)
        }}
      />

      <section aria-labelledby="guest-list-title" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="guest-list-title" className="font-heading text-[22px] font-semibold text-ink-strong">
            Guest list
          </h2>
          <Button onClick={sendAll} disabled={busy || !totals?.invited} className="min-h-11 px-5 disabled:opacity-50">
            {busy ? 'Sending…' : 'Send to everyone not sent yet'}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-11 cursor-pointer rounded-full border px-4 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${filter === f.value ? 'border-primary bg-primary/5 text-primary' : 'border-line text-ink-strong hover:bg-surface'}`}
            >
              {f.label}
            </button>
          ))}
          <label className="ml-auto flex min-w-0 grow items-center sm:grow-0">
            <span className="sr-only">Search guests</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or mobile" className="h-11 w-full min-w-0 rounded-xl border border-outline-strong px-3 text-[15px] sm:w-64 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary" />
          </label>
        </div>

        {status === 'loading' && (
          <div aria-busy="true" aria-label="Loading guests" className="mt-4 grid gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
            ))}
          </div>
        )}
        {status === 'error' && (
          <div role="alert" className="mt-4 rounded-2xl border border-line p-4 text-[15px]">
            We couldn’t load the guest list.{' '}
            <button type="button" onClick={reload} className="cursor-pointer font-semibold text-primary underline underline-offset-4">
              Try again
            </button>
          </div>
        )}
        {status === 'ready' && list.guests.length === 0 && (
          <p className="mt-4 rounded-2xl border border-dashed border-outline-strong px-5 py-8 text-center text-[15px] text-muted-warm">
            {filter === 'all' && !q ? 'No guests yet. Add them above with an email or a mobile number.' : 'No guests match.'}
          </p>
        )}
        {status === 'ready' && list.guests.length > 0 && (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {list.guests.map((g) => (
              <GuestRow key={g.guestId} guest={g} link={links[g.guestId]} onAction={(kind) => setDialog({ kind, guest: g })} onCopied={() => toast(`Link for ${g.name} copied.`)} />
            ))}
          </ul>
        )}
      </section>

      {sendResult && <SendResult results={sendResult} onClose={() => setSendResult(null)} onCopied={(name) => toast(`Link for ${name} copied.`)} />}

      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog && DIALOGS[dialog.kind].title(dialog.guest)}
        body={dialog && DIALOGS[dialog.kind].body(dialog.guest)}
        confirmLabel={dialog && DIALOGS[dialog.kind].confirm}
        tone={dialog && DIALOGS[dialog.kind].tone}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const { kind, guest } = dialog
          if (kind === 'remove') await removeGuest(invitationId, guest.guestId)
          if (kind === 'revoke') await revokeGuest(invitationId, guest.guestId)
          if (kind === 'link' || kind === 'resend') {
            const { results } = kind === 'link' ? await newGuestLink(invitationId, guest.guestId) : await resendGuest(invitationId, guest.guestId)
            remember(results)
            if (kind === 'link') await copy(results[0].link)
            reload()
            return kind === 'link' ? `New link for ${guest.name} copied. Share it with them.` : results[0].delivery === 'sent' ? `Invitation emailed to ${guest.name} again.` : `Email to ${guest.name} failed: ${results[0].error}`
          }
          reload()
          return DIALOGS[kind].done(guest)
        }}
      />
    </PageShell>
  )
}

const DIALOGS = {
  link: {
    title: (g) => `New link for ${g.name}?`,
    body: () => 'We make a new personal link and copy it for you. Their old link stops working, so share the new one.',
    confirm: 'Make & copy link',
    tone: 'primary',
  },
  resend: {
    title: (g) => `Email ${g.name} again?`,
    body: (g) => `We send a new link to ${g.email}. Their old link stops working.`,
    confirm: 'Send again',
    tone: 'primary',
  },
  revoke: {
    title: (g) => `Revoke ${g.name}’s link?`,
    body: () => 'Their link stops working. Their reply stays on your list. You can give them a new link later.',
    confirm: 'Revoke link',
    tone: 'danger',
    done: (g) => `${g.name}’s link was revoked.`,
  },
  remove: {
    title: (g) => `Remove ${g.name}?`,
    body: () => 'They’re taken off your list with their reply, and their link stops working.',
    confirm: 'Remove guest',
    tone: 'danger',
    done: (g) => `${g.name} was removed.`,
  },
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function PageShell({ loading, children }) {
  return (
    <main id="main" aria-busy={loading || undefined} className="mx-auto w-full max-w-[1040px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      {loading ? (
        <div aria-label="Loading your event" className="grid gap-4">
          <div className="h-10 w-2/3 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-3xl bg-surface motion-reduce:animate-none" />
        </div>
      ) : (
        children
      )}
    </main>
  )
}

function Totals({ totals }) {
  const { invited, attending, declined, awaiting, people, hallCapacity, bookedGuests } = totals
  const over = hallCapacity && people > hallCapacity
  const overBooked = !over && people > bookedGuests
  const width = hallCapacity ? Math.min(100, Math.round((people / hallCapacity) * 100)) : 0
  return (
    <section aria-label="Replies" className="mt-6 rounded-3xl bg-blush/70 p-5">
      <dl className="grid grid-cols-2 gap-4 text-center sm:grid-cols-5">
        {[
          ['Invited', invited],
          ['Attending', attending],
          ['Can’t make it', declined],
          ['No reply yet', awaiting],
          ['People coming', people],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[13px] text-muted-warm">{label}</dt>
            <dd className="font-heading text-[24px] font-semibold tabular-nums text-ink-strong">{value}</dd>
          </div>
        ))}
      </dl>
      {hallCapacity && (
        <div className="mt-4">
          <div className="flex justify-between text-[13px] text-muted-warm">
            <span>
              {people.toLocaleString('en-US')} of {hallCapacity.toLocaleString('en-US')} hall capacity
            </span>
            <span>Booked for {bookedGuests.toLocaleString('en-US')}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white" role="presentation">
            <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${width}%` }} />
          </div>
        </div>
      )}
      {over && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-bg p-3 text-[14px] text-danger">
          {people.toLocaleString('en-US')} people are coming, more than the hall holds ({hallCapacity.toLocaleString('en-US')}). Talk to the venue about a bigger hall or trim the list.
        </p>
      )}
      {overBooked && (
        <p className="mt-3 rounded-xl bg-pending-bg p-3 text-[14px] text-pending">More people are coming than the {bookedGuests.toLocaleString('en-US')} you booked for. Ask the venue to update the guest count; the menu is charged per guest.</p>
      )}
    </section>
  )
}

function AddGuestForm({ onAdd }) {
  const id = useId()
  const [values, setValues] = useState({ name: '', email: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    setErrors((x) => ({ ...x, [key]: '', form: '' }))
  }
  async function submit(event) {
    event.preventDefault()
    const name = values.name.trim()
    const email = values.email.trim()
    const phone = values.phone.trim()
    const next = {}
    if (name.length < 2) next.name = 'Enter the guest’s name.'
    if (email && !EMAIL_RE.test(email)) next.email = 'Enter an email like name@example.com.'
    if (phone && !normalizePkMobile(phone)) next.phone = 'Enter a Pakistani mobile number, like 0300-1234567.'
    if (!email && !phone) next.email = 'Add an email or a mobile number.'
    setErrors(next)
    if (Object.keys(next).length) {
      document.getElementById(`${id}-${Object.keys(next)[0]}`)?.focus()
      return
    }
    setBusy(true)
    try {
      await onAdd({ name, email, phone })
      setValues({ name: '', email: '', phone: '' })
      document.getElementById(`${id}-name`)?.focus()
    } catch (error) {
      setErrors({ form: error instanceof InvitationError ? error.message : 'We couldn’t add the guest. Try again.' })
    } finally {
      setBusy(false)
    }
  }
  const field = (key, label, props) => (
    <div className="min-w-0">
      <label htmlFor={`${id}-${key}`} className="mb-1.5 block text-[14px] font-medium text-ink-strong">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        value={values[key]}
        onChange={set(key)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        className="block h-12 w-full rounded-xl border border-outline-strong px-4 text-[16px] text-ink-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary aria-[invalid=true]:border-danger"
        {...props}
      />
      {errors[key] && (
        <p id={`${id}-${key}-error`} className="mt-1 text-[13px] text-danger">
          {errors[key]}
        </p>
      )}
    </div>
  )
  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className="mt-8 rounded-3xl border border-line p-5">
      <h2 id={`${id}-title`} className="font-heading text-[20px] font-semibold text-ink-strong">
        Add a guest
      </h2>
      <p className="mt-1 text-[14px] text-muted-warm">An email to send the invitation, a mobile number to share the link yourself, or both.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1.2fr_1.2fr_1fr_auto] sm:items-start">
        {field('name', 'Name', { autoComplete: 'off', maxLength: 60, dir: 'auto' })}
        {field('email', 'Email (optional)', { type: 'email', inputMode: 'email', autoComplete: 'off', maxLength: 254 })}
        {field('phone', 'Mobile (optional)', { type: 'tel', inputMode: 'tel', autoComplete: 'off', placeholder: '0300-1234567' })}
        <Button type="submit" disabled={busy} className="min-h-12 px-5 sm:mt-[26px] disabled:opacity-60">
          {busy ? 'Adding…' : 'Add guest'}
        </Button>
      </div>
      <div aria-live="polite">{errors.form && <p className="mt-3 text-[14px] text-danger">{errors.form}</p>}</div>
    </form>
  )
}

function deliveryText(g, hasLink) {
  if (g.delivery === 'revoked') return { text: 'Link revoked', tone: 'text-muted-warm' }
  if (g.delivery === 'failed') return { text: `Not delivered: ${g.deliveryError ?? 'email failed'}`, tone: 'text-danger' }
  if (g.delivery === 'sent') return { text: 'Invitation emailed', tone: 'text-success' }
  if (g.sentAt || hasLink) return { text: 'Link made: share it yourself', tone: 'text-ink' }
  return { text: 'Not sent yet', tone: 'text-pending' }
}

function GuestRow({ guest: g, link, onAction, onCopied }) {
  const delivery = deliveryText(g, Boolean(link))
  const reply = g.reply ? (g.reply.response === 'yes' ? `Attending · ${g.reply.partySize} ${g.reply.partySize === 1 ? 'person' : 'people'}` : 'Can’t make it') : 'No reply yet'
  return (
    <li className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p dir="auto" className="break-words text-[15px] font-semibold text-ink-strong">
          {g.name}
        </p>
        <p className="break-words text-[13px] text-muted-warm">{[g.email, g.phone && formatPkMobile(g.phone)].filter(Boolean).join(' · ')}</p>
        <p className="text-[13px]">
          <span className={delivery.tone}>{delivery.text}</span>
          <span className="text-muted-warm"> · </span>
          <span className={g.reply?.response === 'yes' ? 'font-medium text-success' : 'text-ink'}>{reply}</span>
        </p>
        {g.reply?.note && <p className="mt-0.5 break-words text-[13px] italic text-muted-warm">“{g.reply.note}”</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {link && g.delivery !== 'revoked' ? (
          <Button
            variant="outline"
            onClick={async () => {
              if (await copy(link)) onCopied()
            }}
            className="min-h-11 px-3"
          >
            Copy link<span className="sr-only"> for {g.name}</span>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => onAction('link')} className="min-h-11 px-3">
            New link<span className="sr-only"> for {g.name}</span>
          </Button>
        )}
        {g.email && g.delivery !== 'revoked' && (
          <Button variant="outline" onClick={() => onAction('resend')} className="min-h-11 px-3">
            {g.delivery === 'failed' ? 'Retry email' : 'Email again'}
            <span className="sr-only"> to {g.name}</span>
          </Button>
        )}
        {g.delivery !== 'revoked' && (
          <button type="button" onClick={() => onAction('revoke')} className="min-h-11 cursor-pointer rounded-[20px] px-3 text-[14px] font-medium text-ink underline underline-offset-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary">
            Revoke<span className="sr-only"> {g.name}’s link</span>
          </button>
        )}
        <button type="button" onClick={() => onAction('remove')} className="min-h-11 cursor-pointer rounded-[20px] px-3 text-[14px] font-medium text-danger underline underline-offset-4 hover:bg-danger-bg focus-visible:outline-2 focus-visible:outline-primary">
          Remove<span className="sr-only"> {g.name}</span>
        </button>
      </div>
    </li>
  )
}

// After "Send": who got an email, whose failed, and the links to share by hand (shown once).
function SendResult({ results, onClose, onCopied }) {
  const id = useId()
  if (!results.length) return null
  const sent = results.filter((r) => r.delivery === 'sent').length
  const manual = results.filter((r) => r.delivery !== 'sent')
  return (
    <section aria-labelledby={id} role="region" className="mt-6 rounded-3xl border border-primary/30 bg-white p-5 shadow-[0_16px_40px_-18px_rgba(41,28,31,0.25)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={id} className="font-heading text-[20px] font-semibold text-ink-strong">
          {sent ? `${sent} invitation${sent === 1 ? '' : 's'} emailed` : 'Links ready'}
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 cursor-pointer rounded-lg px-3 text-[14px] font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
          Close
        </button>
      </div>
      {manual.length > 0 && (
        <>
          <p className="mt-1 text-[14px] text-muted-warm">Share these personal links yourself (WhatsApp, SMS). They’re shown here once; you can make a new one later.</p>
          <ul className="mt-3 grid gap-2">
            {manual.map((r) => (
              <li key={r.guestId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                <span className="min-w-0 text-[14px]">
                  <span className="font-semibold text-ink-strong">{r.name}</span>
                  {r.delivery === 'failed' && <span className="text-danger"> · email failed: {r.error}</span>}
                </span>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (await copy(r.link)) onCopied(r.name)
                  }}
                  className="min-h-11 px-3"
                >
                  Copy link<span className="sr-only"> for {r.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
