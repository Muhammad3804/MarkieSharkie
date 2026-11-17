import { hydrateDraft } from '../features/host/draft.js'
import { readPhotoFiles, savePhoto } from '../features/host/photoStore.js'
import { createListing, getListingRecord, readListingFiles } from './listings.js'

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

// Resolves with the created listing. The listing goes into the mock listings store (api/listings.js) as
// approval_status 'pending'; an admin approves, rejects with a reason (REQ-7) or asks for changes before customers
// can see it. The photo, floor plan and walkthrough files are copied out of the wizard's IndexedDB first, because
// the wizard clears that store once this resolves.
export async function submitListing(draft) {
  const fileIds = [
    ...draft.venueImages.map((image) => image.imageId),
    ...draft.halls.flatMap((hall) => [hall.floorPlan?.fileId, hall.walkthrough.mode === 'upload' ? hall.walkthrough.file?.fileId : null]).filter(Boolean),
  ]
  const files = await readPhotoFiles(fileIds)
  await new Promise((resolve) => setTimeout(resolve, 500))
  const listing = await createListing({ draft, files })
  const result = {
    venueId: listing.id,
    name: listing.payload.venue.name,
    city: listing.payload.venue.city,
    approvalStatus: listing.status,
    submittedAt: listing.submittedAt,
  }
  try {
    localStorage.setItem(SUBMISSION_KEY, JSON.stringify(result))
  } catch {
    // the success screen falls back to generic text
  }
  return result
}

// Live approval status for the "Listing submitted" screen: { status, rejectionReason, changesNote, decidedAt }
// or null when the listing is gone (e.g. demo data was reset). Later: GET /api/owner/venues/:id.
export function getSubmissionStatus(venueId) {
  const listing = getListingRecord(venueId)
  if (!listing) return null
  return { status: listing.status, rejectionReason: listing.rejectionReason, changesNote: listing.changesNote, decidedAt: listing.decidedAt, isActive: listing.isActive }
}

// "Edit and resubmit" after the admin asked for changes: puts the submitted draft and its files back into the
// wizard. Submitting it again updates the same listing (back to 'pending') instead of creating a new one.
export async function reopenListingForChanges(venueId) {
  const listing = getListingRecord(venueId)
  if (!listing || listing.status !== 'changes_requested') return false
  const files = await readListingFiles(listing)
  await Promise.all(Object.entries(files).map(([id, blob]) => savePhoto(id, blob)))
  return saveDraft({ ...listing.draft, listingId: listing.id, lastStep: 'review', updatedAt: new Date().toISOString() })
}

export function loadLastSubmission() {
  try {
    const value = JSON.parse(localStorage.getItem(SUBMISSION_KEY) ?? 'null')
    return value && typeof value.name === 'string' ? value : null
  } catch {
    return null
  }
}
