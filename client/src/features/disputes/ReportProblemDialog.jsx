import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DESCRIPTION_MIN, DISPUTE_CATEGORIES, MAX_EVIDENCE, openDispute, uploadEvidence } from '../../api/disputes.js'
import { ApiError } from '../../api/http.js'

// "Report a problem" on a booking (REQ-48, EUC-35): the customer or the venue owner opens a dispute with a category,
// what happened and up to 5 photos (JPEG / PNG ≤ 5 MB, uploaded as they're picked and private). On success it goes
// to the dispute page. One open dispute per booking per side (the server says so if there is one already).
const PHOTO_TYPES = ['image/jpeg', 'image/png']
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

export default function ReportProblemDialog({ booking, otherSide, onClose }) {
  const ref = useRef(null)
  const id = useId()
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState([]) // { key, name, preview, status: uploading|done|failed, fileId, error }
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const open = Boolean(booking)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) {
      setCategory('')
      setDescription('')
      // Free the previews of the last report (a removed photo frees its own).
      setPhotos((current) => {
        current.forEach((p) => URL.revokeObjectURL(p.preview))
        return []
      })
      setErrors({})
      setError('')
      setBusy(false)
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  }, [open])


  async function addFiles(list) {
    const room = MAX_EVIDENCE - photos.length
    const picked = [...list].slice(0, Math.max(0, room))
    for (const file of picked) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`
      const problem = !PHOTO_TYPES.includes(file.type) ? 'Use a JPEG or PNG photo.' : file.size > PHOTO_MAX_BYTES ? 'Photos can be up to 5 MB.' : ''
      const entry = { key, name: file.name, preview: URL.createObjectURL(file), status: problem ? 'failed' : 'uploading', error: problem }
      setPhotos((current) => [...current, entry])
      if (problem) continue
      uploadEvidence(file)
        .then(({ fileId }) => setPhotos((current) => current.map((p) => (p.key === key ? { ...p, status: 'done', fileId } : p))))
        .catch((err) => setPhotos((current) => current.map((p) => (p.key === key ? { ...p, status: 'failed', error: err instanceof ApiError && err.status !== 0 ? err.message : 'Upload failed. Check your connection.' } : p))))
    }
    if (list.length > room) setError(`You can attach up to ${MAX_EVIDENCE} photos.`)
  }

  function removePhoto(key) {
    setPhotos((current) => {
      const gone = current.find((p) => p.key === key)
      if (gone) URL.revokeObjectURL(gone.preview)
      return current.filter((p) => p.key !== key)
    })
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const problems = {}
    if (!category) problems.category = 'Pick what the problem is about.'
    if (description.trim().length < DESCRIPTION_MIN) problems.description = `Describe what happened in at least ${DESCRIPTION_MIN} characters.`
    setErrors(problems)
    if (Object.keys(problems).length) {
      ref.current.querySelector(problems.category ? 'input[type=radio]' : 'textarea')?.focus()
      return
    }
    if (photos.some((p) => p.status === 'uploading')) {
      setError('Wait for the photos to finish uploading.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const evidenceIds = photos.filter((p) => p.status === 'done').map((p) => p.fileId)
      const { dispute } = await openDispute(booking.bookingId, { category, description, evidenceIds })
      onClose()
      navigate(`/disputes/${dispute.id}`, { state: { opened: true } })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors)
      setError(err instanceof ApiError && err.status !== 0 && err.status < 500 ? err.message : 'We couldn’t send it. Check your connection and try again.')
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-outline-strong px-3 py-2.5 text-[15px] text-ink-strong placeholder:text-placeholder focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30 aria-invalid:border-danger'
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => event.target === ref.current && !busy && onClose()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[20px] bg-white p-0 text-ink shadow-panel backdrop:bg-ink-strong/40"
    >
      {booking && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5 p-6">
          <div>
            <h2 id={`${id}-title`} className="font-heading text-[20px] font-semibold text-ink-strong">Report a problem</h2>
            <p className="mt-1 text-[14px] text-muted-warm">
              {booking.eventName || 'Your event'} at {booking.venueName}. {otherSide} and a MarkieSharkie admin will see this. The admin looks at the booking and both sides before deciding.
            </p>
          </div>

          <fieldset aria-describedby={errors.category ? `${id}-category-error` : undefined}>
            <legend className="mb-2 text-[14px] font-semibold text-ink-strong">What is it about?</legend>
            <div className="flex flex-col gap-1">
              {DISPUTE_CATEGORIES.map((option) => (
                <label key={option.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] px-2 py-2 hover:bg-surface">
                  <input type="radio" name={`${id}-category`} value={option.value} checked={category === option.value} onChange={() => { setCategory(option.value); setErrors((e) => ({ ...e, category: '' })) }} className="mt-1 size-4 accent-primary" />
                  <span>
                    <span className="block text-[15px] text-ink-strong">{option.label}</span>
                    {option.hint && <span className="block text-[13px] text-muted-warm">{option.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
            {errors.category && <p id={`${id}-category-error`} role="alert" className="mt-1 text-[14px] text-danger">{errors.category}</p>}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-description`} className="text-[14px] font-semibold text-ink-strong">What happened?</label>
            <textarea id={`${id}-description`} rows={5} maxLength={2000} value={description} onChange={(e) => { setDescription(e.target.value); if (errors.description) setErrors((x) => ({ ...x, description: '' })) }} aria-invalid={Boolean(errors.description)} aria-describedby={`${id}-description-hint`} placeholder="When it happened, what was agreed and what you’d like done." className={field} />
            <p id={`${id}-description-hint`} className={`text-[13px] ${errors.description ? 'text-danger' : 'text-muted-warm'}`} role={errors.description ? 'alert' : undefined}>
              {errors.description || `At least ${DESCRIPTION_MIN} characters. ${description.trim().length}/2000`}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[14px] font-semibold text-ink-strong">
              Photos <span className="font-normal text-muted-warm">(optional, up to {MAX_EVIDENCE}, JPEG or PNG up to 5 MB)</span>
            </p>
            {photos.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((p) => (
                  <li key={p.key} className="relative">
                    <img src={p.preview} alt={p.name} className={`aspect-square w-full rounded-lg object-cover ${p.status === 'failed' ? 'opacity-40' : ''}`} />
                    {p.status === 'uploading' && <span className="absolute inset-x-1 bottom-1 rounded bg-white/90 px-1 text-center text-[11px] text-ink">Uploading…</span>}
                    {p.status === 'failed' && <span className="absolute inset-x-1 bottom-1 rounded bg-white/95 px-1 text-center text-[11px] text-danger" title={p.error}>Not added</span>}
                    <button type="button" onClick={() => removePhoto(p.key)} aria-label={`Remove ${p.name}`} className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full border border-line bg-white text-[14px] text-ink-strong shadow hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.some((p) => p.status === 'failed') && (
              <p className="text-[13px] text-danger">{photos.find((p) => p.status === 'failed').error} Remove it and try another.</p>
            )}
            {photos.length < MAX_EVIDENCE && (
              <>
                <input id={`${id}-files`} type="file" accept="image/jpeg,image/png" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
                <label htmlFor={`${id}-files`} className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-xl border border-outline-strong px-4 text-[14px] font-medium text-ink-strong hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
                  Add photos
                </label>
              </>
            )}
          </div>

          {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => !busy && onClose()} aria-disabled={busy || undefined} className="h-11 rounded-[12px] border border-outline-strong px-5 text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Cancel
            </button>
            <button type="submit" aria-disabled={busy || undefined} className="h-11 rounded-[12px] bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:opacity-60">
              {busy ? 'Sending…' : 'Send to MarkieSharkie'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
