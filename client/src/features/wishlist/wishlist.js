import { useCallback, useSyncExternalStore } from 'react'

// Saved venues, kept in localStorage until accounts exist (then: a customer wishlist API). Shared by every heart on
// the page and synced across tabs through the `storage` event. Storage can be blocked (private mode), so every
// read and write is guarded and the wishlist then just lasts for this page load.
const STORAGE_KEY = 'markiesharkie:wishlist'
const listeners = new Set()
let saved = read()

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function emit() {
  for (const listener of listeners) listener()
}

function onStorage(event) {
  if (event.key === STORAGE_KEY || event.key === null) {
    saved = read()
    emit()
  }
}

function subscribe(listener) {
  // First subscriber: re-read, since another tab may have changed the list while nothing was listening.
  if (listeners.size === 0) {
    saved = read()
    window.addEventListener('storage', onStorage)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

export function toggleWishlist(venueId) {
  saved = new Set(saved)
  if (saved.has(venueId)) saved.delete(venueId)
  else saved.add(venueId)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved]))
  } catch (error) {
    console.warn('[wishlist] could not save to localStorage', error)
  }
  emit()
}

// true when the venue is saved. Returns a boolean so only that card re-renders on a change.
export function useIsWishlisted(venueId) {
  const getSnapshot = useCallback(() => saved.has(venueId), [venueId])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
