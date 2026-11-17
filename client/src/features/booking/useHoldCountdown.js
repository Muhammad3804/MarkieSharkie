import { useEffect, useRef, useState } from 'react'

// Seconds left on a hold, ticking once a second; calls onExpire once when it reaches 0.
export function useHoldCountdown(heldUntil, onExpire) {
  const [clock, setClock] = useState(() => ({ until: heldUntil, now: Date.now() }))
  // A new hold: restart from the real time, not the last tick of the previous (or no) hold.
  // Until the effect's first tick, report null (the pill skips a frame) rather than a wrong number.
  if (clock.until !== heldUntil) setClock({ until: heldUntil, now: null })
  const now = clock.until === heldUntil ? clock.now : null
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })
  useEffect(() => {
    if (!heldUntil) return
    const end = Date.parse(heldUntil)
    const tick = () => {
      const current = Date.now()
      setClock({ until: heldUntil, now: current })
      if (current >= end) {
        clearInterval(timer)
        onExpireRef.current?.()
      }
    }
    const timer = setInterval(tick, 1000)
    tick()
    return () => clearInterval(timer)
  }, [heldUntil])
  return heldUntil && now !== null ? Math.max(0, Math.ceil((Date.parse(heldUntil) - now) / 1000)) : null
}
