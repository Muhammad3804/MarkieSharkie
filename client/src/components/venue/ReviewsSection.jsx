import { useMemo, useState } from 'react'
import { getVenueReviews } from '../../api/venues.js'
import GoogleReviewsLink from './GoogleReviewsLink.jsx'
import ReviewCard from './ReviewCard.jsx'
import starOutlineIcon from '../../assets/icons/venue/star-outline.svg'
import sparklesIcon from '../../assets/icons/venue/sparkles-sm.svg'
import checkCircleIcon from '../../assets/icons/venue/check-circle.svg'
import keyIcon from '../../assets/icons/venue/key.svg'
import messageCircleIcon from '../../assets/icons/venue/message-circle.svg'
import mapIcon from '../../assets/icons/venue/map.svg'
import tagIcon from '../../assets/icons/venue/tag.svg'

const CATEGORY_ICONS = { Cleanliness: sparklesIcon, Accuracy: checkCircleIcon, 'Check-in': keyIcon, Communication: messageCircleIcon, Location: mapIcon, Value: tagIcon }

// Reviews (Figma 46:126). The overall rating and the 5→1 breakdown come from the reviews table;
// the six category scores are UI-only (not in the ERD, see mockVenues.js). The full list (no `limit`) loads more pages
// from GET /api/venues/:id/reviews. "Read reviews on Google" is only a link (srs-alignment #37).
const PAGE_SIZE = 10

export default function ReviewsSection({ venue, limit, onShowAll }) {
  const [more, setMore] = useState({ reviews: [], page: 1, status: 'idle' })
  const breakdown = useMemo(() => {
    const max = Math.max(1, ...Object.values(venue.ratingCounts))
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = venue.ratingCounts[stars]
      return { stars, count, width: Math.max(2, Math.round((90 * count) / max)), strong: venue.reviewCount > 0 && count / venue.reviewCount >= 0.1 }
    })
  }, [venue.ratingCounts, venue.reviewCount])
  // The venue response carries the newest 20; the reviews API pages through the rest.
  const all = useMemo(() => {
    const seen = new Set(venue.reviews.map((r) => r.reviewId))
    return [...venue.reviews, ...more.reviews.filter((r) => !seen.has(r.reviewId))]
  }, [venue.reviews, more.reviews])
  const shown = limit ? all.slice(0, limit) : all

  async function loadMore() {
    setMore((m) => ({ ...m, status: 'loading' }))
    try {
      // Pages of 10 after the ones already shown.
      const page = Math.floor(all.length / PAGE_SIZE) + 1
      const data = await getVenueReviews(venue.id, { page, pageSize: PAGE_SIZE })
      setMore((m) => ({ reviews: [...m.reviews, ...data.reviews], page, status: 'idle' }))
    } catch {
      setMore((m) => ({ ...m, status: 'error' }))
    }
  }

  if (venue.reviewCount === 0) {
    return (
      <section aria-labelledby="reviews-title" className="flex flex-col gap-2">
        <h2 id="reviews-title" className="font-heading text-[22px] font-bold text-ink-strong">No reviews yet</h2>
        <p className="text-[13px] text-muted-warm">Reviews appear here after hosts complete an event at this venue.</p>
        <GoogleReviewsLink url={venue.googleMapsUrl} venueName={venue.name} />
      </section>
    )
  }

  return (
    <section aria-labelledby="reviews-title" className="flex flex-col gap-6">
      <h2 id="reviews-title" className="font-heading flex items-center gap-2.5 text-[22px] font-bold text-ink-strong">
        <img src={starOutlineIcon} alt="" width="20" height="20" />
        {venue.avgRating.toFixed(2)} <span className="font-normal">·</span> {venue.reviewCount} reviews
      </h2>

      <div className="flex flex-wrap gap-y-6">
        <div className="flex w-[190px] flex-col gap-2">
          <p className="text-[12px] text-muted-warm">Overall rating</p>
          <ul className="flex flex-col gap-[3px]">
            {breakdown.map((row) => (
              <li key={row.stars} className="flex items-center gap-1 text-[11px] text-muted-warm">
                <span aria-hidden style={{ width: row.width }} className={`h-1 rounded-[2px] ${row.strong ? 'bg-ink-strong' : 'bg-outline-strong'}`} />
                {row.stars}
                <span className="sr-only">stars: {row.count} reviews</span>
              </li>
            ))}
          </ul>
        </div>
        {venue.ratingCategories.map((category) => (
          <div key={category.name} className="flex w-[120px] flex-col gap-1.5 data-[wide]:w-[155px]" data-wide={category.name === 'Communication' || undefined}>
            <p className="text-[12px] text-muted-warm">{category.name}</p>
            <p className="font-heading text-[15px] font-semibold text-ink-strong">{category.score}</p>
            <img src={CATEGORY_ICONS[category.name]} alt="" width="18" height="18" />
          </div>
        ))}
      </div>

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {shown.map((review) => (
          <ReviewCard key={review.reviewId} review={review} />
        ))}
      </div>

      {onShowAll ? (
        <button
          type="button"
          onClick={onShowAll}
          className="self-start rounded-[12px] border border-outline-strong px-4 py-[11px] text-[13px] font-semibold text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Show all {venue.reviewCount} reviews
        </button>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-muted-warm" aria-live="polite">
            Showing {shown.length} of {venue.reviewCount} reviews.
          </p>
          {shown.length < venue.reviewCount && (
            <button
              type="button"
              onClick={loadMore}
              disabled={more.status === 'loading'}
              className="min-h-11 cursor-pointer rounded-[12px] border border-outline-strong px-4 text-[13px] font-semibold text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60"
            >
              {more.status === 'loading' ? 'Loading…' : 'Show more reviews'}
            </button>
          )}
          {more.status === 'error' && (
            <p role="alert" className="text-[13px] text-danger">
              We couldn’t load more reviews. Try again.
            </p>
          )}
        </div>
      )}
      <GoogleReviewsLink url={venue.googleMapsUrl} venueName={venue.name} />
    </section>
  )
}
