import { hydrateDraft } from '../features/host/draft.js'
import { readPhotoFiles, savePhoto } from '../features/host/photoStore.js'
import { getSessionUser } from './auth.js'
import { ApiError, apiFetch } from './http.js'
import { listingToDraft } from './listings.js'

// Host listing API (server/openapi.yaml "Owner"). The wizard keeps working synchronously on a local copy of the
// draft (localStorage, so typing never waits for the network) and every change is also saved to the server
// (PUT /api/owner/draft, debounced): the server copy is the source of truth and follows the owner across devices
// (syncDraftFromServer). Photo files stay in this browser's IndexedDB until submit, which uploads them first.
// Only venue owners have a server draft; for anyone else the local copy is all there is.
const DRAFT_KEY = 'markiesharkie:host-draft'
const SUBMISSION_KEY = 'markiesharkie:host-submission'
const SAVE_DELAY = 1500

const isOwner = () => getSessionUser()?.role === 'venue_owner'

function readLocal() {
  try {
    return hydrateDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'))
  } catch {
    return null
  }
}

function writeLocal(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch (error) {
    console.warn('[host] could not save the draft on this device', error)
    return false
  }
}

export function loadDraft() {
  return readLocal()
}

// Debounced server save; the latest draft wins. Errors are logged, the local copy is kept.
let pending = null
let timer = null
function scheduleServerSave(draft) {
  if (!isOwner()) return
  pending = draft
  clearTimeout(timer)
  timer = setTimeout(flushServerSave, SAVE_DELAY)
}
export async function flushServerSave() {
  clearTimeout(timer)
  const draft = pending
  pending = null
  if (!draft || !isOwner()) return
  try {
    await apiFetch('/owner/draft', { method: 'PUT', body: { venueId: draft.listingId ?? null, draft } })
  } catch (error) {
    console.warn('[host] the draft is saved on this device but not on the server yet', error)
  }
}

// Returns false when the draft couldn't be stored locally, so the UI can say so instead of claiming it saved.
export function saveDraft(draft) {
  const ok = writeLocal(draft)
  scheduleServerSave(draft)
  return ok
}

export function clearDraft() {
  const venueId = readLocal()?.listingId ?? null
  pending = null
  clearTimeout(timer)
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // nothing stored, nothing to clear
  }
  if (isOwner()) {
    const query = venueId ? `?venueId=${encodeURIComponent(venueId)}` : ''
    apiFetch(`/owner/draft${query}`, { method: 'DELETE' }).catch(() => {})
  }
}

// GET /api/owner/draft: the server's draft replaces the local one when it is newer (another device, or this one's
// storage was cleared). Returns the draft now in use (or null).
export async function syncDraftFromServer() {
  const local = readLocal()
  if (!isOwner()) return local
  try {
    const query = local?.listingId ? `?venueId=${encodeURIComponent(local.listingId)}` : ''
    const { draft } = await apiFetch(`/owner/draft${query}`)
    const remote = hydrateDraft(draft)
    if (remote && (!local || Date.parse(remote.updatedAt ?? 0) > Date.parse(local.updatedAt ?? 0))) {
      writeLocal(remote)
      return remote
    }
    if (local && !remote) scheduleServerSave(local) // first sync of a draft started before logging in
  } catch (error) {
    console.warn('[host] could not load the draft from the server', error)
  }
  return local
}

// ---------------------------------------------------------------- submit

// A file from the wizard's IndexedDB -> POST /api/owner/uploads -> uploadId.
async function uploadFile(kind, blob, name) {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', blob, name)
  const { uploadId } = await apiFetch('/owner/uploads', { method: 'POST', body: form })
  return uploadId
}

// Runs tasks a few at a time (uploads), keeping their order in the results.
async function inBatches(tasks, size = 3) {
  const results = []
  for (let i = 0; i < tasks.length; i += size) results.push(...(await Promise.all(tasks.slice(i, i + size).map((task) => task()))))
  return results
}

