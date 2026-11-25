import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'

const thresholdSchema = z
  .object({
    threshold: z
      .number({ error: 'Enter a number from 0 to 100.' })
      .min(0, 'Enter a number from 0 to 100.')
      .max(100, 'Enter a number from 0 to 100.')
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'Use at most 2 decimals.'),
  })
  .strict()

// Mounted at /api/admin. Admins only; a change is audited with the old and new value (NFR-4).
export function settingsRouter({ rateLimits }) {
  const router = Router()
  const admin = [authenticate, requireRole('admin')]
  router.get('/settings/ai-threshold', ...admin, asyncHandler(controller.getAiThreshold))
  router.put(
    '/settings/ai-threshold',
    createRateLimiter(rateLimits.adminWrite),
    ...admin,
    validate({ body: thresholdSchema }),
    asyncHandler(controller.updateAiThreshold),
  )
  return router
}
