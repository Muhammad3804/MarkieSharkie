import { ApiError, apiFetch } from './http.js'

// Invitations API (server/openapi.yaml "Invitations", EUC-25, 26, 27; srs-alignment #39). Everything is stored on
// the server: the invitation of a confirmed booking, its guests with their delivery status, and their replies.
// Each guest has a personal link /i/<token>; the server keeps only a hash of the token, so a link is shown once
// (after sending) and "New link" replaces it.

export class InvitationError extends Error {
  // code: NOT_FOUND | NOT_CONFIRMED | EVENT_PASSED | VALIDATION | GUEST_EXISTS | INVITATION_NOT_FOUND | RSVP_CLOSED | ...
  constructor(code, message, fieldErrors = {}) {
    super(message)
    this.name = 'InvitationError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

async function call(path, options) {
  try {
    return await apiFetch(path, options)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    const code = error.code === 'VALIDATION_ERROR' ? 'VALIDATION' : error.code
    const first = Object.values(error.fieldErrors)[0]
    throw new InvitationError(code, code === 'VALIDATION' && first ? first : error.message, error.fieldErrors)
  }
}
const enc = encodeURIComponent

// ---------------------------------------------------------------------------------------------------------------
// Host (the booking's customer)

// -> { booking, facts, invitation | null, totals | null }
export async function getInvitationContext(bookingId) {
  const data = await call(`/bookings/${enc(bookingId)}/invitation`)
  const b = data.booking
  const facts = {
    eventDate: b.eventDate,
    startTime: b.startTime,
    endTime: b.endTime,
    venueName: b.venueName,
    hallName: b.hallName,
    venueAddress: b.venueAddress,
    lat: b.lat,
    lng: b.lng,
    mapsUrl: b.mapsUrl,
    hallCapacity: b.hallCapacity,
    bookedGuests: b.guestCount,
  }
  const booking = { ...b, date: b.eventDate }
  return { booking, facts, invitation: data.invitation, totals: data.totals }
}

// PUT /api/bookings/:id/invitation (create or update; one per booking). REQ-36: confirmed bookings only.
export async function saveInvitation(bookingId, draft) {
  const { invitation } = await call(`/bookings/${enc(bookingId)}/invitation`, {
    method: 'PUT',
    body: {
      template: draft.template,
      title: draft.title.trim(),
      eventType: draft.eventType,
      hostNames: draft.hostNames.trim(),
      message: draft.message.trim(),
      dressCode: (draft.dressCode ?? '').trim(),
      notes: (draft.notes ?? '').trim(),
      contactPhone: draft.contactPhone.trim(),
      rsvpBy: draft.rsvpBy || '',
    },
  })
  return invitation
}

// status: all | attending | declined | awaiting | not_delivered -> { guests, totals }
export function listGuests(invitationId, { status = 'all', q = '' } = {}) {
  const params = new URLSearchParams({ status })
  if (q.trim()) params.set('q', q.trim())
  return call(`/invitations/${enc(invitationId)}/guests?${params}`)
}

export function addGuests(invitationId, guests) {
  return call(`/invitations/${enc(invitationId)}/guests`, { method: 'POST', body: { guests } })
}

export function removeGuest(invitationId, guestId) {
  return call(`/invitations/${enc(invitationId)}/guests/${enc(guestId)}`, { method: 'DELETE' })
}

// -> { results: [{ guestId, name, link, delivery: 'sent' | 'failed' | 'manual', error }] }. Links are shown once.
export function sendInvitations(invitationId, guestIds = null) {
  return call(`/invitations/${enc(invitationId)}/send`, { method: 'POST', body: guestIds ? { guestIds } : {} })
}

export function resendGuest(invitationId, guestId) {
  return call(`/invitations/${enc(invitationId)}/guests/${enc(guestId)}/resend`, { method: 'POST', body: {} })
}

export function newGuestLink(invitationId, guestId) {
  return call(`/invitations/${enc(invitationId)}/guests/${enc(guestId)}/link`, { method: 'POST', body: {} })
}

export function revokeGuest(invitationId, guestId) {
  return call(`/invitations/${enc(invitationId)}/guests/${enc(guestId)}/revoke`, { method: 'POST', body: {} })
}

// GET /api/invitations -> { [bookingId]: { invitationId, title, invited, attending, declined, awaiting, people } }
export async function listMyInvitationSummaries() {
  const { data } = await call('/invitations')
  return Object.fromEntries(data.map((s) => [s.bookingId, s]))
}

// ---------------------------------------------------------------------------------------------------------------
// Guest (no account, by the token in their link)

// -> { invitation, guest: { name, reply }, rsvpOpen }. INVITATION_NOT_FOUND for a bad, expired or revoked link.
export function getGuestInvitation(token) {
  return call(`/i/${enc(token)}`, { auth: false })
}

// { response: 'yes' | 'no', partySize, note } -> { reply }
export function replyToInvitation(token, { response, partySize, note }) {
  return call(`/i/${enc(token)}/rsvp`, { method: 'PUT', auth: false, body: { response, partySize: response === 'yes' ? partySize : 1, note } })
}
