import { createBrowserRouter } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import VenueDetailRoute, { AboutRoute, ExploreRoute, VenuePhotosRoute } from './VenueDetailRoute.jsx'
import Landing from '../pages/Landing.jsx'
import SearchRedirect from './SearchRedirect.jsx'

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
    ],
  },
])
