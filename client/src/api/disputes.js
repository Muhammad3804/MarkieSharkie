import { apiFetch } from './http.js'

// Disputes for the two parties of a booking (server/openapi.yaml "Disputes", REQ-48, EUC-35, srs-alignment #41):
// the customer or the venue owner reports a problem, both see it and reply; an admin decides. Evidence photos are
// private: uploaded first, attached by id, and shown through blob URLs fetched with the user's token.

export const DISPUTE_CATEGORIES = [
  { value: 'service_not_as_described', label: 'Service not as agreed', hint: 'Menu, decor, staff or facilities differed from the booking.' },
  { value: 'cancellation_refund', label: 'Cancellation or refund', hint: 'A cancellation, or the refund that was agreed.' },
  { value: 'pricing', label: 'Pricing or charges', hint: 'Extra charges or a price different from the booking.' },
  { value: 'damage', label: 'Damage', hint: 'Damage to the venue or to your belongings.' },
  { value: 'conduct', label: 'Behaviour', hint: 'How staff, guests or the other side behaved.' },
  { value: 'other', label: 'Something else', hint: '' },
]
export const categoryLabel = (value) => DISPUTE_CATEGORIES.find((c) => c.value === value)?.label ?? value

export const OUTCOME_LABELS = {
  upheld: 'Upheld',
  partially_upheld: 'Partly upheld',
  dismissed: 'Dismissed',
}

export const DISPUTE_STATUS_LABELS = {
  open: 'Waiting for an admin',
  under_review: 'An admin is reviewing',
  resolved: 'Resolved',
  rejected: 'Closed without a decision',
}

export const DESCRIPTION_MIN = 20
export const MAX_EVIDENCE = 5

const enc = encodeURIComponent

// -> { fileId, mimeType, size }. 415 / 413 for a wrong type or size (JPEG / PNG up to 5 MB).
export function uploadEvidence(file) {
  const form = new FormData()
  form.append('file', file)
  return apiFetch('/disputes/uploads', { method: 'POST', body: form })
}

// -> { dispute }. 409 DISPUTE_EXISTS (already one open from you), NOT_DISPUTABLE (booking not confirmed yet).
export function openDispute(bookingId, { category, description, evidenceIds = [] }) {
  return apiFetch(`/bookings/${enc(bookingId)}/disputes`, {
    method: 'POST',
    body: { category, description: description.trim(), evidenceIds },
  })
}

// status: open | closed | all -> { data, page, pageCount, total }
export function listMyDisputes({ status = 'all', page = 1, pageSize = 20 } = {}) {
  return apiFetch(`/disputes?${new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) })}`)
}

// -> { [bookingId]: dispute } for the open disputes on the user's bookings (for the "View problem" links).
export async function openDisputesByBooking() {
  const { data } = await listMyDisputes({ status: 'open', pageSize: 50 })
  const byBooking = {}
  for (const d of data) if (!byBooking[d.bookingId] || d.raisedByYou) byBooking[d.bookingId] = d
  return byBooking
}

export function getDispute(id) {
  return apiFetch(`/disputes/${enc(id)}`)
}

export function replyToDispute(id, body) {
  return apiFetch(`/disputes/${enc(id)}/notes`, { method: 'POST', body: { body: body.trim() } })
}

// A private evidence photo as an object URL (revoke it when done).
export async function evidenceObjectUrl(apiPath) {
  return URL.createObjectURL(await apiFetch(apiPath.replace(/^\/api/, ''), { as: 'blob' }))
}

// "Report this listing" (signed in). 409 REPORT_EXISTS / OWN_VENUE.
export function reportVenue(venueId, { reason, details }) {
  return apiFetch(`/venues/${enc(venueId)}/reports`, { method: 'POST', body: { reason, details: details.trim() } })
}
