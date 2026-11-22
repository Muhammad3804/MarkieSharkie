import { readPhotoFiles, savePhoto } from '../features/host/photoStore.js'
import { SubmitError, toSubmission } from './host.js'
import { ApiError, apiFetch } from './http.js'
import { listingToDraft } from './listings.js'

// Owner "My listings" (EUC-04, EUC-07, server/openapi.yaml "Owner", srs-alignment #35).
//   GET    /api/owner/venues                      -> my listings with status and the latest edit request
//   GET    /api/owner/venues/:id                  -> the listing (with a pending edit laid over it) + latest revision
//   PUT    /api/owner/venues/:id/edit             -> save edits of a live venue: some go live now, REQ-5 fields wait
//   DELETE /api/owner/venues/:id/revision         -> withdraw the pending edit
//   POST   /api/owner/venues/:id/deactivate | reactivate

export async function listMyListings() {
  const { data } = await apiFetch('/owner/venues')
  return data
}

// The listing as a wizard draft for the editor. Its photos and files are copied into this browser's photo store
// (the wizard's steps read them from there); `original` remembers which ones are already on the server, so saving
// only uploads what is new.
export async function loadListingForEdit(venueId) {
  const { listing, revision } = await apiFetch(`/owner/venues/${encodeURIComponent(venueId)}`)
  const { draft, files } = listingToDraft(listing)
  await Promise.all(
    files.map(async (file) => {
      try {
        const response = await fetch(file.url)
        if (response.ok) await savePhoto(file.id, await response.blob())
      } catch {
        // shown as "not available" in the step; the server copy is kept unless the owner removes it
      }
    }),
  )
  const original = {
    photoIds: new Set(listing.images.map((image) => image.imageId)),
    plans: new Set(listing.halls.filter((h) => h.floorPlan && !h.floorPlan.uploadId).map((h) => `plan-${h.hallId}`)),
    walks: new Set(listing.halls.filter((h) => h.walkthrough.file && !h.walkthrough.file.uploadId).map((h) => `walk-${h.hallId}`)),
    menuIds: new Set(listing.menuPackages.map((m) => m.menuId)),
    addOnIds: new Set(listing.addOns.map((a) => a.addOnId)),
  }
  return {
    draft: { ...draft, listingId: listing.id },
    original,
    fileIds: files.map((f) => f.id),
    approvalStatus: listing.status,
    isActive: listing.isActive,
    revision,
    name: listing.venue.name,
  }
}

async function uploadFile(kind, blob, name) {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', blob, name)
  const { uploadId } = await apiFetch('/owner/uploads', { method: 'POST', body: form })
  return uploadId
}

// Saves the editor's draft: new photos / files are uploaded first, everything already on the server is referenced by
// id. -> { applied, needsApproval, revision, revisionAction }. Throws SubmitError with the server's field errors.
export async function saveListingEdits(venueId, draft, original) {
  const pendingUpload = (meta) => meta?.uploadId && meta.fileId // already uploaded, waiting in the pending edit
  const files = [
    ...draft.venueImages.filter((image) => !original.photoIds.has(image.imageId)).map((image) => ({ id: image.imageId, kind: 'photo', name: image.fileName || 'photo.jpg' })),
    ...draft.halls.flatMap((hall) => [
      hall.floorPlan && !original.plans.has(hall.floorPlan.fileId) && !pendingUpload(hall.floorPlan) && { id: hall.floorPlan.fileId, kind: 'floor_plan', name: hall.floorPlan.fileName || 'floor-plan' },
      hall.walkthrough.mode === 'upload' && hall.walkthrough.file && !original.walks.has(hall.walkthrough.file.fileId) && !pendingUpload(hall.walkthrough.file) && { id: hall.walkthrough.file.fileId, kind: 'walkthrough', name: hall.walkthrough.file.fileName || 'walkthrough' },
    ]),
  ].filter(Boolean)
  const blobs = await readPhotoFiles(files.map((f) => f.id))
  if (files.some((f) => !blobs[f.id])) throw new SubmitError('Some new photos or files are no longer saved on this device. Remove the ones marked “not available” and add them again.')

  const ids = {}
  try {
    for (const f of files) ids[f.id] = await uploadFile(f.kind, blobs[f.id], f.name)
  } catch (error) {
    throw new SubmitError(error instanceof ApiError ? error.message : 'We couldn’t upload your photos. Check your connection and try again.')
  }

  const body = toSubmission(draft, ids)
  body.venueImages = draft.venueImages.map((image, index) => {
    const { uploadId, ...rest } = body.venueImages[index]
    return original.photoIds.has(image.imageId) ? { ...rest, imageId: image.imageId } : { ...rest, uploadId }
  })
  body.halls = draft.halls.map((hall, index) => {
    const out = { ...body.halls[index], keepFloorPlan: false }
    const plan = hall.floorPlan
    if (plan && original.plans.has(plan.fileId)) {
      out.floorPlanUploadId = null
      out.keepFloorPlan = true
    } else if (plan?.uploadId) out.floorPlanUploadId = plan.uploadId
    const walk = hall.walkthrough
    if (walk.mode === 'upload' && walk.file) {
      if (original.walks.has(walk.file.fileId)) out.walkthrough = { mode: 'upload', keep: true }
      else if (walk.file.uploadId) out.walkthrough = { mode: 'upload', uploadId: walk.file.uploadId }
    }
    return out
  })
  body.menuPackages = draft.menuPackages.map((menu, index) => (original.menuIds.has(menu.menuId) ? { ...body.menuPackages[index], menuId: menu.menuId } : body.menuPackages[index]))
  body.addOns = draft.addOns.map((addOn, index) => (original.addOnIds.has(addOn.addOnId) ? { ...body.addOns[index], addOnId: addOn.addOnId } : body.addOns[index]))

  try {
    return await apiFetch(`/owner/venues/${encodeURIComponent(venueId)}/edit`, { method: 'PUT', body })
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    const first = Object.values(error.fieldErrors)[0]
    throw new SubmitError(first && first !== error.message ? `${error.message} ${first}` : error.message, error.fieldErrors)
  }
}

export function withdrawEdits(venueId) {
  return apiFetch(`/owner/venues/${encodeURIComponent(venueId)}/revision`, { method: 'DELETE' })
}

export function setListingActive(venueId, active, reason) {
  return apiFetch(`/owner/venues/${encodeURIComponent(venueId)}/${active ? 'reactivate' : 'deactivate'}`, {
    method: 'POST',
    body: active || !reason ? {} : { reason },
  })
}
