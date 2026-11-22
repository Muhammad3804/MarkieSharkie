import { lazy, Suspense, useRef, useState } from 'react'
import { useWizard } from '../WizardContext.js'
import { ChoiceCard, ErrorText, StepHeading, TextField } from '../fields.jsx'
import { FLOOR_PLAN_MAX_BYTES, FLOOR_PLAN_TYPES, LAYOUT_CELLS, LAYOUT_ZONES, WALKTHROUGH_FILES, WALKTHROUGH_MODES } from '../options.js'
import { hallArea, newId } from '../draft.js'
import { deletePhotos, savePhoto, usePhotoUrls } from '../photoStore.js'
import HostIcon from '../icons.jsx'

// Phase 2, per hall: the 2D layout (floor plan + zones) and the 3D walkthrough. Files are kept in IndexedDB like
// photos (photoStore.js) until the upload API exists.
const HallModel3D = lazy(() => import('../../venues/HallModel3D.jsx'))

const secondaryButton =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-ink-strong px-5 text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const linkButton =
  'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[14px] font-medium text-ink underline underline-offset-4 hover:text-danger focus-visible:outline-2 focus-visible:outline-primary'

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)
const sizeLine = (hall) => (hallArea(hall) ? `${hall.lengthFt} × ${hall.widthFt} ft · ${hallArea(hall).toLocaleString('en-US')} sq ft · ${hall.ceilingFt} ft ceiling` : '')

function useSetHall() {
  const { update } = useWizard()
  return (hallId, patch) =>
    update((current) => ({ ...current, halls: current.halls.map((hall) => (hall.hallId === hallId ? { ...hall, ...(typeof patch === 'function' ? patch(hall) : patch) } : hall)) }))
}

export function LayoutStep() {
  const { draft } = useWizard()
  return (
    <>
      <StepHeading
        title="Show customers the layout"
        subtitle="Optional. Add a floor plan for each hall and mark where the stage, entrance and seating are. Customers see it on your listing and in the 3D model."
      />
      <div className="grid gap-10">
        {draft.halls.map((hall, index) => (
          <HallLayout key={hall.hallId} hall={hall} index={index} />
        ))}
      </div>
    </>
  )
}

function HallLayout({ hall, index }) {
  const { errorFor } = useWizard()
  const setHall = useSetHall()
  const input = useRef(null)
  const [error, setError] = useState('')
  const files = usePhotoUrls(hall.floorPlan ? [hall.floorPlan.fileId] : [])
  const planUrl = hall.floorPlan && hall.floorPlan.type !== 'application/pdf' ? files.url(hall.floorPlan.fileId) : null
  const name = hall.name.trim() || `Hall ${index + 1}`

  async function choose(file) {
    if (!file) return
    if (!FLOOR_PLAN_TYPES.includes(file.type)) return setError(`“${file.name}” isn’t a JPEG, PNG or PDF.`)
    if (file.size > FLOOR_PLAN_MAX_BYTES) return setError(`“${file.name}” is over 10 MB.`)
    setError('')
    const fileId = newId()
    // Read the file being replaced from the latest draft, not this render (two quick replaces).
    let previous = null
    setHall(hall.hallId, (h) => {
      previous = h.floorPlan?.fileId
      return { floorPlan: { fileId, fileName: file.name, type: file.type, size: file.size } }
    })
    if (previous) deletePhotos([previous])
    const stored = await savePhoto(fileId, file)
    if (!stored) setError('This browser isn’t letting us save files, so the plan will be lost if you refresh.')
  }

  function removePlan() {
    deletePhotos([hall.floorPlan.fileId])
    setHall(hall.hallId, { floorPlan: null })
  }

  return (
    <section aria-labelledby={`layout-${hall.hallId}`} className="rounded-3xl border border-line p-5 sm:p-7">
      <h2 id={`layout-${hall.hallId}`} className="font-heading text-[22px] font-semibold text-ink-strong">
        {name}
      </h2>
      {sizeLine(hall) && <p className="mt-1 text-[14px] text-muted-warm">{sizeLine(hall)}</p>}

      <h3 className="mb-3 mt-6 text-[16px] font-semibold text-ink-strong">Floor plan</h3>
      <PlanPreview hall={hall} name={name} imageUrl={planUrl} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept={FLOOR_PLAN_TYPES.join(',')}
          hidden
          onChange={(event) => {
            choose(event.target.files[0])
            event.target.value = ''
          }}
        />
        <button type="button" className={secondaryButton} onClick={() => input.current?.click()}>
          <HostIcon name="file-check" className="size-5" />
          {hall.floorPlan ? 'Replace plan' : 'Upload floor plan'}
          <span className="sr-only"> for {name}</span>
        </button>
        {hall.floorPlan && (
          <>
            <span className="min-w-0 truncate text-[14px] text-muted-warm">
              {hall.floorPlan.fileName} · {formatSize(hall.floorPlan.size)}
            </span>
            <button type="button" className={linkButton} onClick={removePlan}>
              Remove<span className="sr-only"> floor plan for {name}</span>
            </button>
          </>
        )}
      </div>
      <p className="mt-2 text-[14px] text-muted-warm">JPEG, PNG or PDF, up to 10 MB.</p>
      <div aria-live="polite">
        <ErrorText>{error}</ErrorText>
      </div>

      <h3 className="mb-1 mt-8 text-[16px] font-semibold text-ink-strong">Mark the zones</h3>
      <p className="mb-4 text-[14px] text-muted-warm">Optional. Pick a spot for each, as you face the back wall from the entrance.</p>
      <div className="grid gap-6 md:grid-cols-3">
        {LAYOUT_ZONES.map((zone) => (
          <ZonePicker
            key={zone.key}
            hall={hall}
            zone={zone}
            error={errorFor(`halls.${index}.zones.${zone.key}`)}
            errorId={`field-halls-${index}-zones-${zone.key}-error`}
            onChange={(cell) => setHall(hall.hallId, (h) => ({ zones: { ...h.zones, [zone.key]: cell } }))}
          />
        ))}
      </div>
    </section>
  )
}

