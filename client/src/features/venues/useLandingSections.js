import { useCallback, useEffect, useState } from 'react'
import { getLandingSections } from '../../api/venues.js'

// Loads the landing page venue rows. status: 'loading' | 'ready' | 'error'; reload() retries after an error.
// (TanStack Query will replace this once it's added; see docs/ui-and-dashboards.md.)
export function useLandingSections() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ attempt: -1, status: 'loading', sections: [] })

  useEffect(() => {
    let cancelled = false
    getLandingSections()
      .then((sections) => {
        if (!cancelled) setState({ attempt, status: 'ready', sections })
      })
      .catch((error) => {
        console.error('[venues] getLandingSections failed', error)
        if (!cancelled) setState({ attempt, status: 'error', sections: [] })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  // While a retry loads, show the loading state rather than the old error.
  const current = state.attempt === attempt ? state : { status: 'loading', sections: [] }
  return { status: current.status, sections: current.sections, reload }
}
