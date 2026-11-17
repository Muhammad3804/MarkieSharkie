import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './ui.jsx'
import { useToast } from './toastContext.js'
import AdminIcon from './icons.jsx'

// Confirm step for every admin action (native modal <dialog>: focus trap, Esc to cancel, page scroll locked in
// index.css). Destructive actions start with focus on Cancel. `field` adds a textarea, e.g. a required reason that
// is shown to the owner. onConfirm(text) may be async; errors stay in the dialog so nothing is lost. It can return
// a toast message (or [message, options]), shown after the dialog has closed so screen readers announce it.
// If the button that opened the dialog is gone afterwards (the row left the list), focus goes to the page heading.
export default function ConfirmDialog({ open, title, body, confirmLabel, tone = 'primary', field, warning, onConfirm, onClose }) {
  const ref = useRef(null)
  const cancelRef = useRef(null)
  const fieldRef = useRef(null)
  const id = useId()
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setText(field?.initial ?? '')
      setTouched(false)
      setError('')
      setBusy(false)
      dialog.showModal()
      ;(field ? fieldRef.current : tone === 'danger' ? cancelRef.current : null)?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, field, tone])

  const minLength = field?.minLength ?? (field?.required ? 10 : 0)
  const fieldError = field && touched && text.trim().length < minLength ? (text.trim() ? `Write at least ${minLength} characters so the owner knows what to do.` : `${field.label} is required.`) : ''

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (field && text.trim().length < minLength) {
      setTouched(true)
      fieldRef.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    try {
      const message = await onConfirm(text.trim())
      onClose()
      requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body) document.querySelector('[data-page-heading]')?.focus({ preventScroll: true })
        if (message) toast(...(Array.isArray(message) ? message : [message]))
      })
    } catch (err) {
      console.error('[admin] action failed', err)
      setError('That didn’t work. Nothing was changed; try again.')
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(event) => {
        if (busy) event.preventDefault()
        else onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-ink shadow-panel backdrop:bg-ink-strong/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone === 'danger' ? 'bg-danger-bg text-danger' : 'bg-rose text-primary'}`}>
            <AdminIcon name={tone === 'danger' ? 'alert' : 'info'} />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="font-heading text-[18px] font-semibold text-ink-strong">{title}</h2>
            <div id={`${id}-body`} className="mt-1 text-[14px] leading-relaxed text-muted-warm">{body}</div>
          </div>
        </div>
        {warning && (
          <p className="flex gap-2 rounded-lg bg-pending-bg px-3 py-2.5 text-[13px] leading-snug text-pending">
            <AdminIcon name="alert" className="mt-px size-4" />
            {warning}
          </p>
        )}
        {field && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-field`} className="text-[13px] font-semibold text-ink-strong">
              {field.label}
              {field.required && <span className="text-danger"> *</span>}
            </label>
            <textarea
              ref={fieldRef}
              id={`${id}-field`}
              value={text}
              rows={4}
              maxLength={1000}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={field.placeholder}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={`${id}-hint${fieldError ? ` ${id}-error` : ''}`}
              className="w-full resize-y rounded-lg border border-outline-strong px-3 py-2 text-[14px] leading-relaxed text-ink-strong placeholder:text-placeholder focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30 aria-invalid:border-danger"
            />
            <p id={`${id}-hint`} className="text-[12px] text-muted-warm">{field.hint}</p>
            {fieldError && <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">{fieldError}</p>}
          </div>
        )}
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={() => !busy && onClose()} aria-disabled={busy || undefined}>
            Cancel
          </Button>
          <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
