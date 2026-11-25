import { useCallback, useEffect, useRef, useState } from 'react'
import { photoCheckCounts, retryPhotoCheck, uploadPhotoForCheck } from '../../../api/host.js'
import { useWizard } from '../WizardContext.js'
import { ErrorText, StepHeading } from '../fields.jsx'
import { HALL_PHOTO_CATEGORIES, MAX_PHOTOS, MIN_PHOTOS, PHOTO_MAX_BYTES, PHOTO_TYPES, VENUE_PHOTO_CATEGORIES } from '../options.js'
import { ensureCover, newId } from '../draft.js'
import { deletePhotos, readPhotoFiles, savePhoto, usePhotoUrls } from '../photoStore.js'
import HostIcon from '../icons.jsx'

// Photos per hall and category. Files: JPEG/PNG up to 5 MB (REQ-8). Order in draft.venueImages is display order;
// moving a photo only swaps it with its neighbours in the same zone. One photo across the listing is the cover.
// srs-alignment #42: each photo is uploaded as soon as it's added and checked by our AI check against the admin's
// threshold; the result (and score) shows under the photo. A photo that looks AI-generated is never shown on the
// listing; if the check couldn't run, the photo says so with a Retry (it is never rejected for that).
const iconButton =
  'flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/95 text-ink-strong shadow-chip transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40'

const inZone = (image, hallId, category) => image.hallId === hallId && image.category === category

