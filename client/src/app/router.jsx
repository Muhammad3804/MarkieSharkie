import { createBrowserRouter } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import VenueDetailRoute, { AboutRoute, ExploreRoute, HostIntroRoute, HostSubmittedRoute, HostWizardRoute, VenuePhotosRoute } from './VenueDetailRoute.jsx'
import Landing from '../pages/Landing.jsx'
import SearchRedirect from './SearchRedirect.jsx'
import HostResumeRedirect from './HostResumeRedirect.jsx'

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
    ],
  },
  // The listing wizard has its own full-screen shell (no site header, footer or chat).
  // TODO(auth): venue_owner only, see pages/HostWizard.jsx.
  { path: '/host/new', element: <HostResumeRedirect /> },
  { path: '/host/new/:step', element: <HostWizardRoute /> },
])
