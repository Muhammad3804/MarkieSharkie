import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { validate } from '../../middleware/validate.js'
import { AUTH_RATE_LIMITS, createRateLimiter } from '../../middleware/rateLimit.js'
import * as controller from './controller.js'
import {
  emptyBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyResetCodeBodySchema,
} from './schemas.js'

// Mounted at /api/auth. All public. Documented in server/openapi.yaml.
export function authRouter({ rateLimits: overrides = AUTH_RATE_LIMITS } = {}) {
  const rateLimits = { ...AUTH_RATE_LIMITS, ...overrides }
  const router = Router()

  // UC-01 / EUC-01 (REQ-1)
  router.post(
    '/register',
    createRateLimiter(rateLimits.register),
    validate({ body: registerBodySchema }),
    asyncHandler(controller.register),
  )

  // UC-02 / EUC-02 steps 1-6 (REQ-2, REQ-3)
  router.post(
    '/login',
    createRateLimiter(rateLimits.login),
    validate({ body: loginBodySchema }),
    asyncHandler(controller.login),
  )

  // REQ-2 session renewal + 30-minute inactivity
  router.post(
    '/refresh',
    createRateLimiter(rateLimits.refresh),
    validate({ body: emptyBodySchema }),
    asyncHandler(controller.refresh),
  )

  // UC-03 / EUC-02 step 7
  router.post('/logout', validate({ body: emptyBodySchema }), asyncHandler(controller.logout))

  // REQ-2 password reset by a 6-digit emailed code (10 min, single use, 5 tries).
  router.post(
    '/forgot-password',
    createRateLimiter(rateLimits.forgotPassword),
    createRateLimiter(rateLimits.forgotPasswordPerEmail),
    validate({ body: forgotPasswordBodySchema }),
    asyncHandler(controller.forgotPassword),
  )
  router.post(
    '/verify-reset-code',
    createRateLimiter(rateLimits.resetCode),
    validate({ body: verifyResetCodeBodySchema }),
    asyncHandler(controller.verifyResetCode),
  )
  router.post(
    '/reset-password',
    createRateLimiter(rateLimits.resetCode),
    validate({ body: resetPasswordBodySchema }),
    asyncHandler(controller.resetPassword),
  )

  return router
}
