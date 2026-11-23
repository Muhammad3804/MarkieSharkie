import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { authenticate } from '../../middleware/authenticate.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validate } from '../../middleware/validate.js'
import * as controller from './controller.js'
import {
  addGuestsSchema,
  bookingParamsSchema,
  emptyBodySchema,
  guestParamsSchema,
  guestsQuerySchema,
  invitationBodySchema,
  invitationParamsSchema,
  rsvpBodySchema,
  sendBodySchema,
  tokenParamsSchema,
} from './schemas.js'

// Mounted at /api. EUC-25 (host = the booking's customer), EUC-26 / 27 (guest, no account, by token).
export function invitationsRouter({ rateLimits }) {
  const router = Router()
  const writes = createRateLimiter(rateLimits.bookingWrite)
  const host = [authenticate, requireRole('customer')]
  const guestLimit = createRateLimiter(rateLimits.inviteGuest)
  const rsvpLimit = createRateLimiter(rateLimits.inviteRsvp)

  router.get(
    '/bookings/:id/invitation',
    ...host,
    validate({ params: bookingParamsSchema }),
    asyncHandler(controller.getForBooking),
  )
  router.put(
    '/bookings/:id/invitation',
    writes,
    ...host,
    validate({ params: bookingParamsSchema, body: invitationBodySchema }),
    asyncHandler(controller.saveForBooking),
  )
  router.get('/invitations', ...host, asyncHandler(controller.mySummaries))
  router.get(
    '/invitations/:id/guests',
    ...host,
    validate({ params: invitationParamsSchema, query: guestsQuerySchema }),
    asyncHandler(controller.listGuests),
  )
  router.post(
    '/invitations/:id/guests',
    writes,
    ...host,
    validate({ params: invitationParamsSchema, body: addGuestsSchema }),
    asyncHandler(controller.addGuests),
  )
  router.delete(
    '/invitations/:id/guests/:guestId',
    writes,
    ...host,
    validate({ params: guestParamsSchema }),
    asyncHandler(controller.removeGuest),
  )
  router.post(
    '/invitations/:id/send',
    writes,
    ...host,
    validate({ params: invitationParamsSchema, body: sendBodySchema }),
    asyncHandler(controller.send),
  )
  router.post(
    '/invitations/:id/guests/:guestId/resend',
    writes,
    ...host,
    validate({ params: guestParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.resend),
  )
  router.post(
    '/invitations/:id/guests/:guestId/link',
    writes,
    ...host,
    validate({ params: guestParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.newLink),
  )
  router.post(
    '/invitations/:id/guests/:guestId/revoke',
    writes,
    ...host,
    validate({ params: guestParamsSchema, body: emptyBodySchema }),
    asyncHandler(controller.revoke),
  )

  // Public, no account (REQ-38). Rate limited per IP; a bad token is the same 404 as an expired one.
  router.get('/i/:token', guestLimit, validate({ params: tokenParamsSchema }), asyncHandler(controller.publicView))
  router.put(
    '/i/:token/rsvp',
    rsvpLimit,
    validate({ params: tokenParamsSchema, body: rsvpBodySchema }),
    asyncHandler(controller.rsvp),
  )
  return router
}
