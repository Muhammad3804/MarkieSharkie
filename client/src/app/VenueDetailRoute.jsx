import { lazy, Suspense } from 'react'
import VenueDetailSkeleton from '../components/venue/VenueDetailSkeleton.jsx'

// Split the venue page into its own chunk; the skeleton shows while it downloads.
const VenueDetail = lazy(() => import('../pages/VenueDetail.jsx'))

export default function VenueDetailRoute() {
  return (
    <Suspense fallback={<VenueDetailSkeleton />}>
      <VenueDetail />
    </Suspense>
  )
}
