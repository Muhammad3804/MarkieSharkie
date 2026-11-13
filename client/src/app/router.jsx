import { createBrowserRouter } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import VenueDetailRoute from './VenueDetailRoute.jsx'
import Landing from '../pages/Landing.jsx'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/venues/:id', element: <VenueDetailRoute /> },
    ],
  },
])
