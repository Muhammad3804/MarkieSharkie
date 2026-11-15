import { lazy, Suspense } from 'react'
import VenueDetailSkeleton from '../components/venue/VenueDetailSkeleton.jsx'

// Split the venue pages into their own chunks; the skeleton shows while they download.
const VenueDetail = lazy(() => import('../pages/VenueDetail.jsx'))
const VenuePhotos = lazy(() => import('../pages/VenuePhotos.jsx'))

export default function VenueDetailRoute() {
  return (
    <Suspense fallback={<VenueDetailSkeleton />}>
      <VenueDetail />
    </Suspense>
  )
}

export function VenuePhotosRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading photos" className="min-h-[60vh]" />}>
      <VenuePhotos />
    </Suspense>
  )
}
