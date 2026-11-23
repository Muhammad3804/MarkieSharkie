import * as service from './service.js'

// Thin. Host routes: req.user is a customer (ownership checked in the service). Public routes: no account.
const noStore = (res) => res.set('Cache-Control', 'no-store')

export async function getForBooking(req, res) {
  noStore(res)
  res.json(await service.getForBooking(req.user, req.params.id))
}
export async function saveForBooking(req, res) {
  const { invitation, created } = await service.saveForBooking(req.user, req.params.id, req.body)
  res.status(created ? 201 : 200).json({ invitation })
}
export async function mySummaries(req, res) {
  noStore(res)
  res.json(await service.mySummaries(req.user))
}
export async function listGuests(req, res) {
  noStore(res)
  res.json(await service.listGuests(req.user, req.params.id, req.query))
}
export async function addGuests(req, res) {
  res.status(201).json(await service.addGuests(req.user, req.params.id, req.body))
}
export async function removeGuest(req, res) {
  await service.removeGuest(req.user, req.params.id, req.params.guestId)
  res.status(204).end()
}
export async function send(req, res) {
  noStore(res)
  res.json(await service.sendInvitations(req.user, req.params.id, req.body))
}
export async function resend(req, res) {
  noStore(res)
  res.json(await service.resendGuest(req.user, req.params.id, req.params.guestId))
}
export async function newLink(req, res) {
  noStore(res)
  res.json(await service.newGuestLink(req.user, req.params.id, req.params.guestId))
}
export async function revoke(req, res) {
  await service.revokeGuest(req.user, req.params.id, req.params.guestId)
  res.status(204).end()
}
export async function publicView(req, res) {
  noStore(res)
  res.set('Referrer-Policy', 'no-referrer')
  res.json(await service.getByToken(req.params.token))
}
export async function rsvp(req, res) {
  noStore(res)
  res.json(await service.rsvpByToken(req.params.token, req.body))
}
