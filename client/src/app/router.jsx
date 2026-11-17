import { createBrowserRouter } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import VenueDetailRoute, { AboutRoute, BookingFlowRoute, ExploreRoute, MyBookingsRoute, HostIntroRoute, HostSubmittedRoute, HostWizardRoute, VenuePhotosRoute } from './VenueDetailRoute.jsx'
import Landing from '../pages/Landing.jsx'
import SearchRedirect from './SearchRedirect.jsx'
import HostResumeRedirect from './HostResumeRedirect.jsx'
import { AdminPageRoute, AdminShellRoute } from './adminRoutes.jsx'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/explore', element: <ExploreRoute /> },
      { path: '/search', element: <SearchRedirect /> },
      { path: '/about', element: <AboutRoute /> },
      { path: '/venues/:id', element: <VenueDetailRoute /> },
      { path: '/venues/:id/photos', element: <VenuePhotosRoute /> },
      { path: '/host', element: <HostIntroRoute /> },
      { path: '/host/submitted', element: <HostSubmittedRoute /> },
      // TODO(auth): customer only (moves into /app with accounts).
      { path: '/bookings', element: <MyBookingsRoute /> },
    ],
  },
  // Booking flow, own full-screen shell like the host wizard. TODO(auth): customer only, see pages/BookingFlow.jsx.
  { path: '/venues/:id/book/:step', element: <BookingFlowRoute /> },
  // The listing wizard has its own full-screen shell (no site header, footer or chat).
  // TODO(auth): venue_owner only, see pages/HostWizard.jsx.
  { path: '/host/new', element: <HostResumeRedirect /> },
  { path: '/host/new/:step', element: <HostWizardRoute /> },
  // Admin dashboard, own shell. TODO(auth): RequireRole('admin'), see app/adminRoutes.jsx.
  {
    path: '/admin',
    element: <AdminShellRoute />,
    children: [
      { index: true, element: <AdminPageRoute page="overview" /> },
      { path: 'approvals', element: <AdminPageRoute page="approvals" /> },
      { path: 'approvals/:id', element: <AdminPageRoute page="review" /> },
      { path: 'images', element: <AdminPageRoute page="images" /> },
      { path: 'venues', element: <AdminPageRoute page="venues" /> },
      { path: 'users', element: <AdminPageRoute page="users" /> },
      { path: 'reports', element: <AdminPageRoute page="reports" /> },
      { path: 'audit', element: <AdminPageRoute page="audit" /> },
      { path: 'settings', element: <AdminPageRoute page="settings" /> },
    ],
  },
])
