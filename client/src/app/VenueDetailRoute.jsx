import { lazy, Suspense } from 'react'
import VenueDetailSkeleton from '../components/venue/VenueDetailSkeleton.jsx'

// Split the venue pages into their own chunks; the skeleton shows while they download.
const VenueDetail = lazy(() => import('../pages/VenueDetail.jsx'))
const VenuePhotos = lazy(() => import('../pages/VenuePhotos.jsx'))
const Explore = lazy(() => import('../pages/Explore.jsx'))
const About = lazy(() => import('../pages/About.jsx'))

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

export function ExploreRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading venues" className="min-h-[60vh]" />}>
      <Explore />
    </Suspense>
  )
}

export function AboutRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading page" className="min-h-[60vh]" />}>
      <About />
    </Suspense>
  )
}
