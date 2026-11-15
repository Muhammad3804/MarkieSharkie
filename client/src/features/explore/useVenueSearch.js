import { useCallback, useEffect, useState } from 'react'
import { searchVenues } from '../../api/venues.js'
import { toSearchParams } from './filters.js'

// Runs searchVenues for the current filters. status: 'loading' (first load only) | 'ready' | 'error'.
// While a new search loads, the previous results stay on screen with isFetching = true, so changing a filter
// doesn't flash skeletons; dataFilters are the filters those results belong to. reload() retries after an error.
// (TanStack Query will replace this once it's added; see docs/ui-and-dashboards.md.)
export function useVenueSearch(filters) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: '', status: 'loading', data: null, filters: null })
  const query = toSearchParams(filters).toString()
  const key = `${query}#${attempt}`

  useEffect(() => {
    let cancelled = false
    searchVenues(filters)
      .then((data) => {
        if (!cancelled) setState({ key, status: 'ready', data, filters })
      })
      .catch((error) => {
        console.error('[venues] searchVenues failed', error)
        if (!cancelled) setState({ key, status: 'error', data: null, filters: null })
      })
    return () => {
      cancelled = true
    }
    // `filters` is a new object every render; `key` captures everything in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const isFetching = state.key !== key
  const status = isFetching && state.status !== 'ready' ? 'loading' : state.status
  return { status, data: state.data, dataFilters: state.filters, isFetching, reload }
}
