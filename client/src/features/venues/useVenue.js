import { useCallback, useEffect, useState } from 'react'
import { getVenueById } from '../../api/venues.js'

// Loads one venue by id. status: 'loading' | 'ready' | 'not-found' | 'error'; reload() retries after an error.
// (TanStack Query will replace this once it's added; see docs/ui-and-dashboards.md.)
export function useVenue(id) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: '', status: 'loading', venue: null })
  const key = `${id}#${attempt}`

  useEffect(() => {
    let cancelled = false
    getVenueById(id)
      .then((venue) => {
        if (!cancelled) setState({ key, status: venue ? 'ready' : 'not-found', venue })
      })
      .catch((error) => {
        console.error('[venues] getVenueById failed', error)
        if (!cancelled) setState({ key, status: 'error', venue: null })
      })
    return () => {
      cancelled = true
    }
  }, [id, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  // While a new id (or a retry) loads, don't keep showing the previous result.
  const current = state.key === key ? state : { status: 'loading', venue: null }
  return { status: current.status, venue: current.venue, reload }
}
