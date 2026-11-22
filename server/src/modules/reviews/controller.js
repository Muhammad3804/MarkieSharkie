import * as service from './service.js'

// Thin. Public report: req.user is customer / venue_owner / decorator. Admin routes: req.user is an admin.
export async function report(req, res) {
  res
    .status(201)
    .json(await service.reportReview(req.user, { venueId: req.params.id, reviewId: req.params.reviewId }, req.body))
}
export async function list(req, res) {
  res.set('Cache-Control', 'no-store')
  res.json(await service.listReviews(req.query))
}
export async function hide(req, res) {
  res.json(await service.hideReview(req.user.id, req.params.id, req.body))
}
export async function restore(req, res) {
  res.json(await service.restoreReview(req.user.id, req.params.id, req.body))
}
export async function dismiss(req, res) {
  res.json(await service.dismissReports(req.user.id, req.params.id, req.body))
}
export async function remove(req, res) {
  res.json(await service.deleteReview(req.user.id, req.params.id, req.body))
}
