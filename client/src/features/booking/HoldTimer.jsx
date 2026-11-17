import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatEventDate } from '../../lib/format.js'
import { useHoldCountdown } from './useHoldCountdown.js'

const ANNOUNCE_AT = [300, 120, 60, 30] // seconds left; screen readers hear these, not every tick

const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// Pill in the flow header: "Slot held · 9:41". Amber under 2 minutes. role="timer" is not live, so a separate
// polite region announces the thresholds. The ticking state lives here, so only this pill re-renders every second.
export function HoldTimer({ heldUntil, onExpire }) {
  const seconds = useHoldCountdown(heldUntil, onExpire)
  const [announcement, setAnnouncement] = useState('')
  const [lastAnnounced, setLastAnnounced] = useState(null)
  const threshold = ANNOUNCE_AT.find((at) => seconds <= at && seconds > at - 2)
  if (threshold && threshold !== lastAnnounced) {
    setLastAnnounced(threshold)
    setAnnouncement(`${threshold >= 60 ? `${threshold / 60} minute${threshold === 60 ? '' : 's'}` : `${threshold} seconds`} left on your slot hold.`)
  }
  if (seconds === null) return null
  const urgent = seconds <= 120
  return (
    <>
      <p
        role="timer"
        aria-label={`Slot held for ${mmss(seconds)} more`}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-[14px] font-medium tabular-nums sm:px-4 ${urgent ? 'border-pending/30 bg-pending-bg text-pending' : 'border-line bg-blush text-primary'}`}
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2M9 2h6" />
        </svg>
        <span className="hidden sm:inline">Slot held ·</span>
        <span>{mmss(seconds)}</span>
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}

// Modal shown when the hold runs out: the slot has been released. "Try again" re-holds it if it's still free;
// otherwise the reason and the nearest alternatives appear in the dialog.
export function HoldExpiredDialog({ open, venueId, selection, retry, onRetry, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  const busy = retry.status === 'working'
  return (
    <dialog
      ref={dialog}
      aria-labelledby="hold-expired-title"
      aria-describedby="hold-expired-body"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[460px] rounded-3xl bg-white p-0 shadow-[0_24px_64px_-16px_rgba(41,28,31,0.35)] backdrop:bg-ink-strong/45"
    >
      <div className="flex flex-col gap-4 p-6 sm:p-7">
        <span className="flex size-12 items-center justify-center rounded-full bg-pending-bg text-pending" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4M9 2h6" />
          </svg>
        </span>
        <h2 id="hold-expired-title" className="font-heading text-[22px] font-semibold text-ink-strong">
          Your hold has expired
        </h2>
        <p id="hold-expired-body" className="text-[15px] leading-relaxed text-ink">
          We released {selection.hallName}, {selection.slotLabel.toLowerCase()} on {formatEventDate(selection.date)} so other customers can book it. Your answers are saved. Try again to hold it for another 10 minutes if it’s still free.
        </p>
        {retry.status === 'error' && (
          <div role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-[14px] text-danger">
            <p className="font-medium">{retry.message}</p>
            {retry.alternatives?.dates?.length > 0 && <p className="mt-1 text-ink">Nearest free dates: {retry.alternatives.dates.map(formatEventDate).join(', ')}.</p>}
            {retry.alternatives?.halls?.length > 0 && <p className="mt-1 text-ink">Free at the same time: {retry.alternatives.halls.map((h) => h.name).join(', ')}.</p>}
          </div>
        )}
        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            to={`/venues/${venueId}?tab=availability`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-[15px] font-semibold text-ink-strong underline underline-offset-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            Choose another slot
          </Link>
          <button
            type="button"
            onClick={onRetry}
            aria-disabled={busy || undefined}
            className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${busy ? 'cursor-wait opacity-80' : ''}`}
          >
            {busy && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
            {busy ? 'Holding…' : 'Try again'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
