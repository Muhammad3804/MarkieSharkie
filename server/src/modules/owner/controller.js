import { requestOrigin } from '../../lib/origin.js'
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
  res.json(await service.getMyVenue(req.user.id, req.params.id, { origin: requestOrigin(req) }))
}

export async function retryChecks(req, res) {
  res.status(202).json(await service.retryImageChecks(req.user.id, req.params.id))
}
