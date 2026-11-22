import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import {
  decisionBodySchema,
  listReviewsQuerySchema,
  reportBodySchema,
  reportParamsSchema,
  reviewParamsSchema,
} from './schemas.js'

// Mounted at /api. REQ-44: any logged-in user except admins can report a review on a public venue page.
export function reviewReportsRouter({ rateLimits }) {
  const router = Router()
  router.post(
    '/venues/:id/reviews/:reviewId/report',
    createRateLimiter(rateLimits.reviewReports),
    authenticate,
    requireRole('customer', 'venue_owner', 'decorator'),
    validate({ params: reportParamsSchema, body: reportBodySchema }),
    asyncHandler(controller.report),
  )
  return router
}

// Mounted at /api/admin/reviews. Admins only; every decision needs a reason and is audited (NFR-4).
export function adminReviewsRouter({ rateLimits }) {
  const router = Router()
  const writes = createRateLimiter(rateLimits.adminWrite)
  const decision = validate({ params: reviewParamsSchema, body: decisionBodySchema })
  router.use(authenticate, requireRole('admin'))
  router.get('/', validate({ query: listReviewsQuerySchema }), asyncHandler(controller.list))
  router.post('/:id/hide', writes, decision, asyncHandler(controller.hide))
  router.post('/:id/restore', writes, decision, asyncHandler(controller.restore))
  router.post('/:id/dismiss', writes, decision, asyncHandler(controller.dismiss))
  router.delete('/:id', writes, decision, asyncHandler(controller.remove))
  return router
}
