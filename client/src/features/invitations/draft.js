import { useSyncExternalStore } from 'react'
import { INVITE_EVENT_TYPES } from './options.js'
import { addDays } from '../../lib/days.js'
import { todayKey } from '../../lib/format.js'
import { formatPkMobile } from '../../lib/phone.js'

// Invitation builder draft, one per booking, autosaved to localStorage after every keystroke (refresh-safe,
// survives Save & exit). Shaped like the POST /api/bookings/:id/invitation body.
const KEY = 'markiesharkie:invitation-drafts'

// Prefill from what we already know: the saved invitation, else the booking's own answers (REQ-36).
export function newInviteDraft(booking, invitation) {
  if (invitation) {
    const { template, title, eventType, hostNames, message, rsvpBy, contactPhone } = invitation
    return { template, title, eventType, hostNames, message, rsvpBy, contactPhone: formatPkMobile(contactPhone), lastStep: null }
  }
  const today = todayKey()
  const weekBefore = addDays(booking.date, -7)
  const rsvpBy = weekBefore >= today ? weekBefore : today < booking.date ? today : ''
  return {
    template: '',
    title: booking.eventName ?? '',
    eventType: INVITE_EVENT_TYPES.some((t) => t.value === booking.eventType) ? booking.eventType : 'other',
    hostNames: booking.hostName ?? '',
    message: '',
    rsvpBy,
    contactPhone: booking.hostPhone ? formatPkMobile(booking.hostPhone) : '',
    lastStep: null,
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
    console.warn('[invitations] draft not saved', error)
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

export function saveInviteDraft(bookingId, draft) {
  writeAll({ ...readAll(), [bookingId]: draft })
}

export function updateInviteDraft(bookingId, changes) {
  const current = readAll()[bookingId]
  if (!current) return
  saveInviteDraft(bookingId, { ...current, ...(typeof changes === 'function' ? changes(current) : changes) })
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInviteDraft(bookingId) {
  const draft = useSyncExternalStore(subscribe, () => readAll()[bookingId] ?? null)
  const isSaved = useSyncExternalStore(subscribe, () => saved)
  return { draft, saved: isSaved }
}
