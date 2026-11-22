import { ApiError, apiFetch } from './http.js'

// Reviews (REQ-42 to REQ-44, server/openapi.yaml). Reporting needs a login (customer, venue owner or decorator).
export const REVIEW_REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'offensive', label: 'Rude, hateful or offensive' },
  { value: 'fake', label: 'Fake or not about a real event' },
  { value: 'off_topic', label: 'Not about this venue' },
  { value: 'personal_info', label: 'Shares someone’s personal details' },
  { value: 'other', label: 'Something else' },
]

export class ReportError extends Error {
  constructor(message, { code, field } = {}) {
    super(message)
    this.name = 'ReportError'
    this.code = code
    this.field = field
  }
}

// POST /api/venues/:id/reviews/:reviewId/report -> resolves when sent. ReportError carries the server's message
// (already reported, your own review, the details note).
export async function reportReview(venueId, reviewId, { reason, note }) {
  try {
    await apiFetch(`/venues/${encodeURIComponent(venueId)}/reviews/${encodeURIComponent(reviewId)}/report`, {
      method: 'POST',
      body: note ? { reason, note } : { reason },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401) {
      const field = Object.keys(error.fieldErrors)[0]
      throw new ReportError(field ? error.fieldErrors[field] : error.message, { code: error.code, field })
    }
    throw error
  }
}
