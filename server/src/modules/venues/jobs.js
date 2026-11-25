import { logger } from '../../lib/logger.js'
import { retryPendingDetections } from './imageVerification.js'
import { retryVenueEmails } from './venueEmails.js'

// srs-alignment #42 background retries, every 60 s in the API process: photos whose AI check failed (detector down)
// and owner emails that weren't delivered. Each has a growing pause and an attempt cap; the owner's Retry and the
// admin's Resend work at any time.
export function startVenueJobs({ intervalMs = 60_000 } = {}) {
  const tick = () =>
    Promise.all([retryPendingDetections(), retryVenueEmails()])
      .then(([venues, emails]) => {
        if (venues || emails) logger.info({ venues, emails }, 'venue retry jobs')
      })
      .catch((err) => logger.warn({ err: { message: err.message } }, 'venue retry jobs failed; will retry'))
  const timer = setInterval(tick, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
