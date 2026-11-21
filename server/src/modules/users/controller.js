import { parseOrThrow } from '../../lib/validation.js'
import { updateMeSchemas } from './schemas.js'
import * as service from './service.js'

export async function getMe(req, res) {
  res.json({ user: await service.getProfile(req.user.id) })
}

// The schema depends on the caller's role, so it is chosen here rather than in the route.
export async function patchMe(req, res) {
  const input = parseOrThrow(updateMeSchemas[req.user.role], req.body, 'body')
  res.json({ user: await service.updateProfile(req.user, input) })
}

export async function getMySearches(req, res) {
  res.json(await service.listSearches(req.user.id, req.query))
}

export async function getMyBookings(req, res) {
  res.json(await service.listBookings(req.user.id, req.query))
}
