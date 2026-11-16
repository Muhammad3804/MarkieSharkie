import { hydrateDraft, toListingPayload } from '../features/host/draft.js'

// Host listing API, stubbed until the server exists. Drafts live in localStorage for now; later:
//   saveDraft     -> PUT  /api/owner/venue-drafts/current
//   loadDraft     -> GET  /api/owner/venue-drafts/current
//   submitListing -> POST /api/owner/venues (approval_status = 'pending', REQ-5/REQ-7), then each photo goes to
//                    POST /api/owner/venues/:id/images (REQ-8, AI check REQ-9)
// Storage can be blocked (private mode), so every read and write is guarded.
const DRAFT_KEY = 'markiesharkie:host-draft'
const SUBMISSION_KEY = 'markiesharkie:host-submission'

export function loadDraft() {
  try {
    return hydrateDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'))
  } catch {
    return null
  }
}

// Returns false when the draft couldn't be stored, so the UI can say so instead of claiming it saved.
export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch (error) {
    console.warn('[host] could not save the draft', error)
    return false
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // nothing stored, nothing to clear
  }
}

// Resolves with the created listing. The real endpoint creates the venue as approval_status 'pending'; an admin
// approves or rejects it with a reason (REQ-7) before customers can see it.
export async function submitListing(draft) {
  const payload = toListingPayload(draft)
  await new Promise((resolve) => setTimeout(resolve, 700))
  const result = {
    venueId: `draft-${Date.now().toString(36)}`,
    name: payload.venue.name,
    city: payload.venue.city,
    approvalStatus: 'pending',
    submittedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(SUBMISSION_KEY, JSON.stringify(result))
  } catch {
    // the success screen falls back to generic text
  }
  return result
}

export function loadLastSubmission() {
  try {
    const value = JSON.parse(localStorage.getItem(SUBMISSION_KEY) ?? 'null')
    return value && typeof value.name === 'string' ? value : null
  } catch {
    return null
  }
}