export class SubmitError extends Error {
  constructor(message, fieldErrors = {}) {
    super(message)
    this.name = 'SubmitError'
    this.fieldErrors = fieldErrors
  }
}

// The wizard draft -> the server's submission body (same paths as the wizard fields, so a server field error
// matches a field). Files are referenced by the upload ids from `ids`.
export function toSubmission(draft, ids) {
  const v = draft.venue
  const rules = draft.bookingRules
  return {
    venue: {
      category: v.category,
      name: v.name,
      hostingSince: v.hostingSince,
      city: v.city,
      street: v.street,
      area: v.area,
      postalCode: v.postalCode,
      lat: v.lat,
      lng: v.lng,
      googleMapsUrl: v.googleMapsUrl,
      landmark: v.landmark,
      landmarkMinutes: v.landmarkMinutes,
      directions: v.directions,
      supportedEvents: v.supportedEvents,
      facilities: v.facilities,
      customFacilities: v.customFacilities,
      parkingSpaces: v.parkingSpaces,
      headline: v.headline,
      description: v.description,
      houseRules: v.houseRules,
      customHouseRules: v.customHouseRules,
    },
    halls: draft.halls.map((hall) => ({
      hallId: hall.hallId,
      name: hall.name,
      capacity: hall.capacity,
      standingCapacity: hall.standingCapacity,
      setting: hall.setting,
      hasAc: hall.hasAc,
      lengthFt: hall.lengthFt,
      widthFt: hall.widthFt,
      ceilingFt: hall.ceilingFt,
      description: hall.description,
      floorPlanUploadId: hall.floorPlan ? ids[hall.floorPlan.fileId] : null,
      zones: hall.zones,
      walkthrough:
        hall.walkthrough.mode === 'upload'
          ? { mode: 'upload', uploadId: ids[hall.walkthrough.file?.fileId] }
          : hall.walkthrough.mode === 'link'
            ? { mode: 'link', url: hall.walkthrough.url }
            : { mode: hall.walkthrough.mode },
    })),
    bridalSuite: draft.bridalSuite.enabled
      ? { enabled: true, name: draft.bridalSuite.name, capacity: draft.bridalSuite.capacity, lengthFt: draft.bridalSuite.lengthFt, widthFt: draft.bridalSuite.widthFt, description: draft.bridalSuite.description }
      : { enabled: false },
    venueImages: draft.venueImages.map((image) => ({ uploadId: ids[image.imageId], hallId: image.hallId, category: image.category, isCover: image.isCover })),
    menuPackages: draft.menuPackages.map((menu) => ({
      name: menu.name,
      description: menu.description,
      pricePerHead: menu.pricePerHead,
      minGuests: menu.minGuests,
      isCustomizable: draft.customMenu.accepts && menu.isCustomizable,
      sections: menu.sections.filter((section) => section.items.length).map((section) => ({ name: section.name, items: section.items.map((item) => ({ name: item.name })) })),
    })),
    customMenu: { accepts: draft.customMenu.accepts, note: draft.customMenu.note },
    addOns: draft.addOns.map((addOn) => ({ type: addOn.type, name: addOn.name, description: addOn.description, price: addOn.price })),
    bookingRules: {
      days: rules.days,
      slots: rules.slots,
      advancePercent: rules.advancePercent,
      cancellationPolicy: rules.cancellationPolicy,
      customPolicy:
        rules.cancellationPolicy === 'custom'
          ? { tiers: rules.customPolicy.tiers.map(({ fromDays, toDays, refundPercent }) => ({ fromDays, toDays, refundPercent })), note: rules.customPolicy.note }
          : null,
    },
  }
}

