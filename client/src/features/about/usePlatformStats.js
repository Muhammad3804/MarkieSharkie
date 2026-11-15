import { useEffect, useState } from 'react'
import { getPlatformStats } from '../../api/venues.js'

// Loads the About page numbers. status: 'loading' | 'ready' | 'error'. The strip is decorative enough that an
// error just hides it rather than offering a retry. (TanStack Query will replace this once it's added.)
export function usePlatformStats() {
  const [state, setState] = useState({ status: 'loading', stats: null })

  useEffect(() => {
    let cancelled = false
    getPlatformStats()
      .then((stats) => {
        if (!cancelled) setState({ status: 'ready', stats })
      })
      .catch((error) => {
        console.error('[about] getPlatformStats failed', error)
        if (!cancelled) setState({ status: 'error', stats: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
