import starIcon from '../../assets/icons/venue/star-filled.svg'

// Summary heading + stats strip (Figma 44:1047). `title`/`subtitle` override the heading on tabs that use it.
export default function ListingSummary({ venue, title, subtitle, showStats = true }) {
  const stats = [
    [venue.capacity.toLocaleString('en-US'), 'seated guests'],
    [venue.halls.length, 'event spaces'],
    [venue.parkingSpaces, 'parking spaces'],
    [`${venue.host.yearsHosting} yrs`, 'hosting events'],
  ]
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-[590px] flex-col gap-2">
          <h2 className="font-heading text-[22px] font-semibold text-ink-strong sm:text-[26px]">{title ?? `${venue.kindLabel} hosted by ${venue.name}`}</h2>
          <p className="text-[15px] text-muted-warm">{subtitle ?? `${venue.minGuests}–${venue.capacity} guests · ${venue.highlights}`}</p>
        </div>
        {showStats && (
          <p className="flex shrink-0 items-center gap-1.5">
            <img src={starIcon} alt="" width="17" height="17" />
            <span className="text-[15px] font-semibold text-ink-strong">{venue.avgRating.toFixed(2)}</span>
            <span className="text-[13px] text-muted-warm">· {venue.reviewCount} reviews</span>
          </p>
        )}
      </div>
      {showStats && (
        <ul className="grid grid-cols-2 gap-4 rounded-[12px] bg-surface px-5 py-[18px] sm:flex sm:items-center sm:justify-between">
          {stats.map(([value, label], index) => (
            <li key={label} className="flex items-center sm:gap-[clamp(1rem,7vw,6rem)]">
              {index > 0 && <span aria-hidden className="hidden h-[38px] w-px bg-line sm:block" />}
              <p className="flex flex-col gap-1">
                <span className="font-heading text-[18px] font-semibold text-ink-strong">{value}</span>
                <span className="text-[12px] text-muted-warm">{label}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