// Uploads the wizard's files (photos, floor plans, walkthroughs) and submits the listing: POST /api/owner/venues,
// or PUT /api/owner/venues/:id when it is a resubmission (draft.listingId). Resolves with { venueId, name, city,
// approvalStatus, submittedAt }. Throws SubmitError with a message for the person and the server's field errors.
export async function submitListing(draft) {
  if (!isOwner()) throw new SubmitError('Only venue owner accounts can list a venue. Log in with your venue owner account.')
  const files = [
    ...draft.venueImages.map((image) => ({ id: image.imageId, kind: 'photo', name: image.fileName || 'photo.jpg' })),
    ...draft.halls.flatMap((hall) => [
      hall.floorPlan && { id: hall.floorPlan.fileId, kind: 'floor_plan', name: hall.floorPlan.fileName || 'floor-plan' },
      hall.walkthrough.mode === 'upload' && hall.walkthrough.file && { id: hall.walkthrough.file.fileId, kind: 'walkthrough', name: hall.walkthrough.file.fileName || 'walkthrough' },
    ]),
  ].filter(Boolean)
  const blobs = await readPhotoFiles(files.map((f) => f.id))
  const missing = files.filter((f) => !blobs[f.id])
  if (missing.length) throw new SubmitError('Some photos or files are no longer saved on this device. Remove the ones marked “not available” and add them again.')

  let uploaded
  try {
    uploaded = await inBatches(files.map((f) => () => uploadFile(f.kind, blobs[f.id], f.name)))
  } catch (error) {
    throw new SubmitError(error instanceof ApiError ? error.message : 'We couldn’t upload your photos. Check your connection and try again.')
  }
  const ids = Object.fromEntries(files.map((f, index) => [f.id, uploaded[index]]))
  const body = toSubmission(draft, ids)

  let result
  try {
    result = draft.listingId
      ? await apiFetch(`/owner/venues/${encodeURIComponent(draft.listingId)}`, { method: 'PUT', body })
      : await apiFetch('/owner/venues', { method: 'POST', body })
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    const first = Object.values(error.fieldErrors)[0]
    throw new SubmitError(first ? `${error.message} ${first}` : error.message, error.fieldErrors)
  }
  pending = null
  clearTimeout(timer)
  const submission = {
    venueId: result.venue.id,
    name: draft.venue.name.trim(),
    city: draft.venue.city,
    approvalStatus: result.venue.approvalStatus,
    submittedAt: result.venue.submittedAt,
  }
  try {
    localStorage.setItem(SUBMISSION_KEY, JSON.stringify(submission))
  } catch {
    // the success screen falls back to generic text
  }
  return submission
}

// GET /api/owner/venues -> live status for the "Listing submitted" screen: { status, rejectionReason, changesNote,
// suspensionReason, decidedAt, isActive, photoChecks } or null when the listing isn't in this account.
export async function getSubmissionStatus(venueId) {
  const { data } = await apiFetch('/owner/venues')
  const venue = data.find((v) => v.id === venueId)
  if (!venue) return null
  return {
    status: venue.approvalStatus,
    rejectionReason: venue.rejectionReason,
    changesNote: venue.changesNote,
    suspensionReason: venue.suspensionReason,
    decidedAt: venue.reviewedAt,
    isActive: venue.isActive,
    photoChecks: venue.photoChecks,
  }
}

// GET /api/owner/venues -> the owner's listings with status (REQ-7) and photo check results (REQ-9).
export async function listMyVenues() {
  const { data } = await apiFetch('/owner/venues')
  return data
}

// "Edit and resubmit" after the admin asked for changes (or rejected it): puts the submitted listing and its files
// back into the wizard. Submitting again updates the same listing (back to 'pending').
export async function reopenListingForChanges(venueId) {
  const { listing } = await apiFetch(`/owner/venues/${encodeURIComponent(venueId)}`)
  if (listing.status !== 'changes_requested' && listing.status !== 'rejected') return false
  const { draft, files } = listingToDraft(listing)
  await Promise.all(
    files.map(async (file) => {
      const response = await fetch(file.url)
      if (response.ok) await savePhoto(file.id, await response.blob())
    }),
  )
  return saveDraft({ ...draft, listingId: listing.id, lastStep: 'review', updatedAt: new Date().toISOString() })
}

export function loadLastSubmission() {
  try {
    const value = JSON.parse(localStorage.getItem(SUBMISSION_KEY) ?? 'null')
    return value && typeof value.name === 'string' ? value : null
  } catch {
    return null
  }
}
