import crypto from 'node:crypto'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { getStorage, keyFromUrl } from '../../integrations/storage.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { detectFileType, UPLOAD_RULES } from '../../lib/fileType.js'
import { logger } from '../../lib/logger.js'
import { validationError } from '../../lib/validation.js'
import { countPendingImages, queueVerification } from '../venues/imageVerification.js'
import { absolute } from '../venues/mappers.js'
import { intOrNull, money, paisa } from './money.js'
import * as repo from './repository.js'

// Venue owner's listings (REQ-5, REQ-6, REQ-8, REQ-11, EUC-04 to 08). Every venue read or write checks that the
// venue belongs to the logged-in owner; another owner's venue answers 404 (never 403, so ids can't be probed).

export const UPLOADS_PER_DAY = 300
const RESUBMITTABLE = new Set(['changes_requested', 'rejected'])
const notYours = () => notFoundError('We couldn’t find that listing in your account.')
const invalidStatus = (status) =>
  new AppError(409, 'INVALID_STATUS', `This listing is ${status.replace('_', ' ')}, so it can’t be changed right now.`)

// ---------------------------------------------------------------- drafts (autosave, replaces localStorage)

export async function getDraft(ownerId, { venueId = null }) {
  if (venueId && !(await repo.isOwner(pool, { venueId, ownerId }))) throw notYours()
  const row = await repo.findDraft(pool, { ownerId, venueId })
  return { draft: row?.data ?? null, updatedAt: row?.updated_at ?? null }
}

export async function saveDraft(ownerId, { venueId, draft }) {
  if (venueId && !(await repo.isOwner(pool, { venueId, ownerId }))) throw notYours()
  return { updatedAt: await repo.upsertDraft(pool, { ownerId, venueId, data: draft }) }
}

export async function deleteDraft(ownerId, { venueId = null }) {
  if (venueId && !(await repo.isOwner(pool, { venueId, ownerId }))) throw notYours()
  await repo.deleteDraft(pool, { ownerId, venueId })
}

// ---------------------------------------------------------------- uploads (REQ-8, REQ-11)

// file = multer's { buffer, size, originalname }. The real type comes from the bytes; the name and the browser's
// Content-Type are ignored. Stored under a random name; nothing is attached to a venue until the listing is submitted.
export async function upload(ownerId, { kind, file }, { origin }) {
  const rules = UPLOAD_RULES[kind]
  if (!file?.buffer?.length) throw validationError([{ field: 'file', message: 'Choose a file to upload.' }])
  const type = detectFileType(file.buffer)
  if (!type || !rules.types.includes(type.mime)) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', rules.label, [{ field: 'file', message: rules.label }])
  }
  const max = kind === 'walkthrough' && type.mime === 'image/jpeg' ? rules.jpegMaxBytes : rules.maxBytes
  if (file.size > max) {
    throw new AppError(413, 'FILE_TOO_LARGE', rules.label, [{ field: 'file', message: rules.label }])
  }
  if ((await repo.countRecentUploads(pool, ownerId)) >= UPLOADS_PER_DAY) {
    throw new AppError(429, 'UPLOAD_LIMIT', `You can upload up to ${UPLOADS_PER_DAY} files a day. Try again tomorrow.`)
  }
  const saved = await getStorage().save(file.buffer, { folder: `venues/owner-${ownerId}`, ext: type.ext })
  try {
    const row = await repo.insertUpload(pool, {
      ownerId,
      kind,
      storageKey: saved.key,
      mimeType: type.mime,
      size: file.size,
    })
    return { uploadId: row.upload_id, kind, url: absolute(origin, saved.url), mimeType: type.mime, size: file.size }
  } catch (err) {
    await getStorage()
      .remove(saved.key)
      .catch(() => {})
    throw err
  }
}

// ---------------------------------------------------------------- submit / resubmit (REQ-5 -> admin approval)

// The venue row from the validated body. Derived columns are computed here, never taken from the client:
// capacity = largest hall, base_price = cheapest package per head, venue_type from the halls' settings.
function venueColumns(body) {
  const v = body.venue
  const settings = new Set(body.halls.map((h) => h.setting))
  const prices = body.menuPackages.map((m) => paisa(m.pricePerHead))
  const rules = body.bookingRules
  return {
    name: v.name,
    address: [v.street, v.area, v.city, v.postalCode].filter(Boolean).join(', '),
    city: v.city,
    lat: v.lat,
    lng: v.lng,
    venueType: settings.size === 1 ? [...settings][0] : 'semi_outdoor',
    supportedEvents: [...new Set(v.supportedEvents)],
    capacity: Math.max(...body.halls.map((h) => Number(h.capacity))),
    basePrice: money(Math.min(...prices)),
    facilities: [...new Set([...v.facilities, ...v.customFacilities])],
    description: v.description,
    category: v.category,
    headline: v.headline,
    area: v.area,
    postalCode: v.postalCode || null,
    googleMapsUrl: v.googleMapsUrl || null,
    hostingSince: intOrNull(v.hostingSince),
    landmark: v.landmark || null,
    landmarkMinutes: intOrNull(v.landmarkMinutes),
    directions: v.directions || null,
    parkingSpaces: intOrNull(v.parkingSpaces),
    houseRules: [...new Set([...v.houseRules, ...v.customHouseRules])],
    customMenuNote: body.customMenu.accepts ? body.customMenu.note || null : null,
    advancePercent: Number(rules.advancePercent),
    cancellationPolicy: rules.cancellationPolicy,
    cancellationNote: rules.cancellationPolicy === 'custom' ? rules.customPolicy?.note || null : null,
    bookingDays: [...new Set(rules.days)],
  }
}

