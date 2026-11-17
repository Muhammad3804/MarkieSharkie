import { useState } from 'react'

// The share actions for the guest link (download QR, download card, copy link, WhatsApp, Web Share).
// WhatsApp here is a plain wa.me share link the host sends themselves; per-guest delivery through the WhatsApp
// Business API (REQ-37, delivery status) is server work for later.

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'invitation'

function download(href, filename) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
}

export default function QrShare({ url, qr, qrFailed, card, cardRef }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const name = slug(card.title)
  const text = `You’re invited: ${card.title}. Open the invitation and reply here:`
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)

  const say = (message) => setStatus((previous) => (previous === message ? `${message} ` : message))

  async function downloadCard() {
    if (busy || !cardRef.current) return
    setBusy(true)
    try {
      const { toPng } = await import('html-to-image')
      const png = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true })
      download(png, `${name}-invitation.png`)
      say('Card image downloaded.')
    } catch (error) {
      console.error('[invitations] card image failed', error)
      say('Couldn’t make the card image. Try again, or download the QR on its own.')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      say('Link copied.')
    } catch {
      document.getElementById('invite-link')?.select()
      say('Couldn’t copy automatically. The link is selected: press Ctrl+C or Cmd+C.')
    }
  }

  async function share() {
    try {
      await navigator.share({ title: card.title, text, url })
    } catch (error) {
      if (error?.name !== 'AbortError') say('Sharing didn’t work on this device. Copy the link instead.')
    }
  }

  return (
    <section aria-labelledby="share-title" className="rounded-3xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(41,28,31,0.05),0_16px_40px_-18px_rgba(41,28,31,0.18)] sm:p-6">
      <h2 id="share-title" className="font-heading text-[20px] font-semibold text-ink-strong">
        Share your invitation
      </h2>
      <p className="mt-1 text-[15px] text-muted-warm">Guests scan the QR or open the link. No account or app needed.</p>

      <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {qrFailed ? (
          <p role="alert" className="flex size-44 shrink-0 items-center rounded-2xl border border-danger/30 bg-danger-bg p-4 text-[14px] text-danger">
            This invitation is too long for a QR code. Go back and shorten the message or names. The link below still works.
          </p>
        ) : qr ? (
          <img src={qr} alt={`QR code for the ${card.title} invitation`} width="176" height="176" className="size-44 shrink-0 rounded-2xl border border-line bg-white p-2" />
        ) : (
          <div aria-busy="true" aria-label="Making the QR code" className="size-44 shrink-0 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
        )}
        <div className="grid w-full gap-2">
          <button type="button" disabled={!qr} onClick={() => download(qr, `${name}-qr.png`)} className={actionButton}>
            <Icon d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            Download QR (PNG)
          </button>
          <button type="button" onClick={downloadCard} aria-disabled={busy || undefined} className={`${actionButton} ${busy ? 'cursor-wait opacity-70' : ''}`}>
            <Icon d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 13l2.5 2.5L16 10" />
            {busy ? 'Making image…' : 'Download card with QR'}
          </button>
        </div>
      </div>

      <label htmlFor="invite-link" className="mt-6 block text-[15px] font-medium text-ink-strong">
        Invitation link
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="invite-link"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          // Inside the builder's form: Enter here must not submit (it would leave the page).
          onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()} className="h-12 min-w-0 flex-1 truncate rounded-xl border border-outline-strong bg-surface px-4 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-primary" />
        <button type="button" onClick={copyLink} className={`${actionButton} sm:w-auto`}>
          <Icon d="M9 9h10v12H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          Copy link
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer" className={`${actionButton} border-[#1a7f4b]/40 text-[#146c3f] hover:border-[#146c3f] hover:bg-[#edf8f1]`}>
          <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1.1 2.7 11.5 11.5 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
          </svg>
          Share on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
        </a>
        {canShare && (
          <button type="button" onClick={share} className={actionButton}>
            <Icon d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14" />
            Share…
          </button>
        )}
      </div>

      <p role="status" className="mt-3 min-h-[1.5em] text-[14px] font-medium text-success">
        {status}
      </p>

      {import.meta.env.DEV && isLocal && (
        <p className="mt-1 rounded-2xl border border-dashed border-info/40 bg-info-bg/60 p-3 text-[13px] text-info">
          Dev note: this QR points at {window.location.origin}, which a phone can’t open. Run <code className="font-semibold">npm run dev -- --host</code> and open the app through the LAN address it prints, then generate the QR there.
        </p>
      )}
    </section>
  )
}

const actionButton =
  'inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-ink-strong transition-colors hover:border-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50'

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
