import { requestOrigin } from '../../lib/origin.js'
import * as service from './service.js'

// Thin. req.user is checked by role in the routes; ownership in the service.
const noStore = (res) => res.set('Cache-Control', 'no-store')

export async function hold(req, res) {
  res.status(201).json(await service.holdSlot(req.user, req.params.slotId))
}
export async function release(req, res) {
  await service.releaseHold(req.user, req.params.slotId)
  res.status(204).end()
}
export async function create(req, res) {
  res.status(201).json(await service.createBooking(req.user, req.body))
}
export async function listMine(req, res) {
  noStore(res)
  res.json(await service.listMyBookings(req.user, req.query, { origin: requestOrigin(req) }))
}
export async function getOne(req, res) {
  noStore(res)
  res.json(await service.getBooking(req.user, req.params.id, { origin: requestOrigin(req) }))
}
export async function cancel(req, res) {
  res.json(await service.cancelBooking(req.user, req.params.id, req.body, { origin: requestOrigin(req) }))
}
export async function ownerList(req, res) {
  noStore(res)
  res.json(await service.listOwnerBookings(req.user, req.query, { origin: requestOrigin(req) }))
}
export async function confirm(req, res) {
  res.json(await service.confirmBooking(req.user, req.params.id, { origin: requestOrigin(req) }))
}
export async function reject(req, res) {
  res.json(await service.rejectBooking(req.user, req.params.id, req.body, { origin: requestOrigin(req) }))
}
