import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { singleFile } from '../../middleware/upload.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import {
  adminDisputesQuerySchema,
  adminNoteSchema,
  adminReportsQuerySchema,
  bookingParamsSchema,
  disputeParamsSchema,
  emptyBodySchema,
  fileParamsSchema,
  myDisputesQuerySchema,
  noteSchema,
  openDisputeSchema,
  rejectSchema,
  reportParamsSchema,
  reportVenueSchema,
  resolveReportSchema,
  resolveSchema,
  venueParamsSchema,
} from './schemas.js'

// Mounted at /api. REQ-48 / EUC-35: the two parties of a booking (customer, venue owner); venue reports by any
// signed-in non-admin. Role here; party and ownership in the service (others get 404).
export function disputesRouter({ rateLimits }) {
  const router = Router()
  const writes = createRateLimiter(rateLimits.disputeWrite)
  const party = [authenticate, requireRole('customer', 'venue_owner')]

  router.post(
    '/disputes/uploads',
    createRateLimiter(rateLimits.uploads),
    ...party,
    singleFile,
    asyncHandler(controller.upload),
  )
  router.post(
    '/bookings/:id/disputes',
    writes,
    ...party,
    validate({ params: bookingParamsSchema, body: openDisputeSchema }),
    asyncHandler(controller.open),
  )
  router.get('/disputes', ...party, validate({ query: myDisputesQuerySchema }), asyncHandler(controller.listMine))
  router.get('/disputes/:id', ...party, validate({ params: disputeParamsSchema }), asyncHandler(controller.getMine))
  router.post(
    '/disputes/:id/notes',
    writes,
    ...party,
    validate({ params: disputeParamsSchema, body: noteSchema }),
    asyncHandler(controller.addNote),
  )
  router.get(
    '/disputes/:id/files/:fileId',
    authenticate,
    requireRole('customer', 'venue_owner', 'admin'),
    validate({ params: fileParamsSchema }),
    asyncHandler(controller.file),
  )
  router.post(
    '/venues/:id/reports',
    createRateLimiter(rateLimits.venueReports),
    authenticate,
    requireRole('customer', 'venue_owner', 'decorator'),
    validate({ params: venueParamsSchema, body: reportVenueSchema }),
    asyncHandler(controller.reportVenue),
  )
  return router
}

// Mounted at /api/admin. Admins only; every write is audited (NFR-4).
export function adminDisputesRouter({ rateLimits }) {
  const router = Router()
  const writes = createRateLimiter(rateLimits.adminWrite)
  const admin = [authenticate, requireRole('admin')]
  router.get('/disputes', ...admin, validate({ query: adminDisputesQuerySchema }), asyncHandler(controller.adminList))
  router.get('/disputes/:id', ...admin, validate({ params: disputeParamsSchema }), asyncHandler(controller.adminGet))
  router.post(
    '/disputes/:id/take',
    writes,
    ...admin,
    validate({ params: disputeParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.adminTake),
  )
  router.post(
    '/disputes/:id/resolve',
    writes,
    ...admin,
    validate({ params: disputeParamsSchema, body: resolveSchema }),
    asyncHandler(controller.adminResolve),
  )
  router.post(
    '/disputes/:id/reject',
    writes,
    ...admin,
    validate({ params: disputeParamsSchema, body: rejectSchema }),
    asyncHandler(controller.adminReject),
  )
  router.post(
    '/disputes/:id/notes',
    writes,
    ...admin,
    validate({ params: disputeParamsSchema, body: adminNoteSchema }),
    asyncHandler(controller.adminNote),
  )
  router.get(
    '/venue-reports',
    ...admin,
    validate({ query: adminReportsQuerySchema }),
    asyncHandler(controller.adminReports),
  )
  router.post(
    '/venue-reports/:id/take',
    writes,
    ...admin,
    validate({ params: reportParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.adminTakeReport),
  )
  router.post(
    '/venue-reports/:id/resolve',
    writes,
    ...admin,
    validate({ params: reportParamsSchema, body: resolveReportSchema }),
    asyncHandler(controller.adminResolveReport),
  )
  return router
}
