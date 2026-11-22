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
  draftBodySchema,
  draftQuerySchema,
  listingSubmissionSchema,
  uploadKinds,
  venueParamsSchema,
} from './schemas.js'

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
  return router
}
