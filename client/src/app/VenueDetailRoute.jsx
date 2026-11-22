import { lazy, Suspense } from 'react'
import VenueDetailSkeleton from '../components/venue/VenueDetailSkeleton.jsx'

// Split the venue pages into their own chunks; the skeleton shows while they download.
const VenueDetail = lazy(() => import('../pages/VenueDetail.jsx'))
const VenuePhotos = lazy(() => import('../pages/VenuePhotos.jsx'))
const Explore = lazy(() => import('../pages/Explore.jsx'))
const About = lazy(() => import('../pages/About.jsx'))
const HostIntro = lazy(() => import('../pages/HostIntro.jsx'))
const HostWizard = lazy(() => import('../pages/HostWizard.jsx'))
const HostSubmitted = lazy(() => import('../pages/HostSubmitted.jsx'))
const BookingFlow = lazy(() => import('../pages/BookingFlow.jsx'))
const MyBookings = lazy(() => import('../pages/MyBookings.jsx'))
const Profile = lazy(() => import('../pages/Profile.jsx'))
const InvitationBuilder = lazy(() => import('../pages/InvitationBuilder.jsx'))
const GuestInvitation = lazy(() => import('../pages/GuestInvitation.jsx'))

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

export function HostIntroRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading page" className="min-h-[60vh]" />}>
      <HostIntro />
    </Suspense>
  )
}

export function HostWizardRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading your listing" className="min-h-dvh" />}>
      <HostWizard />
    </Suspense>
  )
}

export function HostSubmittedRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading page" className="min-h-[60vh]" />}>
      <HostSubmitted />
    </Suspense>
  )
}

export function BookingFlowRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading your booking" className="min-h-dvh" />}>
      <BookingFlow />
    </Suspense>
  )
}

export function MyBookingsRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading your bookings" className="min-h-[60vh]" />}>
      <MyBookings />
    </Suspense>
  )
}

export function ProfileRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading your profile" className="min-h-[60vh]" />}>
      <Profile />
    </Suspense>
  )
}

export function InvitationBuilderRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Loading your invitation" className="min-h-dvh" />}>
      <InvitationBuilder />
    </Suspense>
  )
}

export function GuestInvitationRoute() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Opening your invitation" className="min-h-dvh bg-surface" />}>
      <GuestInvitation />
    </Suspense>
  )
}
