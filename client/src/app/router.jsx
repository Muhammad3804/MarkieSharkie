import { createBrowserRouter, Outlet } from 'react-router-dom'
import AuthProvider from '../features/auth/AuthProvider.jsx'
import RequireAuth from '../features/auth/RequireAuth.jsx'
import RequireRole from '../features/auth/RequireRole.jsx'
import PublicLayout from './layouts/PublicLayout.jsx'
import VenueDetailRoute, { AboutRoute, BookingFlowRoute, ExploreRoute, GuestInvitationRoute, InvitationBuilderRoute, InvitationGuestsRoute, MyBookingsRoute, ProfileRoute, MyListingsRoute, ListingEditorRoute, OwnerBookingsRoute, HostIntroRoute, HostSubmittedRoute, HostWizardRoute, VenuePhotosRoute } from './VenueDetailRoute.jsx'
import Landing from '../pages/Landing.jsx'
import SearchRedirect from './SearchRedirect.jsx'
import HostResumeRedirect from './HostResumeRedirect.jsx'
import { AdminPageRoute, AdminShellRoute } from './adminRoutes.jsx'

export const router = createBrowserRouter([
  {
    // One session + login modal for every page (useAuth / useRequireAuth). Guards below are UI only; the server
    // checks the token on every request.
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
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
          // EUC-03 Manage Profile, every role (admins read-only).
          {
            path: '/me',
            element: (
              <RequireAuth intent="profile">
                <ProfileRoute />
              </RequireAuth>
            ),
          },
          // Venue owner's listings (EUC-04, EUC-07): status, edit a live venue, deactivate.
          {
            path: '/owner/listings',
            element: (
              <RequireRole role="venue_owner" intent="host">
                <MyListingsRoute />
              </RequireRole>
            ),
          },
          // EUC-15: the owner's booking inbox (confirm / decline requests).
          {
            path: '/owner/bookings',
            element: (
              <RequireRole role="venue_owner" intent="host">
                <OwnerBookingsRoute />
              </RequireRole>
            ),
          },
          {
            path: '/owner/listings/:id/edit/:section?',
            element: (
              <RequireRole role="venue_owner" intent="host">
                <ListingEditorRoute />
              </RequireRole>
            ),
          },
          // EUC-25 / EUC-27: the host's event page, guest list and replies (the booking's customer only).
          {
            path: '/bookings/:id/guests',
            element: (
              <RequireAuth intent="invitation">
                <InvitationGuestsRoute />
              </RequireAuth>
            ),
          },
          // Customer's own bookings (moves into /app with role dashboards).
          {
            path: '/bookings',
            element: (
              <RequireAuth intent="bookings">
                <MyBookingsRoute />
              </RequireAuth>
            ),
          },
        ],
      },
      // Booking flow, own full-screen shell like the host wizard. Logged-in only.
      {
        path: '/venues/:id/book/:step',
        element: (
          <RequireAuth intent="booking" fullScreen>
            <BookingFlowRoute />
          </RequireAuth>
        ),
      },
      // QR invitation builder, own shell. Confirmed bookings only (REQ-36), the customer's own.
      {
        path: '/bookings/:id/invite/:step?',
        element: (
          <RequireAuth intent="invitation" fullScreen>
            <InvitationBuilderRoute />
          </RequireAuth>
        ),
      },
      // Guest invitation: public, no account, no site chrome (REQ-38).
      { path: '/i/:token', element: <GuestInvitationRoute /> },
      // The listing wizard has its own full-screen shell (no site header, footer or chat).
      // Logged-in only. TODO(auth): venue_owner role once accounts have roles, see pages/HostWizard.jsx.
      {
        path: '/host/new',
        element: (
          <RequireAuth intent="host" fullScreen>
            <HostResumeRedirect />
          </RequireAuth>
        ),
      },
      {
        path: '/host/new/:step',
        element: (
          <RequireAuth intent="host" fullScreen>
            <HostWizardRoute />
          </RequireAuth>
        ),
      },
      // Admin dashboard, own shell. Admins only (REQ-3): signed out -> log in card, other roles -> 403.
      {
        path: '/admin',
        element: (
          <RequireRole role="admin" intent="admin" fullScreen>
            <AdminShellRoute />
          </RequireRole>
        ),
        children: [
          { index: true, element: <AdminPageRoute page="overview" /> },
          { path: 'approvals', element: <AdminPageRoute page="approvals" /> },
          { path: 'approvals/:id', element: <AdminPageRoute page="review" /> },
          { path: 'edits', element: <AdminPageRoute page="edits" /> },
          { path: 'edits/:id', element: <AdminPageRoute page="editReview" /> },
          { path: 'reviews', element: <AdminPageRoute page="reviews" /> },
          { path: 'images', element: <AdminPageRoute page="images" /> },
          { path: 'venues', element: <AdminPageRoute page="venues" /> },
          { path: 'users', element: <AdminPageRoute page="users" /> },
          { path: 'reports', element: <AdminPageRoute page="reports" /> },
          { path: 'audit', element: <AdminPageRoute page="audit" /> },
          { path: 'settings', element: <AdminPageRoute page="settings" /> },
        ],
      },
    ],
  },
])
