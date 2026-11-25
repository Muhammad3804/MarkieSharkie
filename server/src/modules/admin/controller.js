import { requestOrigin } from '../../lib/origin.js'
import * as service from './service.js'
import * as usersService from './usersService.js'

// Thin. req.user is an admin (requireRole); every write is audited in the service.
const noStore = (res) => res.set('Cache-Control', 'no-store')

export async function listVenues(req, res) {
  noStore(res)
  res.json(await service.listVenues(req.query, { origin: requestOrigin(req) }))
}
export async function getVenue(req, res) {
  noStore(res)
  res.json(await service.getVenue(req.params.id, { origin: requestOrigin(req) }))
}
export async function approve(req, res) {
  await service.approve(req.user.id, req.params.id, req.body)
  res.status(204).end()
}
export async function reject(req, res) {
  await service.reject(req.user.id, req.params.id, req.body)
  res.status(204).end()
}
export async function requestChanges(req, res) {
  await service.requestChanges(req.user.id, req.params.id, req.body)
  res.status(204).end()
}
export async function suspend(req, res) {
  await service.suspend(req.user.id, req.params.id, req.body)
  res.status(204).end()
}
export async function unsuspend(req, res) {
  await service.unsuspend(req.user.id, req.params.id)
  res.status(204).end()
}
export async function bulkApprove(req, res) {
  res.json(await service.bulkApprove(req.user.id, req.body))
}
export async function listImages(req, res) {
  noStore(res)
  res.json(await service.listImages(req.query, { origin: requestOrigin(req) }))
}
export async function decideImage(req, res) {
  res.json(await service.decideImage(req.user.id, req.params.id, req.body))
}
export async function resendVenueEmail(req, res) {
  res.json(await service.resendVenueEmail(req.user.id, req.params.id, req.params.emailId))
}
export async function stats(_req, res) {
  noStore(res)
  res.json(await service.getStats())
}
export async function audit(req, res) {
  noStore(res)
  res.json(await service.listAudit(req.query))
}

export async function detectionStatus(_req, res) {
  noStore(res)
  res.json(await service.imageDetectionStatus())
}
export async function detectionTest(req, res) {
  noStore(res)
  res.json(await service.testImageDetection(req.user.id, req.file))
}

export async function listRevisions(req, res) {
  noStore(res)
  res.json(await service.listRevisions(req.query, { origin: requestOrigin(req) }))
}
export async function getRevision(req, res) {
  noStore(res)
  res.json(await service.getRevision(req.params.id, { origin: requestOrigin(req) }))
}
export async function approveRevision(req, res) {
  await service.approveRevision(req.user.id, req.params.id)
  res.status(204).end()
}
export async function rejectRevision(req, res) {
  await service.rejectRevision(req.user.id, req.params.id, req.body)
  res.status(204).end()
}

// ---------------------------------------------------------------- users (REQ-47, EUC-33)
export async function listUsers(req, res) {
  noStore(res)
  res.json(await usersService.listUsers(req.query))
}
export async function getUser(req, res) {
  noStore(res)
  res.json(await usersService.getUser(req.params.id))
}
export async function suspendUser(req, res) {
  res.json(await usersService.suspendUser(req.user.id, req.params.id, req.body))
}
export async function reactivateUser(req, res) {
  res.json(await usersService.reactivateUser(req.user.id, req.params.id, req.body))
}
export async function changeRole(req, res) {
  res.json(await usersService.changeRole(req.user.id, req.params.id, req.body))
}
export async function deleteUser(req, res) {
  res.json(await usersService.deleteUser(req.user.id, req.params.id, req.body))
}
