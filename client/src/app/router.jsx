import { createBrowserRouter } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout.jsx'
import Landing from '../pages/Landing.jsx'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [{ path: '/', element: <Landing /> }],
  },
])
