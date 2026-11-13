import { Link } from 'react-router-dom'
import { formatPKR } from '../../lib/format.js'
import starIcon from '../../assets/icons/star.svg'

export default function VenueCard({ venue }) {
  return (
    <Link
      to={`/venues/${venue.id}`}
      className="relative block h-[475px] w-[85vw] max-w-[400px] shrink-0 snap-start rounded-[30px] bg-white shadow-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:w-[400px]"
    >
      <img src={venue.image} alt={venue.name} loading="lazy" className="h-[250px] w-full rounded-[30px] object-cover" />

      <div className="mt-[18px] flex flex-col gap-[5px] px-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-[20px] font-semibold text-ink">{venue.name}</h3>
          <p className="flex shrink-0 items-center gap-[5px] text-[15px] text-ink">
            <img src={starIcon} alt="" width="16" height="16" />
            <span>
              {venue.rating.toFixed(2)} <span className="sr-only">out of 5,</span>({venue.reviewCount}
              <span className="sr-only"> reviews</span>)
            </span>
          </p>
        </div>
        <p className="max-w-[299px] text-[15px] text-muted">
          {venue.area} - <span className="font-bold">{venue.city}</span>
        </p>
        <p className="text-[15px] text-muted">{venue.highlights}</p>
        <p className="text-[15px] text-muted">{venue.availableDates}</p>
        <p className="mt-[15px] text-[12px] text-muted">Starting From:</p>
        <p className="flex items-baseline gap-[10px]">
          <span className="text-[20px] font-semibold text-ink">{formatPKR(venue.priceFrom)}</span>
          <span className="text-[15px] text-muted">(Per Person)</span>
        </p>
      </div>
    </Link>
  )
}
