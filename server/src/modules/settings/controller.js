import * as service from './service.js'

// Thin. Admin role is checked in the routes.
export async function getAiThreshold(_req, res) {
  res.set('Cache-Control', 'no-store').json(await service.getAiThreshold())
}
export async function updateAiThreshold(req, res) {
  res.json(await service.updateAiThreshold(req.user.id, req.body))
}
