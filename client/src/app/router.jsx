import { createBrowserRouter } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import VenueDetailRoute, { VenuePhotosRoute } from './VenueDetailRoute.jsx'
import Landing from '../pages/Landing.jsx'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/venues/:id', element: <VenueDetailRoute /> },
      { path: '/venues/:id/photos', element: <VenuePhotosRoute /> },
    ],
  },
])
