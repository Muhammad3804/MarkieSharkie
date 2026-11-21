import { forbidden, unauthenticated } from '../lib/AppError.js'

// REQ-3 / SYS-04: each role sees only its own functions. Use after authenticate.
// Ownership (e.g. venue.owner_id === req.user.id) is checked in the services of later modules.
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthenticated())
    if (!roles.includes(req.user.role)) return next(forbidden())
    next()
  }
}