// The plan (or a blank room shaped like the hall) with the marked zones on top.
function PlanPreview({ hall, name, imageUrl }) {
  // Width across, length from back (top) to front. Clamped to a landscape box so a long hall doesn't fill the screen.
  const ratio = hallArea(hall) ? Math.min(2.4, Math.max(1.25, Number(hall.widthFt) / Number(hall.lengthFt))) : 16 / 9
  const markers = LAYOUT_ZONES.filter((zone) => hall.zones[zone.key] != null)
  const isPdf = hall.floorPlan?.type === 'application/pdf'
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface" style={imageUrl ? undefined : { aspectRatio: ratio }}>
      {imageUrl ? (
        // The image box is exactly the image (no letterboxing), so the zone grid below lines up with the plan.
        <div className="relative mx-auto w-fit">
          <img src={imageUrl} alt={`Floor plan of ${name}`} className="block h-auto max-h-[420px] w-auto max-w-full" />
          <ZoneBadges hall={hall} markers={markers} />
        </div>
      ) : (
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
          {LAYOUT_CELLS.map((cell) => (
            <span key={cell} className="border border-dashed border-line" />
          ))}
        </div>
      )}
      {!imageUrl && (
        <p className="absolute inset-x-0 top-2 text-center text-[12px] font-medium uppercase tracking-wide text-muted-warm">
          {isPdf ? `PDF plan: ${hall.floorPlan.fileName}` : 'Back wall'}
        </p>
      )}
      {!imageUrl && <ZoneBadges hall={hall} markers={markers} />}
    </div>
  )
}

// Markers over the plan: decorative, the pickers below carry the same information.
function ZoneBadges({ hall, markers }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
      {LAYOUT_CELLS.map((cell, cellIndex) => (
        <span key={cell} className="flex flex-wrap items-center justify-center gap-1 p-1">
          {markers
            .filter((zone) => hall.zones[zone.key] === cellIndex)
            .map((zone) => (
              <span key={zone.key} className="rounded-full bg-primary px-2.5 py-1 text-[12px] font-semibold text-white shadow-chip">
                {zone.label}
              </span>
            ))}
        </span>
      ))}
    </div>
  )
}

function ZonePicker({ hall, zone, error, errorId, onChange }) {
  const current = hall.zones[zone.key]
  const name = `zone-${hall.hallId}-${zone.key}`
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 text-[15px] font-medium text-ink-strong">
        {zone.label}
        <span className="ml-2 font-normal text-muted-warm">{current == null ? 'Not marked' : LAYOUT_CELLS[current]}</span>
      </legend>
      <div className="grid w-fit grid-cols-3 gap-1.5">
        {LAYOUT_CELLS.map((cell, cellIndex) => (
          <label
            key={cell}
            className={`flex size-11 cursor-pointer items-center justify-center rounded-lg border transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
              current === cellIndex ? 'border-primary bg-primary text-white' : 'border-outline-strong bg-white hover:border-ink-strong'
            }`}
          >
            <input type="radio" name={name} className="sr-only" checked={current === cellIndex} onChange={() => onChange(cellIndex)} />
            <span className="sr-only">{cell}</span>
            {current === cellIndex && <HostIcon name="check" className="size-4" strokeWidth={2.5} />}
          </label>
        ))}
      </div>
      <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 text-[14px] text-ink">
        <input type="radio" name={name} checked={current == null} onChange={() => onChange(null)} className="size-4 cursor-pointer accent-primary" />
        Not marked
      </label>
      <ErrorText id={errorId}>{error}</ErrorText>
    </fieldset>
  )
}

export function WalkthroughStep() {
  const { draft } = useWizard()
  return (
    <>
      <StepHeading
        title="Add a 3D walkthrough"
        subtitle="Let customers look around each hall before they visit. Generate one from your measurements, upload your own, or skip for now."
      />
      <div className="grid gap-10">
        {draft.halls.map((hall, index) => (
          <HallWalkthrough key={hall.hallId} hall={hall} index={index} openByDefault={index === 0} />
        ))}
      </div>
    </>
  )
}

