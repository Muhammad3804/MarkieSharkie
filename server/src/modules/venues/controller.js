import { requestOrigin } from '../../lib/origin.js'
import * as service from './service.js'

// Public, read-only. Anything that lists venues is never cached: an admin can approve or suspend a venue at any
// time and it must appear / disappear right away. Only the About page numbers are cached briefly.
export async function landing(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json({ sections: await service.getLanding({ origin: requestOrigin(req) }) })
}

export async function search(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await service.search(req.query, { origin: requestOrigin(req), user: req.user }))
}

export async function getVenue(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json({ venue: await service.getVenue(req.params.id, { origin: requestOrigin(req) }) })
}

export async function reviews(req, res) {
  res.set('Cache-Control', 'no-store') // a hidden review disappears at once
  res.json(await service.listReviews(req.params.id, req.query))
}

export async function availability(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await service.getAvailability(req.params.id, req.query))
}

export async function stats(_req, res) {
  res.set('Cache-Control', 'public, max-age=300')
  res.json(await service.getStats())
}
