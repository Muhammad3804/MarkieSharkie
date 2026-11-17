import { useSyncExternalStore } from 'react'
import { DEFAULT_GUESTS } from '../../lib/booking.js'
import { getSessionUser } from '../../api/auth.js'

// Booking flow draft, one per venue, autosaved to localStorage after every change (refresh-safe, survives
// Save & exit). Shaped like the POST /api/bookings body plus UI-only fields (eventName, hostName, hostPhone,
// specialRequests have no columns yet). The hold is NOT in the draft: it lives per tab in sessionStorage, so a
// second tab is a second customer and can't take over this tab's hold (api/bookings.js).
const KEY = 'markiesharkie:booking-drafts'
const HOLD_KEY = (venueId) => `markiesharkie:booking-hold:${venueId}`

export function newBookingDraft(venue, selection = {}) {
  return {
    venueId: venue.id,
    date: '',
    slot: 'evening',
    hallId: venue.halls[0]?.hallId ?? '',
    guests: DEFAULT_GUESTS,
    menuId: venue.menuPackages[0]?.menuId ?? '',
    eventType: '',
    eventName: '',
    hostName: getSessionUser()?.name ?? '', // prefilled from the account, editable (the host may be someone else)
    hostPhone: '',
    specialRequests: '',
    addOns: {}, // { [addOnId]: quantity }
    agreed: false,
    lastStep: null,
    ...selection,
  }
}

let cache = null
let saved = true
const listeners = new Set()
const emit = () => listeners.forEach((listener) => listener())

function readAll() {
  if (cache) return cache
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    cache = {}
  }
  return cache
}

function writeAll(next) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    saved = true
  } catch (error) {
    console.warn('[booking] draft not saved', error)
    saved = false
  }
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) {
      cache = null
      emit()
    }
  })
}

export const loadBookingDraft = (venueId) => readAll()[venueId] ?? null

export function saveBookingDraft(venueId, draft) {
  writeAll({ ...readAll(), [venueId]: { ...draft, updatedAt: new Date().toISOString() } })
}

export function updateBookingDraft(venueId, changes) {
  const current = readAll()[venueId]
  if (!current) return
  saveBookingDraft(venueId, { ...current, ...(typeof changes === 'function' ? changes(current) : changes) })
}

export function clearBookingDraft(venueId) {
  const { [venueId]: _removed, ...rest } = readAll()
  writeAll(rest)
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// { draft (null when none), saved } for one venue, re-rendering on every change (this tab or another).
export function useBookingDraft(venueId) {
  const draft = useSyncExternalStore(subscribe, () => readAll()[venueId] ?? null)
  const isSaved = useSyncExternalStore(subscribe, () => saved)
  return { draft, saved: isSaved }
}

// This tab's hold: { slotId, holdToken, heldUntil, hallId, date, slot } or null.
export function loadHoldRef(venueId) {
  try {
    return JSON.parse(sessionStorage.getItem(HOLD_KEY(venueId)) ?? 'null')
  } catch {
    return null
  }
}
export function saveHoldRef(venueId, hold) {
  try {
    sessionStorage.setItem(HOLD_KEY(venueId), JSON.stringify(hold))
  } catch {
    // blocked storage: the hold still works until this page reloads
  }
}
export function clearHoldRef(venueId) {
  try {
    sessionStorage.removeItem(HOLD_KEY(venueId))
  } catch {
    // nothing stored
  }
}
