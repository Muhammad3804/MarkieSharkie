import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import { availabilityQuerySchema, searchQuerySchema, venueIdParamsSchema } from './schemas.js'

// Mounted at /api. Public (no login): only approved, active venues (REQ-7, REQ-12, REQ-13).
export function venuesRouter({ rateLimits }) {
  const router = Router()
  const limiter = createRateLimiter(rateLimits.publicRead)

  router.get('/venues/landing', limiter, asyncHandler(controller.landing))
  router.get(
    '/venues',
    limiter,
    optionalAuthenticate,
    validate({ query: searchQuerySchema }),
    asyncHandler(controller.search),
  )
  router.get('/venues/:id', limiter, validate({ params: venueIdParamsSchema }), asyncHandler(controller.getVenue))
  router.get(
    '/venues/:id/availability',
    limiter,
    validate({ params: venueIdParamsSchema, query: availabilityQuerySchema }),
    asyncHandler(controller.availability),
  )
  router.get('/stats', limiter, asyncHandler(controller.stats))
  return router
}
