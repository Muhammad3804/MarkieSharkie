import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import {
  approveBodySchema,
  auditQuerySchema,
  bulkApproveBodySchema,
  changesBodySchema,
  emptyBodySchema,
  imageDecisionBodySchema,
  imageParamsSchema,
  imagesQuerySchema,
  listVenuesQuerySchema,
  rejectBodySchema,
  suspendBodySchema,
  venueParamsSchema,
} from './schemas.js'

// Mounted at /api/admin. Admins only (REQ-3); writes are rate limited and audited (NFR-4).
export function adminRouter({ rateLimits }) {
  const router = Router()
  const writes = createRateLimiter(rateLimits.adminWrite)
  const byId = validate({ params: venueParamsSchema })
  router.use(authenticate, requireRole('admin'))

  router.get('/venues', validate({ query: listVenuesQuerySchema }), asyncHandler(controller.listVenues))
  router.post(
    '/venues/approve',
    writes,
    validate({ body: bulkApproveBodySchema }),
    asyncHandler(controller.bulkApprove),
  )
  router.get('/venues/:id', byId, asyncHandler(controller.getVenue))
  router.post(
    '/venues/:id/approve',
    writes,
    validate({ params: venueParamsSchema, body: approveBodySchema }),
    asyncHandler(controller.approve),
  )
  router.post(
    '/venues/:id/reject',
    writes,
    validate({ params: venueParamsSchema, body: rejectBodySchema }),
    asyncHandler(controller.reject),
  )
  router.post(
    '/venues/:id/request-changes',
    writes,
    validate({ params: venueParamsSchema, body: changesBodySchema }),
    asyncHandler(controller.requestChanges),
  )
  router.post(
    '/venues/:id/suspend',
    writes,
    validate({ params: venueParamsSchema, body: suspendBodySchema }),
    asyncHandler(controller.suspend),
  )
  router.post(
    '/venues/:id/unsuspend',
    writes,
    validate({ params: venueParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.unsuspend),
  )

  router.get('/images', validate({ query: imagesQuerySchema }), asyncHandler(controller.listImages))
  router.post(
    '/images/:id/decision',
    writes,
    validate({ params: imageParamsSchema, body: imageDecisionBodySchema }),
    asyncHandler(controller.decideImage),
  )

  router.get('/stats', asyncHandler(controller.stats))
  router.get('/audit', validate({ query: auditQuerySchema }), asyncHandler(controller.audit))
  return router
}
