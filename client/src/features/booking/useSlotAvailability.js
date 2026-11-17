import { useCallback, useEffect, useMemo, useState } from 'react'
import { getVenueSlots } from '../../api/bookings.js'
import { subscribeMockStores } from '../../api/mockStore.js'
import { SLOT_PRESETS } from '../../lib/booking.js'
import { addDays, addMonths, monthOf, monthStart } from '../../lib/days.js'
import { todayKey } from '../../lib/format.js'

// Live slot status for one venue, today through the last month the calendar can show (12 months ahead).
// Refetches whenever any mock store changes (this tab or another, via the `storage` event) and when the next hold
// runs out, so a slot another customer books or holds turns taken without a refresh (REQ-16). Socket.io
// `slot:updated` replaces both triggers once the server exists.
//
// Returns { status: loading|ready|error, today, reload, slotStatus(hallId, date, slot), dayState(date) }.
const UNKNOWN_DAY = { state: 'unknown', free: 0, total: 0, perSlot: Object.fromEntries(SLOT_PRESETS.map((slot) => [slot.value, { free: 0, total: 0 }])) }

export function useSlotAvailability(venue) {
  const [today] = useState(todayKey)
  const range = useMemo(() => {
    const { year, month } = monthOf(today)
    return { from: today, to: addDays(addMonths(monthStart(year, month), 13), -1) }
  }, [today])
  const [state, setState] = useState({ status: 'loading', rows: null })
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => subscribeMockStores(reload), [reload])

  useEffect(() => {
    let cancelled = false
    getVenueSlots(venue.id, range)
      .then((rows) => {
        if (!cancelled) setState({ status: 'ready', rows })
      })
      .catch((error) => {
        console.error('[bookings] getVenueSlots failed', error)
        // Keep showing the last good data if there is some; otherwise show the error state.
        if (!cancelled) setState((current) => (current.rows ? current : { status: 'error', rows: null }))
      })
    return () => {
      cancelled = true
    }
  }, [venue.id, range, version])

  // Re-read when the earliest running hold expires (the lazy release in api/bookings.js).
  const nextExpiry = useMemo(() => {
    const times = (state.rows ?? []).filter((row) => row.status === 'held').map((row) => Date.parse(row.heldUntil))
    return times.length ? Math.min(...times) : null
  }, [state.rows])
  useEffect(() => {
    if (nextExpiry === null) return
    const timer = setTimeout(reload, Math.max(0, nextExpiry - Date.now()) + 50)
    return () => clearTimeout(timer)
  }, [nextExpiry, reload])

  const index = useMemo(() => new Map((state.rows ?? []).map((row) => [`${row.hallId}~${row.date}~${row.slot}`, row.status])), [state.rows])

  const slotStatus = useCallback((hallId, date, slot) => (date < today ? 'past' : (index.get(`${hallId}~${date}~${slot}`) ?? 'unknown')), [index, today])

  // { state: available|few|full|past|unknown, free, total, perSlot: { lunch: {free,total}, evening: {...} } }.
  // "Free" = available; held, booked and blocked all count as taken for everyone else. Computed once per data
  // version for every day the calendar can show, so memoized calendar days get the same object back.
  const days = useMemo(() => {
    const map = new Map()
    const { year, month } = monthOf(today)
    for (let date = monthStart(year, month); date <= range.to; date = addDays(date, 1)) {
      const perSlot = {}
      let free = 0
      let total = 0
      for (const slot of SLOT_PRESETS) {
        let slotFree = 0
        for (const hall of venue.halls) if (index.get(`${hall.hallId}~${date}~${slot.value}`) === 'available') slotFree++
        perSlot[slot.value] = { free: slotFree, total: venue.halls.length }
        free += slotFree
        total += venue.halls.length
      }
      const dayState = date < today ? 'past' : !state.rows ? 'unknown' : free === total ? 'available' : free === 0 ? 'full' : 'few'
      map.set(date, { state: dayState, free, total, perSlot })
    }
    return map
  }, [index, venue.halls, today, state.rows, range.to])
  const dayState = useCallback((date) => days.get(date) ?? UNKNOWN_DAY, [days])

  return { status: state.status, today, reload, slotStatus, dayState }
}
