import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { subscribeMockStores } from '../../api/mockStore.js'

let version = 0
subscribeMockStores(() => {
  version += 1
})
const getVersion = () => version

// Re-renders whenever any mock store changes (an action here, or another tab).
export function useStoreVersion() {
  return useSyncExternalStore(subscribeMockStores, getVersion, getVersion)
}

// Loads `load()` whenever `key` changes or the stores change. { status: loading|ready|error, data, reload }.
// While a refetch runs after a store change, the previous data stays on screen (status stays 'ready').
// (TanStack Query replaces this once it's added; see docs/ui-and-dashboards.md.)
export function useAdminData(load, key) {
  const storeVersion = useStoreVersion()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ query: null, attempt: 0, version: -1, status: 'loading', data: null })

  useEffect(() => {
    let cancelled = false
    const stamp = { query: key, attempt, version: storeVersion }
    load()
      .then((data) => {
        if (!cancelled) setState({ ...stamp, status: 'ready', data })
      })
      .catch((error) => {
        console.error('[admin] load failed', error)
        if (!cancelled) setState({ ...stamp, status: 'error', data: null })
      })
    return () => {
      cancelled = true
    }
    // `load` is a fresh closure every render; key, attempt and the store version decide when to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, storeVersion])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const fresh = state.query === key && state.attempt === attempt && state.version === storeVersion
  // A new key (filter, page) or a retry after an error shows loading; a store change keeps the old data on screen.
  if (state.query !== key || (state.status === 'error' && !fresh)) return { status: 'loading', data: null, reload, refreshing: false }
  return { status: state.status, data: state.data, reload, refreshing: !fresh }
}

// Query-string state for tabs, filters, sort and page, so refresh and Back work.
// defaults: { name: defaultValue }. Values equal to the default are dropped from the URL.
// set(patch, { push }) : filters replace the history entry, tabs and pages push one. Any change other than `page`
// resets to page 1. `allowed` = { name: [values] }: anything else in the URL falls back to the default.
export function useUrlState(defaults, allowed = {}) {
  const [params, setParams] = useSearchParams()
  const defaultsKey = JSON.stringify(defaults)
  const allowedKey = JSON.stringify(allowed)
  const values = useMemo(() => {
    const parsed = JSON.parse(defaultsKey)
    const lists = JSON.parse(allowedKey)
    for (const name of Object.keys(parsed)) {
      const raw = params.get(name)
      if (raw === null) continue
      if (typeof parsed[name] === 'number') parsed[name] = Math.max(1, Number.parseInt(raw, 10) || 1)
      else if (!lists[name] || lists[name].includes(raw)) parsed[name] = raw
    }
    return parsed
  }, [params, defaultsKey, allowedKey])

  const set = useCallback(
    (patch, { push = false } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          const base = JSON.parse(defaultsKey)
          if (!('page' in patch) && 'page' in base) next.delete('page')
          for (const [name, value] of Object.entries(patch)) {
            if (value === '' || value === null || value === undefined || value === base[name]) next.delete(name)
            else next.set(name, String(value))
          }
          return next
        },
        { replace: !push },
      )
    },
    [setParams, defaultsKey],
  )
  return [values, set]
}

// Hook-friendly link builder for the current page: hrefFor({ tab: 'x' }) keeps the other params.
export function useHref() {
  const location = useLocation()
  return (patch, { keep = true } = {}) => {
    const params = new URLSearchParams(keep ? location.search : '')
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === null || value === undefined) params.delete(key)
      else params.set(key, String(value))
    }
    if (!('page' in patch)) params.delete('page')
    const query = params.toString()
    return `${location.pathname}${query ? `?${query}` : ''}`
  }
}
