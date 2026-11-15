// One hall (Figma 65:1240). Halls are UI-only: the ERD has no halls table (see mockVenues.js).
export default function HallCard({ hall }) {
  return (
    <article aria-labelledby={`${hall.hallId}-name`} className="flex flex-col gap-4 rounded-[16px] border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 id={`${hall.hallId}-name`} className="font-heading text-[18px] font-semibold text-ink-strong">{hall.name}</h3>
          <p className="text-[13px] text-muted-warm">
            {hall.capacity.toLocaleString('en-US')} seated · {hall.standingCapacity.toLocaleString('en-US')} standing
          </p>
        </div>
        <p className="flex shrink-0 flex-col items-end gap-1 font-semibold">
          <span className="text-[11px] text-muted-warm">Dimensions</span>
          <span className="font-heading text-[18px] text-ink-strong">
            {hall.widthM} × {hall.lengthM} m
          </span>
        </p>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
        {hall.floorPlanUrl ? (
          <img
            src={hall.floorPlanUrl}
            alt={`Floor plan of ${hall.name}`}
            width="1024"
            height="559"
            loading="lazy"
            decoding="async"
            className="mx-auto h-auto max-h-[359px] w-full max-w-[658px] object-contain"
          />
        ) : (
          <ul aria-label={`${hall.name} layout`} className="grid w-fit grid-cols-3 gap-x-3 gap-y-2.5 p-[23px]">
            {hall.zones.map((zone) => (
              <li key={zone} className="flex w-[72px] flex-col items-center gap-1 text-center text-[11px] font-semibold text-ink-strong">
                <span aria-hidden className="size-[72px] rounded-[8px] border border-ink-strong/10 bg-ink-strong/[0.08]" />
                {zone}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[13px] leading-[1.45] text-muted-warm">{hall.description}</p>
    </article>
  )
}