function HallWalkthrough({ hall, index, openByDefault }) {
  const { errorFor } = useWizard()
  const setHall = useSetHall()
  const input = useRef(null)
  const [fileError, setFileError] = useState('')
  const [showModel, setShowModel] = useState(openByDefault)
  const { mode, file, url } = hall.walkthrough
  const name = hall.name.trim() || `Hall ${index + 1}`
  const setWalkthrough = (patch) => setHall(hall.hallId, (h) => ({ walkthrough: { ...h.walkthrough, ...patch } }))
  const modeError = errorFor(`halls.${index}.walkthrough.mode`)
  const fileErrorFromStep = errorFor(`halls.${index}.walkthrough.file`)

  async function choose(picked) {
    if (!picked) return
    const lower = picked.name.toLowerCase()
    const kind = WALKTHROUGH_FILES.find((k) => k.extensions.some((ext) => lower.endsWith(ext)))
    if (!kind) return setFileError(`“${picked.name}” isn’t a .glb 3D model or a .jpg 360° photo.`)
    if (picked.size > kind.maxBytes) return setFileError(`“${picked.name}” is over ${kind.maxBytes / 1024 / 1024} MB.`)
    setFileError('')
    const fileId = newId()
    let previous = null
    setHall(hall.hallId, (h) => {
      previous = h.walkthrough.file?.fileId
      return { walkthrough: { ...h.walkthrough, file: { fileId, fileName: picked.name, assetType: kind.assetType, size: picked.size } } }
    })
    if (previous) deletePhotos([previous])
    const stored = await savePhoto(fileId, picked)
    if (!stored) setFileError('This browser isn’t letting us save files, so the upload will be lost if you refresh.')
  }

  return (
    <section aria-labelledby={`walkthrough-${hall.hallId}`} className="rounded-3xl border border-line p-5 sm:p-7">
      <h2 id={`walkthrough-${hall.hallId}`} className="font-heading text-[22px] font-semibold text-ink-strong">
        {name}
      </h2>
      {sizeLine(hall) && <p className="mt-1 text-[14px] text-muted-warm">{sizeLine(hall)}</p>}

      <fieldset className="mt-5" aria-describedby={modeError ? `field-halls-${index}-walkthrough-mode-error` : undefined}>
        <legend className="sr-only">3D walkthrough for {name}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {WALKTHROUGH_MODES.map((option) => (
            <ChoiceCard
              key={option.value}
              name={`walkthrough-${hall.hallId}`}
              value={option.value}
              label={option.label}
              description={option.description}
              checked={mode === option.value}
              onChange={() => {
                setWalkthrough({ mode: option.value })
                setFileError('')
              }}
              className="pr-10"
            />
          ))}
        </div>
      </fieldset>
      <ErrorText id={`field-halls-${index}-walkthrough-mode-error`}>{modeError}</ErrorText>

      <div className="mt-6">
        {mode === 'generate' &&
          (showModel ? (
            <Suspense fallback={<div className="h-[320px] animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" aria-label="Loading the 3D model" />}>
              <HallModel3D name={name} lengthFt={hall.lengthFt} widthFt={hall.widthFt} ceilingFt={hall.ceilingFt} zones={hall.zones} />
            </Suspense>
          ) : (
            <button type="button" className={secondaryButton} onClick={() => setShowModel(true)}>
              Preview the 3D model<span className="sr-only"> of {name}</span>
            </button>
          ))}

        {mode === 'upload' && (
          <div>
            <input
              ref={input}
              type="file"
              accept=".glb,.jpg,.jpeg"
              hidden
              onChange={(event) => {
                choose(event.target.files[0])
                event.target.value = ''
              }}
            />
            {file ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4">
                <HostIcon name="file-check" className="size-6 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink-strong">{file.fileName}</p>
                  <p className="text-[14px] text-muted-warm">
                    {file.assetType === 'model_3d' ? '3D model' : '360° photo'} · {formatSize(file.size)} · checked by our team before it goes live
                  </p>
                </div>
                <button type="button" className={linkButton} onClick={() => input.current?.click()}>
                  Replace<span className="sr-only"> walkthrough file for {name}</span>
                </button>
              </div>
            ) : (
              <button type="button" className={secondaryButton} onClick={() => input.current?.click()}>
                <HostIcon name="image-plus" className="size-5" />
                Choose a file<span className="sr-only"> for {name}</span>
              </button>
            )}
            <div aria-live="polite">
              <ErrorText id={`field-halls-${index}-walkthrough-file-error`}>{fileError || fileErrorFromStep}</ErrorText>
            </div>
          </div>
        )}

        {mode === 'link' && (
          <TextField
            path={`halls.${index}.walkthrough.url`}
            label="Tour link"
            type="url"
            inputMode="url"
            spellCheck={false}
            value={url}
            onChange={(next) => setWalkthrough({ url: next })}
            placeholder="https://my.matterport.com/show/?m=…"
            hint="Customers open it in a new tab."
          />
        )}

        {mode === 'skip' && <p className="text-[15px] text-muted-warm">Customers will see your photos. You can add a walkthrough later from your dashboard.</p>}
      </div>
    </section>
  )
}
