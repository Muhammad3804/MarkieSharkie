import { requestOrigin } from '../../lib/origin.js'
import * as service from './service.js'

// Thin. Role is checked in the routes; party / ownership in the service.
const noStore = (res) => res.set('Cache-Control', 'no-store')

export async function upload(req, res) {
  res.status(201).json(await service.uploadEvidence(req.user, req.file))
}
export async function open(req, res) {
  res.status(201).json(await service.openDispute(req.user, req.params.id, req.body))
}
export async function listMine(req, res) {
  noStore(res)
  res.json(await service.listMyDisputes(req.user, req.query))
}
export async function getMine(req, res) {
  noStore(res)
  res.json(await service.getMyDispute(req.user, req.params.id))
}
export async function addNote(req, res) {
  res.status(201).json(await service.addPartyNote(req.user, req.params.id, req.body))
}
// Evidence photo: only parties and admins, never cached by shared caches, never sniffed as something else.
export async function file(req, res) {
  const { buffer, mimeType } = await service.readEvidence(req.user, req.params.id, req.params.fileId)
  res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' })
  res.send(buffer)
}
export async function reportVenue(req, res) {
  res.status(201).json(await service.reportVenue(req.user, req.params.id, req.body))
}

export async function adminList(req, res) {
  noStore(res)
  res.json(await service.adminListDisputes(req.query))
}
export async function adminGet(req, res) {
  noStore(res)
  res.json(await service.adminGetDispute(req.params.id, { origin: requestOrigin(req) }))
}
export async function adminTake(req, res) {
  res.json(await service.takeDispute(req.user.id, req.params.id))
}
export async function adminResolve(req, res) {
  res.json(await service.resolveDispute(req.user.id, req.params.id, req.body, { origin: requestOrigin(req) }))
}
export async function adminReject(req, res) {
  res.json(await service.rejectDispute(req.user.id, req.params.id, req.body, { origin: requestOrigin(req) }))
}
export async function adminNote(req, res) {
  res.status(201).json(await service.addAdminNote(req.user.id, req.params.id, req.body, { origin: requestOrigin(req) }))
}
export async function adminReports(req, res) {
  noStore(res)
  res.json(await service.adminListReports(req.query))
}
export async function adminTakeReport(req, res) {
  res.json(await service.takeReport(req.user.id, req.params.id))
}
export async function adminResolveReport(req, res) {
  res.json(await service.resolveReport(req.user.id, req.params.id, req.body))
}