// Loads and checks every referenced upload: it must be this owner's, of the right kind, and either unused or
// already attached to this venue. Returns uploadId -> row.
async function claimUploads(client, ownerId, body, venueId) {
  const wanted = [
    ...body.venueImages.map((i) => ({ id: i.uploadId, kind: 'photo', path: 'venueImages' })),
    ...body.halls.flatMap((h, index) => [
      h.floorPlanUploadId && { id: h.floorPlanUploadId, kind: 'floor_plan', path: `halls.${index}.floorPlan` },
      h.walkthrough.mode === 'upload' && {
        id: h.walkthrough.uploadId,
        kind: 'walkthrough',
        path: `halls.${index}.walkthrough.file`,
      },
    ]),
  ].filter(Boolean)
  const rows = await repo.findUploadsForUpdate(client, { ownerId, ids: wanted.map((w) => w.id) })
  const byId = new Map(rows.map((r) => [r.upload_id, r]))
  const problems = []
  for (const want of wanted) {
    const row = byId.get(want.id)
    if (!row || row.kind !== want.kind || (row.venue_id && row.venue_id !== venueId)) {
      problems.push({ field: want.path, message: 'This file isn’t available any more. Remove it and upload it again.' })
    }
  }
  if (problems.length) throw validationError(problems)
  return byId
}

async function writeChildren(client, venueId, body, uploads) {
  const hallIds = new Map()
  for (const [index, h] of body.halls.entries()) {
    const id = crypto.randomUUID()
    hallIds.set(h.hallId, id)
    const plan = h.floorPlanUploadId ? uploads.get(h.floorPlanUploadId) : null
    await repo.insertHall(client, venueId, {
      hallId: id,
      name: h.name,
      capacity: Number(h.capacity),
      standingCapacity: intOrNull(h.standingCapacity),
      setting: h.setting,
      hasAc: h.hasAc,
      lengthFt: Number(h.lengthFt),
      widthFt: Number(h.widthFt),
      ceilingFt: Number(h.ceilingFt),
      description: h.description,
      floorPlanUrl: plan ? getStorage().urlFor(plan.storage_key) : null,
      floorPlanType: plan ? (plan.mime_type === 'application/pdf' ? 'pdf' : 'image') : null,
      zones: h.zones,
      walkthroughMode: h.walkthrough.mode,
      walkthroughUrl: h.walkthrough.mode === 'link' ? h.walkthrough.url : null,
      sortOrder: index,
    })
    if (h.walkthrough.mode === 'upload') {
      const file = uploads.get(h.walkthrough.uploadId)
      await repo.insertWalkthrough(client, venueId, {
        hallId: id,
        assetType: file.mime_type === 'model/gltf-binary' ? 'model_3d' : 'panorama_360',
        url: getStorage().urlFor(file.storage_key),
      })
    }
  }

  await repo.insertImages(
    client,
    venueId,
    body.venueImages.map((image, sortOrder) => {
      const file = uploads.get(image.uploadId)
      return {
        hallId: image.hallId === null ? null : hallIds.get(image.hallId),
        category: image.category,
        url: getStorage().urlFor(file.storage_key),
        sortOrder,
        isCover: image.isCover,
        mimeType: file.mime_type,
        size: file.size_bytes,
      }
    }),
  )

  for (const [index, menu] of body.menuPackages.entries()) {
    await repo.insertMenu(client, venueId, {
      name: menu.name,
      description: menu.description,
      pricePerHead: money(paisa(menu.pricePerHead)),
      isCustomizable: body.customMenu.accepts && menu.isCustomizable,
      minGuests: Number(menu.minGuests),
      sortOrder: index,
      items: menu.sections.flatMap((s) =>
        s.items.map((item) => ({ name: item.name, category: s.name.replace(/\s+/g, ' ') })),
      ),
    })
  }
  for (const addOn of body.addOns)
    await repo.insertAddOn(client, venueId, { ...addOn, price: money(paisa(addOn.price)) })
  if (body.bridalSuite.enabled) {
    const s = body.bridalSuite
    await repo.insertBridalSuite(client, venueId, {
      name: s.name,
      capacity: Number(s.capacity),
      lengthFt: intOrNull(s.lengthFt),
      widthFt: intOrNull(s.widthFt),
      description: s.description,
    })
  }
  for (const type of ['lunch', 'dinner']) {
    const slot = body.bookingRules.slots[type]
    if (slot.enabled) await repo.insertSlotTemplate(client, venueId, { type, start: slot.start, end: slot.end })
  }
  if (body.bookingRules.cancellationPolicy === 'custom') {
    for (const t of body.bookingRules.customPolicy?.tiers ?? []) {
      await repo.insertTier(client, venueId, {
        fromDays: Number(t.fromDays),
        toDays: intOrNull(t.toDays),
        refundPercent: Number(t.refundPercent),
      })
    }
  }
}

