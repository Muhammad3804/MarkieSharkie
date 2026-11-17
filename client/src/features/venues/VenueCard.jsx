import { memo } from 'react'
import { Link } from 'react-router-dom'
import { formatPKR } from '../../lib/format.js'
import WishlistButton from '../wishlist/WishlistButton.jsx'
import starIcon from '../../assets/icons/star.svg'

// `eager` is for cards visible without scrolling the row; the rest load when the row is scrolled.
// `fluid` fills a grid cell (Explore) instead of the fixed 400px row card (landing).
// `onActiveChange(id | null)` fires on hover and keyboard focus, so the Explore map can highlight the marker.
function VenueCard({ venue, eager = false, fluid = false, onActiveChange }) {
  const activate = onActiveChange && (() => onActiveChange(venue.id))
  const deactivate = onActiveChange && (() => onActiveChange(null))

  return (
    <article
      onMouseEnter={activate}
      onMouseLeave={deactivate}
      onFocus={activate}
      onBlur={deactivate}
      className={`relative rounded-[30px] bg-white shadow-card ${fluid ? 'w-full' : 'h-[475px] w-[85vw] max-w-[400px] shrink-0 snap-start sm:w-[400px]'}`}
    >
      <Link
        to={`/venues/${venue.id}`}
        className={`block rounded-[30px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${fluid ? 'pb-5' : 'h-full'}`}
      >
        <img
          src={venue.image}
          alt={venue.name}
          width="400"
          height="250"
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={`w-full rounded-[30px] bg-surface object-cover ${fluid ? 'aspect-[8/5] h-auto' : 'h-[250px]'}`}
        />

        <div className="mt-[18px] flex flex-col gap-[5px] px-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-[20px] font-semibold text-ink">{venue.name}</h3>
            <p className="flex shrink-0 items-center gap-[5px] text-[15px] text-ink">
              <img src={starIcon} alt="" width="16" height="16" />
              {venue.reviewCount === 0 ? (
                <span>New<span className="sr-only"> venue, no reviews yet</span></span>
              ) : (
                <span>
                  {venue.rating.toFixed(2)} <span className="sr-only">out of 5,</span>({venue.reviewCount}
                  <span className="sr-only"> reviews</span>)
                </span>
              )}
            </p>
          </div>
          <p className={`text-[15px] text-muted ${fluid ? 'truncate' : 'max-w-[299px]'}`}>
            {venue.area} - <span className="font-bold">{venue.city}</span>
          </p>
          <p className="text-[15px] text-muted">{venue.highlights}</p>
          <p className="text-[15px] text-muted">{venue.availableDates}</p>
          <p className="mt-[15px] text-[12px] text-muted">Starting From:</p>
          <p className="flex items-baseline gap-[10px]">
            <span className="text-[20px] font-semibold tabular-nums text-ink">{formatPKR(venue.priceFrom)}</span>
            <span className="text-[15px] text-muted">(Per Person)</span>
          </p>
        </div>
      </Link>
      <WishlistButton venueId={venue.id} venueName={venue.name} className="absolute right-4 top-4" />
    </article>
  )
}

export default memo(VenueCard)
