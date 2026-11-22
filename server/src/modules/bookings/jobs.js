import { logger } from '../../lib/logger.js'
import { runBookingJobs } from './service.js'

// REQ-18 hold release + the nightly booking jobs (docs/booking-engine.md "Scheduled jobs"), every 30 s in the API
// process. Correctness never depends on it: holds and stale requests are also checked lazily in every transaction.
export function startBookingJobs({ intervalMs = 30_000 } = {}) {
  const tick = () =>
    runBookingJobs()
      .then((r) => {
        if (r.released || r.expired || r.completed) logger.info(r, 'booking jobs')
      })
      .catch((err) => logger.warn({ err: { message: err.message } }, 'booking jobs failed; will retry'))
  const timer = setInterval(tick, intervalMs)
  timer.unref()
  tick()
  return () => clearInterval(timer)
}