function afterCommit(venueId, oldUrls, keptUrls) {
  queueVerification(venueId)
  // Files the resubmission no longer uses (best effort; a leftover file is harmless).
  for (const url of oldUrls) {
    const key = keyFromUrl(url)
    if (key && !keptUrls.has(url))
      getStorage()
        .remove(key)
        .catch((err) => logger.warn({ err: { message: err.message } }, 'could not remove an old upload'))
  }
}

// POST /api/owner/venues: one transaction creates the venue (pending) and everything in it, attaches the files and
// clears the owner's new-listing draft. Image checks start after the commit.
export async function submitListing(ownerId, body) {
  const venueId = crypto.randomUUID()
  const result = await withTransaction(async (client) => {
    const uploads = await claimUploads(client, ownerId, body, venueId)
    const venue = await repo.insertVenue(client, { venueId, ownerId, venue: venueColumns(body) })
    await writeChildren(client, venueId, body, uploads)
    await repo.attachUploads(client, { venueId, ids: [...uploads.keys()] })
    await repo.deleteDraft(client, { ownerId, venueId: null })
    return venue
  })
  afterCommit(venueId, [], new Set())
  return { venue: { id: result.venue_id, approvalStatus: result.approval_status, submittedAt: result.submitted_at } }
}

// PUT /api/owner/venues/:id: resubmit after the admin asked for changes or rejected it (REQ-5, srs-alignment #18).
export async function resubmitListing(ownerId, venueId, body) {
  let oldUrls = []
  const keptUrls = new Set()
  const result = await withTransaction(async (client) => {
    const current = await repo.findOwnedVenueForUpdate(client, { venueId, ownerId })
    if (!current) throw notYours()
    if (!RESUBMITTABLE.has(current.approval_status)) throw invalidStatus(current.approval_status)
    const uploads = await claimUploads(client, ownerId, body, venueId)
    for (const row of uploads.values()) keptUrls.add(getStorage().urlFor(row.storage_key))
    oldUrls = await repo.deleteVenueChildren(client, venueId)
    const venue = await repo.updateVenue(client, { venueId, ownerId, venue: venueColumns(body) })
    await writeChildren(client, venueId, body, uploads)
    await repo.attachUploads(client, { venueId, ids: [...uploads.keys()] })
    await repo.deleteDraft(client, { ownerId, venueId })
    return venue
  })
  afterCommit(venueId, oldUrls, keptUrls)
  return { venue: { id: result.venue_id, approvalStatus: result.approval_status, submittedAt: result.submitted_at } }
}

// ---------------------------------------------------------------- my venues

const PHOTO_STATUSES = ['pending', 'genuine', 'flagged', 'approved', 'rejected']

export async function listMyVenues(ownerId, { origin }) {
  const rows = await repo.listOwnerVenues(pool, ownerId)
  return {
    data: rows.map((r) => ({
      id: r.venue_id,
      name: r.name,
      city: r.city,
      area: r.area,
      approvalStatus: r.approval_status,
      isActive: r.is_active,
      rejectionReason: r.rejection_reason,
      changesNote: r.changes_note,
      suspensionReason: r.suspension_reason,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      coverUrl: r.cover_url ? absolute(origin, r.cover_url) : null,
      revision: r.revision, // latest edit of a live venue: { id, status, submittedAt, decidedAt, note } or null
      photoChecks: Object.fromEntries(PHOTO_STATUSES.map((s) => [s, r.photo_checks?.[s] ?? 0])),
    })),
  }
}

// REQ-9 "service down -> owner asked to retry later": checks the photos still pending again.
export async function retryImageChecks(ownerId, venueId) {
  if (!(await repo.isOwner(pool, { venueId, ownerId }))) throw notYours()
  const pending = await countPendingImages(venueId)
  if (pending) queueVerification(venueId)
  return { pending }
}
