import { lazy, Suspense, useState } from 'react'

// One hall (Figma 65:1240), also used for the bridal suite. Size, layout and walkthrough are UI-only (the halls
// table has name + capacity only, see mockVenues.js); the host wizard collects them.
const HallModel3D = lazy(() => import('../../features/venues/HallModel3D.jsx'))

// Same grid as the wizard's layout step: cells 0-8, row 0 = back wall.
const ZONE_LABELS = { stage: 'Stage', entrance: 'Entrance', seating: 'Seating' }

export default function HallCard({ hall }) {
  const [show3d, setShow3d] = useState(false)
  const area = hall.lengthFt && hall.widthFt ? hall.lengthFt * hall.widthFt : null
  const zones = Object.entries(hall.zones ?? {}).filter(([key, cell]) => cell != null && ZONE_LABELS[key])
  const walkthrough = hall.walkthrough?.mode
  const tourUrl = walkthrough === 'link' && isHttps(hall.walkthrough.url) ? hall.walkthrough.url : null
  const can3d = walkthrough === 'generate' && area && hall.ceilingFt

  return (
    <article aria-labelledby={`${hall.hallId}-name`} className="flex flex-col gap-4 rounded-[16px] border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 id={`${hall.hallId}-name`} className="font-heading text-[18px] font-semibold text-ink-strong">{hall.name}</h3>
          <p className="text-[13px] text-muted-warm">
            {hall.capacity.toLocaleString('en-US')} seated · {hall.standingCapacity.toLocaleString('en-US')} standing
          </p>
        </div>
        {area && (
          <p className="flex shrink-0 flex-col items-end gap-1 text-right font-semibold">
            <span className="text-[11px] text-muted-warm">Dimensions</span>
            <span className="font-heading text-[18px] text-ink-strong">
              {hall.lengthFt} × {hall.widthFt} ft
            </span>
            <span className="text-[12px] font-normal tabular-nums text-muted-warm">
              {area.toLocaleString('en-US')} sq ft{hall.ceilingFt ? ` · ${hall.ceilingFt} ft ceiling` : ''}
            </span>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
        {hall.floorPlanUrl && hall.floorPlanType !== 'pdf' ? (
          // w-fit: the box is exactly the image, so the zone grid lines up with the plan.
          <div className="relative mx-auto w-fit max-w-full">
            <img
              src={hall.floorPlanUrl}
              alt={`Floor plan of ${hall.name}${zones.length ? `: ${zones.map(([key, cell]) => `${ZONE_LABELS[key].toLowerCase()} at the ${cellName(cell)}`).join(', ')}` : ''}`}
              width="1024"
              height="559"
              loading="lazy"
              decoding="async"
              className="block h-auto max-h-[359px] w-auto max-w-full"
            />
            {/* Zone badges over the plan; the image's alt text carries the same information. */}
            {zones.length > 0 && (
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
                {Array.from({ length: 9 }, (_, cell) => (
                  <span key={cell} className="flex items-center justify-center">
                    {zones
                      .filter(([, c]) => c === cell)
                      .map(([key]) => (
                        <span key={key} className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white shadow-chip">
                          {ZONE_LABELS[key]}
                        </span>
                      ))}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : hall.floorPlanUrl ? (
          <a
            href={hall.floorPlanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center p-6 text-[14px] font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
          >
            Open the floor plan (PDF)<span className="sr-only"> for {hall.name}, opens in a new tab</span>
          </a>
        ) : hall.areas ? (
          <ul aria-label={`${hall.name} layout`} className="grid w-fit grid-cols-3 gap-x-3 gap-y-2.5 p-[23px]">
            {hall.areas.map((zone) => (
              <li key={zone} className="flex w-[72px] flex-col items-center gap-1 text-center text-[11px] font-semibold text-ink-strong">
                <span aria-hidden className="size-[72px] rounded-[8px] border border-ink-strong/10 bg-ink-strong/[0.08]" />
                {zone}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-center text-[13px] text-muted-warm">No floor plan yet.</p>
        )}
      </div>

      <p className="text-[13px] leading-[1.45] text-muted-warm">{hall.description}</p>

      {can3d &&
        (show3d ? (
          <div className="flex flex-col gap-2">
            <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" aria-label="Loading the 3D model" />}>
              <HallModel3D name={hall.name} lengthFt={hall.lengthFt} widthFt={hall.widthFt} ceilingFt={hall.ceilingFt} zones={hall.zones} className="h-[300px]" />
            </Suspense>
            {/* Closing frees the WebGL context (browsers allow only ~16 at once). */}
            <button
              type="button"
              onClick={() => setShow3d(false)}
              className="w-fit cursor-pointer rounded-md px-1 text-[14px] font-medium text-ink underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              Close 3D view<span className="sr-only"> of {hall.name}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShow3d(true)}
            className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-ink-strong px-5 text-[14px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            View in 3D<span className="sr-only">: {hall.name}</span>
          </button>
        ))}
      {tourUrl && (
        <a
          href={tourUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-fit items-center rounded-full border border-ink-strong px-5 text-[14px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Open the 360° tour<span className="sr-only"> of {hall.name}, opens in a new tab</span>
        </a>
      )}
    </article>
  )
}

const CELL_NAMES = ['back left', 'back centre', 'back right', 'middle left', 'middle centre', 'middle right', 'front left', 'front centre', 'front right']
const cellName = (cell) => CELL_NAMES[cell]

// Tour links come from hosts: only ever link to https.
function isHttps(url) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
