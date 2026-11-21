import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { paginationQuerySchema } from '../../lib/validators.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import { PROFILE_EDIT_ROLES } from './schemas.js'

// Mounted at /api. UC-04 Manage Profile (EUC-03, REQ-4). Documented in server/openapi.yaml.
export function usersRouter() {
  const router = Router()

  // EUC-03 step 2: any logged-in role (the admin dashboard needs it too).
  router.get('/me', authenticate, asyncHandler(controller.getMe))

  // EUC-03 steps 3-7: the EUC-03 actors only (srs-alignment #24).
  router.patch('/me', authenticate, requireRole(...PROFILE_EDIT_ROLES), asyncHandler(controller.patchMe))

  // EUC-03 step 2 "past searches and bookings for a Customer" (REQ-4).
  router.get(
    '/me/searches',
    authenticate,
    requireRole('customer'),
    validate({ query: paginationQuerySchema }),
    asyncHandler(controller.getMySearches),
  )
  router.get(
    '/me/bookings',
    authenticate,
    requireRole('customer'),
    validate({ query: paginationQuerySchema }),
    asyncHandler(controller.getMyBookings),
  )

  return router
}
