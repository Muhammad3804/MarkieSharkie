import { requestOrigin } from '../../lib/origin.js'
import * as edits from './editService.js'
import * as service from './service.js'

// Thin: read the request, call one service, shape the response. req.user is a venue_owner (requireRole).

export async function getDraft(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await service.getDraft(req.user.id, { venueId: req.query.venueId ?? null }))
}

export async function putDraft(req, res) {
  res.json(await service.saveDraft(req.user.id, req.body))
}

export async function deleteDraft(req, res) {
  await service.deleteDraft(req.user.id, { venueId: req.query.venueId ?? null })
  res.status(204).end()
}

export async function upload(req, res) {
  res
    .status(201)
    .json(await service.upload(req.user.id, { kind: req.body.kind, file: req.file }, { origin: requestOrigin(req) }))
}

export async function submit(req, res) {
  res.status(201).json(await service.submitListing(req.user.id, req.body))
}

export async function resubmit(req, res) {
  res.json(await service.resubmitListing(req.user.id, req.params.id, req.body))
}

export async function listMine(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await service.listMyVenues(req.user.id, { origin: requestOrigin(req) }))
}

export async function getMine(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await edits.getMyListing(req.user.id, req.params.id, { origin: requestOrigin(req) }))
}

export async function retryChecks(req, res) {
  res.status(202).json(await service.retryImageChecks(req.user.id, req.params.id))
}

// ---------------------------------------------------------------- live venues (EUC-04, EUC-07, srs-alignment #35)

export async function editLive(req, res) {
  res.json(await edits.editLiveListing(req.user.id, req.params.id, req.body, { origin: requestOrigin(req) }))
}

export async function getRevision(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await edits.getMyRevision(req.user.id, req.params.id, { origin: requestOrigin(req) }))
}

export async function withdrawRevision(req, res) {
  await edits.withdrawRevision(req.user.id, req.params.id)
  res.status(204).end()
}

export async function deactivate(req, res) {
  res.json(await edits.setActive(req.user.id, req.params.id, false, req.body))
}

export async function reactivate(req, res) {
  res.json(await edits.setActive(req.user.id, req.params.id, true))
}

export async function createMenu(req, res) {
  res.status(201).json(await edits.createMenu(req.user.id, req.params.id, req.body))
}

export async function updateMenu(req, res) {
  res.json(await edits.updateMenu(req.user.id, req.params.id, req.params.menuId, req.body))
}

export async function deleteMenu(req, res) {
  await edits.deleteMenu(req.user.id, req.params.id, req.params.menuId)
  res.status(204).end()
}

export async function createAddOn(req, res) {
  res.status(201).json(await edits.createAddOn(req.user.id, req.params.id, req.body))
}

export async function updateAddOn(req, res) {
  res.json(await edits.updateAddOn(req.user.id, req.params.id, req.params.addOnId, req.body))
}

export async function deleteAddOn(req, res) {
  await edits.deleteAddOn(req.user.id, req.params.id, req.params.addOnId)
  res.status(204).end()
}
