import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { singleFile } from '../../middleware/upload.js'
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
  revisionParamsSchema,
  revisionsQuerySchema,
  roleChangeSchema,
  userParamsSchema,
  userReasonSchema,
  usersQuerySchema,
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

  // Edits to live venues (REQ-5 "changed venue goes to Admin approval", srs-alignment #35).
  router.get('/revisions', validate({ query: revisionsQuerySchema }), asyncHandler(controller.listRevisions))
  router.get('/revisions/:id', validate({ params: revisionParamsSchema }), asyncHandler(controller.getRevision))
  router.post(
    '/revisions/:id/approve',
    writes,
    validate({ params: revisionParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.approveRevision),
  )
  router.post(
    '/revisions/:id/reject',
    writes,
    validate({ params: revisionParamsSchema, body: rejectBodySchema }),
    asyncHandler(controller.rejectRevision),
  )

  // Users (REQ-47, EUC-33): every action needs a reason and is audited; no admin can act on themselves or remove the
  // last active admin.
  const userAction = (schema) => validate({ params: userParamsSchema, body: schema })
  router.get('/users', validate({ query: usersQuerySchema }), asyncHandler(controller.listUsers))
  router.get('/users/:id', validate({ params: userParamsSchema }), asyncHandler(controller.getUser))
  router.post('/users/:id/suspend', writes, userAction(userReasonSchema), asyncHandler(controller.suspendUser))
  router.post('/users/:id/reactivate', writes, userAction(userReasonSchema), asyncHandler(controller.reactivateUser))
  router.post('/users/:id/role', writes, userAction(roleChangeSchema), asyncHandler(controller.changeRole))
  router.delete('/users/:id', writes, userAction(userReasonSchema), asyncHandler(controller.deleteUser))

  router.get('/images', validate({ query: imagesQuerySchema }), asyncHandler(controller.listImages))
  router.post(
    '/images/:id/decision',
    writes,
    validate({ params: imageParamsSchema, body: imageDecisionBodySchema }),
    asyncHandler(controller.decideImage),
  )

  // REQ-9 demo: is the AI check working? (same detector and rules as real uploads; stores nothing but an audit row)
  router.get('/image-detection', asyncHandler(controller.detectionStatus))
  router.post(
    '/image-detection/test',
    createRateLimiter(rateLimits.detectionTest),
    singleFile,
    validate({ body: emptyBodySchema }),
    asyncHandler(controller.detectionTest),
  )

  router.get('/stats', asyncHandler(controller.stats))
  router.get('/audit', validate({ query: auditQuerySchema }), asyncHandler(controller.audit))
  return router
}
