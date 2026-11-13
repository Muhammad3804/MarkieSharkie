import Avatar from './Avatar.jsx'
import StarRow from './StarRow.jsx'
import { EVENT_LABELS } from '../../features/venues/constants.js'
import { timeAgo } from '../../lib/format.js'

// One review (Figma 46:178). Rating, comment and created_at come from the reviews table.
export default function ReviewCard({ review }) {
  return (
    <article className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={review.customerName} />
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[14px] font-semibold text-ink-strong">{review.customerName}</h3>
          <p className="text-[12px] text-muted-warm">{review.customerCity}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StarRow rating={review.rating} />
        <p className="text-[12px] text-muted-warm">
          <time dateTime={review.createdAt}>{timeAgo(review.createdAt)}</time> · {EVENT_LABELS[review.eventType]}
        </p>
      </div>
      <p className="text-[13px] leading-[1.5] text-muted-warm">{review.comment}</p>
    </article>
  )
}
