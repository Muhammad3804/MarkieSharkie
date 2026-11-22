import { lazy, Suspense, useState } from 'react'
import Avatar from './Avatar.jsx'
import StarRow from './StarRow.jsx'
import { EVENT_LABELS } from '../../features/venues/constants.js'
import { timeAgo } from '../../lib/format.js'
import { useAuth, useRequireAuth } from '../../features/auth/authContext.js'

const ReportReviewDialog = lazy(() => import('./ReportReviewDialog.jsx'))

// One review (Figma 46:178). Rating, comment and created_at come from the reviews table. "Report" (REQ-44) asks a
// signed-out visitor to log in first; admins moderate from the dashboard instead, so they don't get the button.
export default function ReviewCard({ review }) {
  const { user } = useAuth()
  const requireAuth = useRequireAuth()
  const [reporting, setReporting] = useState(false)
  const [loaded, setLoaded] = useState(false) // keep the dialog mounted once opened, so closing returns focus
  const [notice, setNotice] = useState('')
  const canReport = user?.role !== 'admin' && review.venueId
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
      {canReport && (
        <div className="flex min-h-6 flex-wrap items-center gap-3">
          {!notice && (
            <button
              type="button"
              onClick={() =>
                requireAuth('report', () => {
                  setLoaded(true)
                  setReporting(true)
                })
              }
              className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-1 text-[12px] font-medium text-muted-warm underline underline-offset-4 hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-primary"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
              </svg>
              Report<span className="sr-only"> the review by {review.customerName}</span>
            </button>
          )}
          <p aria-live="polite" className="text-[12px] text-muted-warm">
            {notice}
          </p>
        </div>
      )}
      {loaded && (
        <Suspense fallback={null}>
          <ReportReviewDialog review={review} open={reporting} onClose={() => setReporting(false)} onSent={setNotice} />
        </Suspense>
      )}
    </article>
  )
}