export default function PhotosStep() {
  const { draft, update, errorFor } = useWizard()
  const { venueImages, halls } = draft
  const photos = usePhotoUrls(venueImages.map((image) => image.imageId))
  const hallsWithPhotos = halls.filter((hall) => venueImages.some((image) => image.hallId === hall.hallId)).length
  const checks = photoCheckCounts(venueImages)

  // Upload + AI check per photo. `checking` = in flight (not saved in the draft); `attempted` stops a second start.
  const [checking, setChecking] = useState(() => new Set())
  const attempted = useRef(new Set())
  const setUpload = useCallback(
    (imageId, upload) => update((current) => ({ ...current, venueImages: current.venueImages.map((image) => (image.imageId === imageId ? { ...image, upload } : image)) })),
    [update],
  )
  const checkPhoto = useCallback(
    async (imageId, { file = null, retryUploadId = null } = {}) => {
      attempted.current.add(imageId)
      setChecking((current) => new Set(current).add(imageId))
      try {
        let result
        if (retryUploadId) result = await retryPhotoCheck(retryUploadId)
        else {
          const blob = file ?? (await readPhotoFiles([imageId]))[imageId]
          if (!blob) return
          result = await uploadPhotoForCheck(blob, file?.name || 'photo.jpg')
        }
        if (result) setUpload(imageId, result)
      } catch (error) {
        console.warn('[host] photo upload or check failed', error)
        setUpload(imageId, { uploadId: retryUploadId, status: 'pending', aiScore: null, canRetry: true, failed: true })
      } finally {
        setChecking((current) => {
          const next = new Set(current)
          next.delete(imageId)
          return next
        })
      }
    },
    [setUpload],
  )
  const retry = (image) => checkPhoto(image.imageId, { retryUploadId: image.upload?.uploadId ?? null })

  // Photos added before this check existed (or whose upload never finished) are checked once when the step opens.
  const unchecked = venueImages.filter((image) => !image.upload && !image.missing).map((image) => image.imageId).join(',')
  useEffect(() => {
    if (!unchecked) return
    const todo = unchecked.split(',').filter((imageId) => !attempted.current.has(imageId))
    for (const imageId of todo) attempted.current.add(imageId)
    // Started after this render (the upload is the external system being synchronised with).
    Promise.resolve().then(() => todo.forEach((imageId) => checkPhoto(imageId)))
  }, [unchecked, checkPhoto])

  // A file that's gone from this device (storage cleared, or never stored) can't be submitted: flag it so
  // validation blocks Next until the host removes it.
  const missingIds = venueImages.filter((image) => !image.missing && photos.isMissing(image.imageId)).map((image) => image.imageId).join(',')
  useEffect(() => {
    if (!missingIds) return
    const ids = new Set(missingIds.split(','))
    update((current) => ({ ...current, venueImages: current.venueImages.map((image) => (ids.has(image.imageId) ? { ...image, missing: true } : image)) }))
  }, [missingIds, update])

  // A file dropped outside a zone would make the browser open it and leave the wizard.
  useEffect(() => {
    const block = (event) => {
      if ([...(event.dataTransfer?.types ?? [])].includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  function addFiles(files, hallId, category) {
    const accepted = []
    const rejected = []
    let room = MAX_PHOTOS - venueImages.length
    for (const file of files) {
      if (!PHOTO_TYPES.includes(file.type)) rejected.push(`“${file.name}” isn’t a JPEG or PNG photo.`)
      else if (file.size > PHOTO_MAX_BYTES) rejected.push(`“${file.name}” is over 5 MB. Try a smaller copy.`)
      else if (room <= 0) rejected.push(`“${file.name}” wasn’t added: the limit is ${MAX_PHOTOS} photos.`)
      else {
        room -= 1
        accepted.push({ file, image: { imageId: newId(), hallId, category, fileName: file.name, size: file.size, type: file.type, isCover: false } })
      }
    }
    // The first photo ever added becomes the cover until the host picks another.
    if (accepted.length) update((current) => ({ ...current, venueImages: ensureCover([...current.venueImages, ...accepted.map((a) => a.image)]) }))
    for (const { image } of accepted) attempted.current.add(image.imageId)
    const stored = Promise.all(accepted.map(({ image, file }) => savePhoto(image.imageId, file))).then((results) => results.every(Boolean))
    for (const { image, file } of accepted) checkPhoto(image.imageId, { file })
    return { added: accepted.length, rejected, stored }
  }

  function remove(imageId) {
    if (!window.confirm('Remove this photo? You’ll need the file again to add it back.')) return false
    update((current) => ({ ...current, venueImages: ensureCover(current.venueImages.filter((image) => image.imageId !== imageId)) }))
    deletePhotos([imageId])
    return true
  }

  const makeCover = (imageId) =>
    update((current) => ({ ...current, venueImages: current.venueImages.map((image) => ({ ...image, isCover: image.imageId === imageId })) }))

  // Move `imageId` to where `targetId` is, within the same zone (drag and drop) or by one place (buttons).
  function moveTo(imageId, targetId) {
    if (imageId === targetId) return
    update((current) => {
      const images = [...current.venueImages]
      const from = images.findIndex((image) => image.imageId === imageId)
      const to = images.findIndex((image) => image.imageId === targetId)
      if (from < 0 || to < 0) return current
      const [moved] = images.splice(from, 1)
      images.splice(to, 0, moved)
      return { ...current, venueImages: images }
    })
  }

  const zoneProps = { images: venueImages, photos, addFiles, remove, makeCover, moveTo, checking, retry }
  const countError = errorFor('venueImages')
  const coverError = errorFor('photos.cover')

  return (
    <>
      <StepHeading
        title="Add some photos of your venue"
        subtitle={`You’ll need at least ${MIN_PHOTOS} photos, with at least one of every hall. JPEG or PNG, up to 5 MB each.`}
      />
      <div className="sticky top-[72px] z-10 -mx-4 mb-8 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:top-[88px] sm:-mx-6 sm:px-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]" aria-label="Photo requirements">
          <Requirement done={venueImages.length >= MIN_PHOTOS}>
            {venueImages.length} of {MIN_PHOTOS} photos
          </Requirement>
          <Requirement done={hallsWithPhotos === halls.length}>
            {hallsWithPhotos} of {halls.length} {halls.length === 1 ? 'hall' : 'halls'} with a photo
          </Requirement>
          <Requirement done={venueImages.some((image) => image.isCover)}>Cover photo chosen</Requirement>
          <Requirement done={checks.accepted >= MIN_PHOTOS}>
            {checks.accepted} of {MIN_PHOTOS} accepted by our photo check
          </Requirement>
        </ul>
        {checks.rejected_ai > 0 && (
          <p role="status" className="mt-2 rounded-xl bg-danger-bg px-3 py-2 text-[14px] text-danger">
            {checks.rejected_ai === 1 ? '1 photo looks' : `${checks.rejected_ai} photos look`} AI-generated, so {checks.rejected_ai === 1 ? 'it' : 'they'} won’t be shown and the listing can’t be approved with {checks.rejected_ai === 1 ? 'it' : 'them'}. Remove {checks.rejected_ai === 1 ? 'it' : 'them'} and upload real photographs taken at your venue.
            {checks.accepted + checks.unchecked < MIN_PHOTOS && ` With fewer than ${MIN_PHOTOS} accepted photos, the listing would be rejected.`}
          </p>
        )}
        <ErrorText id="field-venueImages-error">{countError}</ErrorText>
        <ErrorText id="field-photos-cover-error">{coverError}</ErrorText>
        <ErrorText id="field-photos-missing-error">{errorFor('photos.missing')}</ErrorText>
      </div>

      <div className="grid gap-12">
        {halls.map((hall) => (
          <section key={hall.hallId} aria-labelledby={`photos-${hall.hallId}`}>
            <h2 id={`photos-${hall.hallId}`} className="font-heading text-[22px] font-semibold text-ink-strong">
              {hall.name.trim() || 'Unnamed hall'}
            </h2>
            <ErrorText id={`field-photos-${hall.hallId}-error`}>{errorFor(`photos.${hall.hallId}`)}</ErrorText>
            <div className="mt-5 grid gap-8">
              {HALL_PHOTO_CATEGORIES.map((category) => (
                <PhotoZone key={category.value} hallId={hall.hallId} category={category} hallName={hall.name.trim() || 'Hall'} {...zoneProps} />
              ))}
            </div>
          </section>
        ))}
        <section aria-labelledby="photos-venue">
          <h2 id="photos-venue" className="font-heading text-[22px] font-semibold text-ink-strong">
            Around the venue
          </h2>
          <div className="mt-5 grid gap-8">
            {VENUE_PHOTO_CATEGORIES.map((category) => (
              <PhotoZone key={category.value} hallId={null} category={category} hallName="" {...zoneProps} />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

function Requirement({ done, children }) {
  return (
    <li className={`flex items-center gap-1.5 ${done ? 'text-success' : 'text-muted-warm'}`}>
      <span className={`flex size-5 items-center justify-center rounded-full ${done ? 'bg-success text-white' : 'border border-outline-strong'}`} aria-hidden="true">
        {done && <HostIcon name="check" className="size-3.5" strokeWidth={3} />}
      </span>
      {children}
      <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
    </li>
  )
}

// The AI check result under one photo (#42): friendly text, the score, or a Retry when the check couldn't run.
function CheckCaption({ image, checking, retry, label }) {
  const upload = image.upload
  if (checking) return <p className="text-[13px] text-muted-warm" role="status">Checking this photo…</p>
  if (!upload) return null
  if (upload.status === 'accepted')
    return (
      <p className="flex items-center gap-1 text-[13px] text-success">
        <HostIcon name="check" className="size-3.5" strokeWidth={3} /> Accepted · AI score {upload.aiScore}%
      </p>
    )
  if (upload.status === 'rejected_ai')
    return (
      <p className="text-[13px] leading-snug text-danger">
        Looks AI-generated (AI score {upload.aiScore}%). It won’t be shown. Use a real photo of your venue.
      </p>
    )
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-pending">
      {upload.failed ? 'Couldn’t upload or check this photo.' : 'Our photo check is busy. We’ll keep trying.'}
      <button type="button" onClick={() => retry(image)} className="cursor-pointer font-semibold underline underline-offset-2 hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-primary">
        Retry<span className="sr-only"> the check of {label}</span>
      </button>
    </p>
  )
}

function PhotoZone({ hallId, category, hallName, images, photos, addFiles, remove, makeCover, moveTo, checking, retry }) {
  const input = useRef(null)
  const uploadButton = useRef(null)
  const list = useRef(null)
  const [over, setOver] = useState(false)
  const [message, setMessage] = useState({ text: '', errors: [] })
  const [dragging, setDragging] = useState(null)
  const zoneImages = images.filter((image) => inZone(image, hallId, category.value))
  const title = hallName ? `${category.label} · ${hallName}` : category.label

  function handleFiles(fileList) {
    const { added, rejected, stored } = addFiles([...fileList], hallId, category.value)
    setMessage({ text: added ? `${added} photo${added === 1 ? '' : 's'} added to ${title}.` : '', errors: rejected })
    stored.then((ok) => {
      if (!ok) setMessage((m) => ({ ...m, errors: [...m.errors, 'This browser isn’t letting us save photos, so they’ll be lost if you refresh or leave. Finish this listing in one go or try another browser.'] }))
    })
  }

  // The removed photo took the focused button with it: continue from the zone's upload button.
  function removeAndRefocus(imageId) {
    if (remove(imageId)) uploadButton.current?.focus()
  }

  // Moving re-orders the list, which drops focus; put it back on the same control and say where the photo went.
  function move(imageId, targetId, direction, position) {
    moveTo(imageId, targetId)
    setMessage({ text: `Moved to position ${position} of ${zoneImages.length}.`, errors: [] })
    requestAnimationFrame(() => {
      const buttons = list.current?.querySelectorAll(`[data-photo="${imageId}"] [data-move]`)
      const preferred = [...(buttons ?? [])].find((b) => b.dataset.move === direction && b.getAttribute('aria-disabled') !== 'true')
      ;(preferred ?? buttons?.[direction === 'earlier' ? 1 : 0])?.focus()
    })
  }

  const hasFiles = (event) => [...event.dataTransfer.types].includes('Files')

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="text-[16px] font-semibold text-ink-strong">{category.label}</h3>
        {zoneImages.length > 0 && <span className="text-[14px] tabular-nums text-muted-warm">{zoneImages.length} added</span>}
      </div>

      <div
        onDragOver={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOver(false)
        }}
        onDrop={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          setOver(false)
          handleFiles(event.dataTransfer.files)
        }}
        className={`rounded-2xl border-2 border-dashed p-3 transition-colors sm:p-4 ${over ? 'border-primary bg-blush' : 'border-outline-strong'}`}
      >
        {zoneImages.length > 0 && (
          <ul ref={list} className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`${title} photos`}>
            {zoneImages.map((image, index) => {
              const url = photos.url(image.imageId)
              const label = `${title} photo ${index + 1}`
              return (
                <li
                  key={image.imageId}
                  data-photo={image.imageId}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', image.imageId)
                    setDragging(image.imageId)
                  }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(event) => {
                    if (dragging) event.preventDefault()
                  }}
                  onDrop={(event) => {
                    if (!dragging) return
                    event.preventDefault()
                    event.stopPropagation()
                    moveTo(dragging, image.imageId)
                    setDragging(null)
                  }}
                  className={`flex cursor-grab flex-col gap-1.5 active:cursor-grabbing ${dragging === image.imageId ? 'opacity-50' : ''}`}
                >
                  <div
                    className={`group relative aspect-[4/3] overflow-hidden rounded-xl bg-surface ${image.isCover ? 'ring-2 ring-primary ring-offset-2' : ''} ${
                      image.upload?.status === 'rejected_ai' ? 'outline-2 outline-danger' : ''
                    }`}
                  >
                  {url ? (
                    <img src={url} alt={label} className="size-full object-cover" draggable={false} />
                  ) : (
                    <span className="flex size-full items-center justify-center p-3 text-center text-[13px] text-muted-warm">
                      {photos.isMissing(image.imageId) ? 'Photo not available on this device. Remove it and add it again.' : 'Loading…'}
                    </span>
                  )}
                  {image.isCover && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-strong shadow-chip">
                      <HostIcon name="star" className="size-3.5 text-gold" strokeWidth={2} />
                      Cover
                    </span>
                  )}
                  <div className="absolute bottom-2 left-2 flex gap-1">
                    {/* aria-disabled, not disabled, so focus isn't dropped when a photo reaches either end. */}
                    <button
                      type="button"
                      data-move="earlier"
                      className={iconButton}
                      onClick={() => index > 0 && move(image.imageId, zoneImages[index - 1].imageId, 'earlier', index)}
                      aria-disabled={index === 0}
                      aria-label={`Move ${label} earlier`}
                    >
                      <HostIcon name="chevron-left" className="size-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      data-move="later"
                      className={iconButton}
                      onClick={() => index < zoneImages.length - 1 && move(image.imageId, zoneImages[index + 1].imageId, 'later', index + 2)}
                      aria-disabled={index === zoneImages.length - 1}
                      aria-label={`Move ${label} later`}
                    >
                      <HostIcon name="chevron-right" className="size-4" strokeWidth={2} />
                    </button>
                  </div>
                  <div className="absolute right-2 top-2 flex gap-1">
                    {!image.isCover && (
                      <button type="button" className={iconButton} onClick={() => {
                          makeCover(image.imageId)
                          // The star button disappears on the new cover; keep focus on that photo.
                          requestAnimationFrame(() => list.current?.querySelector(`[data-photo="${image.imageId}"] [data-move]:not([aria-disabled="true"])`)?.focus())
                        }}
                        aria-label={`Make ${label} the cover photo`} title="Make cover photo">
                        <HostIcon name="star" className="size-4" strokeWidth={2} />
                      </button>
                    )}
                    <button type="button" className={iconButton} onClick={() => removeAndRefocus(image.imageId)} aria-label={`Remove ${label}`} title="Remove">
                      <HostIcon name="trash" className="size-4" strokeWidth={2} />
                    </button>
                  </div>
                  </div>
                  <CheckCaption image={image} checking={checking.has(image.imageId)} retry={retry} label={label} />
                </li>
              )
            })}
          </ul>
        )}

        <div className={`flex flex-col items-center gap-2 text-center ${zoneImages.length ? 'py-2' : 'py-6'}`}>
          <HostIcon name="image-plus" className="size-7 text-muted-warm" />
          {/* Hidden input; the button below opens it so keyboard focus is visible on a real button. */}
          <input
            ref={input}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            multiple
            hidden
            onChange={(event) => {
              handleFiles(event.target.files)
              event.target.value = '' // pick the same file again after removing it
            }}
          />
          <button
            ref={uploadButton}
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-ink-strong px-5 text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {zoneImages.length ? 'Add more' : 'Upload photos'}
            <span className="sr-only"> of {title}</span>
          </button>
          <p className="text-[14px] text-muted-warm">or drag them here</p>
        </div>
      </div>

      <div aria-live="polite">
        {message.text && <p className="mt-2 text-[14px] text-success">{message.text}</p>}
        {message.errors.map((error) => (
          <ErrorText key={error}>{error}</ErrorText>
        ))}
      </div>
    </div>
  )
}
