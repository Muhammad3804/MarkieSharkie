import { useEffect, useId, useRef, useState } from 'react'
import { reportVenue } from '../../api/disputes.js'
import { ApiError } from '../../api/http.js'
import { REPORT_REASONS } from '../../features/admin/format.js'

// "Report this listing" (srs-alignment #41): a native modal <dialog> with a reason and details, saved on the server
// (POST /api/venues/:id/reports, signed in) and reviewed on the admin "Disputes & reports" page. The owner never
// sees who reported. One open report per venue per person (409 REPORT_EXISTS).
const DETAILS_MIN = 10
export default function ReportListingDialog({ venue, open, onClose, onSent }) {
  const ref = useRef(null)
  const id = useId()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [state, setState] = useState({ status: 'idle', error: '' })

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) {
      setReason('')
      setDetails('')
      setState({ status: 'idle', error: '' })
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  async function submit(event) {
    event.preventDefault()
    if (state.status === 'sending') return
    if (!reason) {
      setState({ status: 'idle', error: 'Choose a reason.' })
      ref.current.querySelector('input[type=radio]')?.focus()
      return
    }
    if (details.trim().length < DETAILS_MIN) {
      setState({ status: 'idle', error: `Tell us a little more (at least ${DETAILS_MIN} characters).` })
      ref.current.querySelector('textarea')?.focus()
      return
    }
    setState({ status: 'sending', error: '' })
    try {
      await reportVenue(venue.id, { reason, details })
      onSent('Thanks. Our team will look into it.')
      onClose()
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'REPORT_EXISTS' || error.code === 'OWN_VENUE')) {
        onSent(error.message)
        onClose()
        return
      }
      setState({ status: 'idle', error: error instanceof ApiError && (error.status === 400 || error.status === 403) ? error.message : 'We couldn’t send your report. Check your connection and try again.' })
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault()
        if (state.status !== 'sending') onClose()
      }}
      onClick={(event) => event.target === ref.current && state.status !== 'sending' && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[20px] bg-white p-0 text-ink shadow-panel backdrop:bg-ink-strong/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <div>
          <h2 id={`${id}-title`} className="font-heading text-[20px] font-semibold text-ink-strong">Report this listing</h2>
          <p className="mt-1 text-[14px] text-muted-warm">Tell our team what’s wrong with {venue.name}. Reports are private; the owner doesn’t see who sent them.</p>
        </div>
        <fieldset aria-describedby={state.error ? `${id}-error` : undefined}>
          <legend className="mb-2 text-[14px] font-semibold text-ink-strong">Reason</legend>
          <div className="flex flex-col gap-1">
            {REPORT_REASONS.map((option) => (
              <label key={option.value} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2 text-[15px] text-ink-strong hover:bg-surface">
                <input type="radio" name={`${id}-reason`} value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} className="size-4 accent-primary" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-details`} className="text-[14px] font-semibold text-ink-strong">
            Details
          </label>
          <textarea id={`${id}-details`} rows={3} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What did you notice?" aria-describedby={`${id}-hint`} className="w-full resize-y rounded-[10px] border border-outline-strong px-3 py-2 text-[15px] text-ink-strong placeholder:text-placeholder focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30" />
        </div>
        <p id={`${id}-hint`} className="-mt-3 text-[12px] text-muted-warm">At least {DETAILS_MIN} characters.</p>
        {state.error && (
          <p id={`${id}-error`} role="alert" className="text-[14px] text-danger">{state.error}</p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => state.status !== 'sending' && onClose()} aria-disabled={state.status === 'sending' || undefined} className="h-11 rounded-[12px] border border-outline-strong px-5 text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Cancel
          </button>
          <button type="submit" aria-disabled={state.status === 'sending' || undefined} className="h-11 rounded-[12px] bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:opacity-60">
            {state.status === 'sending' ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
