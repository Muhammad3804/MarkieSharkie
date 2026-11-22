import { useEffect, useId, useRef, useState } from 'react'
import { REVIEW_REPORT_REASONS, reportReview } from '../../api/reviews.js'

// "Report review" (REQ-44): a native modal <dialog> (focus trap, Esc closes) with a reason and optional details.
// The report goes to the admin "Reviews" queue; the reviewer doesn't see who sent it.
export default function ReportReviewDialog({ review, open, onClose, onSent }) {
  const ref = useRef(null)
  const noteRef = useRef(null)
  const id = useId()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState({ status: 'idle', error: '', field: null })

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) {
      setReason('')
      setNote('')
      setState({ status: 'idle', error: '', field: null })
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const busy = state.status === 'sending'
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!reason) {
      setState({ status: 'idle', error: 'Choose a reason.', field: 'reason' })
      ref.current.querySelector('input[type=radio]')?.focus()
      return
    }
    if (reason === 'other' && note.trim().length < 5) {
      setState({ status: 'idle', error: 'Tell us what’s wrong (at least 5 characters).', field: 'note' })
      noteRef.current?.focus()
      return
    }
    setState({ status: 'sending', error: '', field: null })
    try {
      await reportReview(review.venueId, review.reviewId, { reason, note: note.trim() })
      onSent('Thanks. Our team will look at this review.')
      onClose()
    } catch (error) {
      if (error?.name === 'ReportError' && error.code === 'ALREADY_REPORTED') {
        onSent(error.message)
        onClose()
        return
      }
      if (error?.name !== 'ReportError') console.error('[venue] review report failed', error)
      setState({
        status: 'idle',
        error: error?.name === 'ReportError' ? error.message : 'We couldn’t send your report. Check your connection and try again.',
        field: error?.field === 'note' ? 'note' : null,
      })
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => event.target === ref.current && !busy && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[20px] bg-white p-0 text-ink shadow-panel backdrop:bg-ink-strong/40"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-6">
        <div>
          <h2 id={`${id}-title`} className="font-heading text-[20px] font-semibold text-ink-strong">
            Report this review
          </h2>
          <p id={`${id}-desc`} className="mt-1 text-[14px] text-muted-warm">
            Review by {review.customerName}. Our team checks every report; the reviewer doesn’t see who sent it.
          </p>
        </div>
        <fieldset aria-describedby={state.field === 'reason' ? `${id}-error` : undefined}>
          <legend className="mb-2 text-[14px] font-semibold text-ink-strong">Reason</legend>
          <div className="flex flex-col gap-1">
            {REVIEW_REPORT_REASONS.map((option) => (
              <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2 text-[15px] text-ink-strong hover:bg-surface has-focus-visible:outline-2 has-focus-visible:outline-primary">
                <input type="radio" name={`${id}-reason`} value={option.value} checked={reason === option.value} onChange={() => {
                    setReason(option.value)
                    setState((s) => (s.error ? { status: 'idle', error: '', field: null } : s))
                  }} className="size-4 accent-primary" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-[14px] font-semibold text-ink-strong">
            Details {reason === 'other' ? <span className="text-danger">*</span> : <span className="font-normal text-muted-warm">(optional)</span>}
          </label>
          <textarea
            ref={noteRef}
            id={`${id}-note`}
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              if (state.field === 'note') setState({ status: 'idle', error: '', field: null })
            }}
            aria-invalid={state.field === 'note' || undefined}
            aria-describedby={state.field === 'note' ? `${id}-error` : undefined}
            placeholder="What did you notice?"
            className="w-full resize-y rounded-[10px] border border-outline-strong px-3 py-2 text-[15px] text-ink-strong placeholder:text-placeholder focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30 aria-invalid:border-danger"
          />
        </div>
        <div aria-live="polite">
          {state.error && (
            <p id={`${id}-error`} role="alert" className="text-[14px] text-danger">
              {state.error}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => !busy && onClose()} aria-disabled={busy || undefined} className="h-11 cursor-pointer rounded-[12px] border border-outline-strong px-5 text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Cancel
          </button>
          <button type="submit" aria-disabled={busy || undefined} className="h-11 cursor-pointer rounded-[12px] bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:opacity-60">
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
