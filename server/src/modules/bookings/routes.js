import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import {
  bookingParamsSchema,
  cancelBodySchema,
  createBookingSchema,
  emptyBodySchema,
  myBookingsQuerySchema,
  ownerBookingsQuerySchema,
  rejectBodySchema,
  slotParamsSchema,
} from './schemas.js'

// Mounted at /api. EUC-14, 15, 16, 24 (docs/booking-engine.md). Role here, ownership in the service.
export function bookingsRouter({ rateLimits }) {
  const router = Router()
  const writes = createRateLimiter(rateLimits.bookingWrite)
  const customer = [authenticate, requireRole('customer')]
  const owner = [authenticate, requireRole('venue_owner')]

  router.post(
    '/slots/:slotId/hold',
    writes,
    ...customer,
    validate({ params: slotParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.hold),
  )
  router.delete(
    '/slots/:slotId/hold',
    writes,
    ...customer,
    validate({ params: slotParamsSchema }),
    asyncHandler(controller.release),
  )

  router.post(
    '/bookings',
    writes,
    ...customer,
    validate({ body: createBookingSchema }),
    asyncHandler(controller.create),
  )
  router.get('/bookings', ...customer, validate({ query: myBookingsQuerySchema }), asyncHandler(controller.listMine))
  router.get(
    '/bookings/:id',
    authenticate,
    requireRole('customer', 'venue_owner'),
    validate({ params: bookingParamsSchema }),
    asyncHandler(controller.getOne),
  )
  router.post(
    '/bookings/:id/cancel',
    writes,
    ...customer,
    validate({ params: bookingParamsSchema, body: cancelBodySchema }),
    asyncHandler(controller.cancel),
  )

  router.get(
    '/owner/bookings',
    ...owner,
    validate({ query: ownerBookingsQuerySchema }),
    asyncHandler(controller.ownerList),
  )
  router.post(
    '/owner/bookings/:id/confirm',
    writes,
    ...owner,
    validate({ params: bookingParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.confirm),
  )
  router.post(
    '/owner/bookings/:id/reject',
    writes,
    ...owner,
    validate({ params: bookingParamsSchema, body: rejectBodySchema }),
    asyncHandler(controller.reject),
  )
  return router
}
