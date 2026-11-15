import { Navigate, useLocation } from 'react-router-dom'

// Old search URL (bookmarks, older links) -> Explore with the same query.
export default function SearchRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/explore${search}`} replace />
}
