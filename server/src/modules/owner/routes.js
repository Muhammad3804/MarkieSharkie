import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { singleFile } from '../../middleware/upload.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import {
  addOnBodySchema,
  addOnParamsSchema,
  deactivateBodySchema,
  draftBodySchema,
  draftQuerySchema,
  listingEditSchema,
  listingSubmissionSchema,
  menuBodySchema,
  menuParamsSchema,
  uploadKinds,
  venueParamsSchema,
} from './schemas.js'

const emptyBody = z.object({}).strict().default({})

const uploadBodySchema = z
  .object({ kind: z.enum(uploadKinds, { error: 'Say what the file is: photo, floor_plan or walkthrough.' }) })
  .strict()

// Mounted at /api/owner. Venue owners only (REQ-3); every venue route also checks ownership in the service.
export function ownerRouter({ rateLimits }) {
  const router = Router()
  const writes = createRateLimiter(rateLimits.ownerWrite)
  router.use(authenticate, requireRole('venue_owner'))

  router.get('/draft', validate({ query: draftQuerySchema }), asyncHandler(controller.getDraft))
  router.put('/draft', writes, validate({ body: draftBodySchema }), asyncHandler(controller.putDraft))
  router.delete('/draft', writes, validate({ query: draftQuerySchema }), asyncHandler(controller.deleteDraft))

  router.post(
    '/uploads',
    createRateLimiter(rateLimits.uploads),
    singleFile,
    validate({ body: uploadBodySchema }),
    asyncHandler(controller.upload),
  )

  router.get('/venues', asyncHandler(controller.listMine))
  router.post('/venues', writes, validate({ body: listingSubmissionSchema }), asyncHandler(controller.submit))
  router.get('/venues/:id', validate({ params: venueParamsSchema }), asyncHandler(controller.getMine))
  router.put(
    '/venues/:id',
    writes,
    validate({ params: venueParamsSchema, body: listingSubmissionSchema }),
    asyncHandler(controller.resubmit),
  )
  router.post(
    '/venues/:id/images/verify',
    writes,
    validate({ params: venueParamsSchema }),
    asyncHandler(controller.retryChecks),
  )

  // Live venues (EUC-04, EUC-07, REQ-5, REQ-6, srs-alignment #35). Ownership is checked in the service (404 otherwise).
  const byId = validate({ params: venueParamsSchema })
  router.put(
    '/venues/:id/edit',
    writes,
    validate({ params: venueParamsSchema, body: listingEditSchema }),
    asyncHandler(controller.editLive),
  )
  router.get('/venues/:id/revision', byId, asyncHandler(controller.getRevision))
  router.delete('/venues/:id/revision', writes, byId, asyncHandler(controller.withdrawRevision))
  router.post(
    '/venues/:id/deactivate',
    writes,
    validate({ params: venueParamsSchema, body: deactivateBodySchema }),
    asyncHandler(controller.deactivate),
  )
  router.post(
    '/venues/:id/reactivate',
    writes,
    validate({ params: venueParamsSchema, body: emptyBody }),
    asyncHandler(controller.reactivate),
  )
  router.post(
    '/venues/:id/menus',
    writes,
    validate({ params: venueParamsSchema, body: menuBodySchema }),
    asyncHandler(controller.createMenu),
  )
  router.put(
    '/venues/:id/menus/:menuId',
    writes,
    validate({ params: menuParamsSchema, body: menuBodySchema }),
    asyncHandler(controller.updateMenu),
  )
  router.delete(
    '/venues/:id/menus/:menuId',
    writes,
    validate({ params: menuParamsSchema }),
    asyncHandler(controller.deleteMenu),
  )
  router.post(
    '/venues/:id/add-ons',
    writes,
    validate({ params: venueParamsSchema, body: addOnBodySchema }),
    asyncHandler(controller.createAddOn),
  )
  router.put(
    '/venues/:id/add-ons/:addOnId',
    writes,
    validate({ params: addOnParamsSchema, body: addOnBodySchema }),
    asyncHandler(controller.updateAddOn),
  )
  router.delete(
    '/venues/:id/add-ons/:addOnId',
    writes,
    validate({ params: addOnParamsSchema }),
    asyncHandler(controller.deleteAddOn),
  )
  return router
}
