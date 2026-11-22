import crypto from 'node:crypto'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { getStorage, keyFromUrl } from '../../integrations/storage.js'
import { AppError, notFoundError } from '../../lib/AppError.js'
import { logger } from '../../lib/logger.js'
import { validationError } from '../../lib/validation.js'
import { queueVerification } from '../venues/imageVerification.js'
import { toListing } from '../venues/mappers.js'
import { generateSlots, loadVenueBundle } from '../venues/repository.js'
import * as edits from './editRepository.js'
import { intOrNull, money, paisa } from './money.js'
import * as repo from './repository.js'
import { approvalFromBody, approvalFromBundle, overlayRevision, revisionDiff, sameApproval } from './revisionModel.js'

// Editing a live venue (EUC-04, EUC-07, REQ-5, REQ-6; policy in docs/srs-alignment.md #35):
//   * go live at once: headline, directions, landmark, parking, house rules, Google Maps link, hosting since,
//     custom menu note, photos (new ones still pass the AI check, REQ-9), menu packages and add-ons (REQ-6);
//   * wait for the admin (REQ-5 "changed venue goes to Admin approval before customers see it"): name, type, address,
//     map pin, events, amenities, description, halls, bridal suite, booking rules -> one pending venue_revisions row.
//     The live version stays public and bookable meanwhile.
// Packages and add-ons a booking points at are never changed: editing archives the old row and creates a new one,
// removing archives it. Every write locks the venue row, checks ownership and is logged in owner_activity_log.

const SLOT_DAYS = 60
const notYours = () => notFoundError('We couldn’t find that listing in your account.')
const liveOnly = (status) =>
  new AppError(
    409,
    'INVALID_STATUS',
    status === 'suspended'
      ? 'This listing is suspended, so it can’t be edited. Contact support.'
      : `This listing is ${status.replace('_', ' ')}. Use “Edit and resubmit” until it’s approved.`,
  )
const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))
const urlFor = (row) => getStorage().urlFor(row.storage_key)

async function lockOwned(client, ownerId, venueId) {
  const venue = await edits.lockVenue(client, venueId)
  if (!venue || venue.owner_id !== ownerId) throw notYours() // another owner's venue: 404, ids can't be probed
  return venue
}

async function lockLive(client, ownerId, venueId) {
  const venue = await lockOwned(client, ownerId, venueId)
  if (venue.approval_status !== 'approved') throw liveOnly(venue.approval_status)
  return venue
}

function removeFiles(urls) {
  for (const url of urls) {
    const key = keyFromUrl(url)
    if (key)
      getStorage()
        .remove(key)
        .catch((err) => logger.warn({ err: { message: err.message } }, 'could not remove an old upload'))
  }
}

// ---------------------------------------------------------------- menus and add-ons

function menuData(m, sortOrder, acceptsCustom = true) {
  return {
    name: m.name,
    description: m.description ?? '',
    pricePerHead: money(paisa(m.pricePerHead)),
    isCustomizable: acceptsCustom && Boolean(m.isCustomizable),
    minGuests: Number(m.minGuests),
    sortOrder,
    items: m.sections.flatMap((s) =>
      s.items.map((item) => ({ name: item.name, category: s.name.replace(/\s+/g, ' ') })),
    ),
  }
}

const sameMenu = (row, d) =>
  row.name === d.name &&
  row.description === d.description &&
  row.price_per_head === d.pricePerHead &&
  row.is_customizable === d.isCustomizable &&
  row.min_guests === d.minGuests &&
  JSON.stringify(row.items) === JSON.stringify(d.items.map((i) => ({ name: i.name, category: i.category })))

// Changes one package; a package a booking uses is archived and replaced. -> the live menu id.
async function writeMenu(client, venueId, row, data) {
  if (sameMenu(row, data)) {
    if (row.sort_order !== data.sortOrder) await edits.setMenuOrder(client, row.menu_id, data.sortOrder)
    return { menuId: row.menu_id, changed: false }
  }
  if (await edits.menuInUse(client, row.menu_id)) {
    await edits.archiveMenu(client, row.menu_id)
    return { menuId: await edits.insertMenuReturning(client, venueId, data), changed: true, replaced: row.menu_id }
  }
  await edits.updateMenu(client, row.menu_id, data)
  return { menuId: row.menu_id, changed: true }
}

async function removeMenu(client, menuId) {
  if (await edits.menuInUse(client, menuId)) await edits.archiveMenu(client, menuId)
  else await edits.deleteMenu(client, menuId)
}

async function syncMenus(client, venueId, body) {
  const current = await edits.activeMenus(client, venueId)
  const byId = new Map(current.map((m) => [m.menu_id, m]))
  const seen = new Set()
  let changed = 0
  for (const [index, m] of body.menuPackages.entries()) {
    const data = menuData(m, index, body.customMenu.accepts)
    if (m.menuId) {
      seen.add(m.menuId)
      if ((await writeMenu(client, venueId, byId.get(m.menuId), data)).changed) changed++
    } else {
      await edits.insertMenuReturning(client, venueId, data)
      changed++
    }
  }
  for (const row of current) {
    if (seen.has(row.menu_id)) continue
    await removeMenu(client, row.menu_id)
    changed++
  }
  return changed
}

const addOnData = (a) => ({
  type: a.type,
  name: a.name,
  description: a.description ?? '',
  price: money(paisa(a.price)),
})
const sameAddOn = (row, a) =>
  row.type === a.type && row.name === a.name && row.description === a.description && row.price === a.price

async function writeAddOn(client, venueId, row, data) {
  if (sameAddOn(row, data)) return { addOnId: row.add_on_id, changed: false }
  if (await edits.addOnInUse(client, row.add_on_id)) {
    await edits.archiveAddOn(client, row.add_on_id)
    return { addOnId: await edits.insertAddOnReturning(client, venueId, data), changed: true, replaced: row.add_on_id }
  }
  await edits.updateAddOn(client, row.add_on_id, data)
  return { addOnId: row.add_on_id, changed: true }
}

async function removeAddOn(client, addOnId) {
  if (await edits.addOnInUse(client, addOnId)) await edits.archiveAddOn(client, addOnId)
  else await edits.deleteAddOn(client, addOnId)
}

async function syncAddOns(client, venueId, body) {
  const current = await edits.activeAddOns(client, venueId)
  const byId = new Map(current.map((a) => [a.add_on_id, a]))
  const seen = new Set()
  let changed = 0
  for (const a of body.addOns) {
    const data = addOnData(a)
    if (a.addOnId) {
      seen.add(a.addOnId)
      if ((await writeAddOn(client, venueId, byId.get(a.addOnId), data)).changed) changed++
    } else {
      await edits.insertAddOnReturning(client, venueId, data)
      changed++
    }
  }
  for (const row of current) {
    if (seen.has(row.add_on_id)) continue
    await removeAddOn(client, row.add_on_id)
    changed++
  }
  return changed
}

// ---------------------------------------------------------------- PUT /owner/venues/:id/edit

const LIVE_LABELS = {
  headline: 'Title',
  landmark: 'Landmark',
  landmarkMinutes: 'Minutes from the landmark',
  directions: 'Directions',
  parkingSpaces: 'Parking spaces',
  houseRules: 'House rules',
  googleMapsUrl: 'Google Maps link',
  hostingSince: 'Hosting since',
  customMenuNote: 'Custom menu note',
}

function liveColumns(body) {
  const v = body.venue
  return {
    headline: v.headline,
    landmark: v.landmark || null,
    landmarkMinutes: intOrNull(v.landmarkMinutes),
    directions: v.directions || null,
    parkingSpaces: intOrNull(v.parkingSpaces),
    houseRules: [...new Set([...v.houseRules, ...v.customHouseRules])],
    googleMapsUrl: v.googleMapsUrl || null,
    hostingSince: intOrNull(v.hostingSince),
    customMenuNote: body.customMenu.accepts ? body.customMenu.note || null : null,
  }
}

function liveColumnsFromRow(v) {
  return {
    headline: v.headline,
    landmark: v.landmark,
    landmarkMinutes: v.landmark_minutes,
    directions: v.directions,
    parkingSpaces: v.parking_spaces,
    houseRules: v.house_rules ?? [],
    googleMapsUrl: v.google_maps_url,
    hostingSince: v.hosting_since,
    customMenuNote: v.custom_menu_note,
  }
}

// Every id in the body must be this venue's: photos, kept files, packages, add-ons. Uploads must be the owner's.
async function checkReferences(client, ownerId, venueId, body, bundle) {
  const problems = []
  const images = new Set(bundle.images.map((i) => i.image_id))
  const halls = new Map(bundle.halls.map((h) => [h.hall_id, h]))
  const walks = new Set(bundle.walkthroughs.map((w) => w.hall_id))
  const menus = new Set(bundle.menus.map((m) => m.menu_id))
  const addOns = new Set(bundle.addOns.map((a) => a.add_on_id))
  const gone = 'This was removed in the meantime. Reload the page and try again.'
  body.venueImages.forEach((image, i) => {
    if (image.imageId && !images.has(image.imageId)) problems.push({ field: `venueImages.${i}`, message: gone })
  })
  body.halls.forEach((h, i) => {
    const live = halls.get(h.hallId)
    if (h.keepFloorPlan && !live?.floor_plan_url) problems.push({ field: `halls.${i}.floorPlan`, message: gone })
    if (h.walkthrough.mode === 'upload' && h.walkthrough.keep && !walks.has(h.hallId))
      problems.push({ field: `halls.${i}.walkthrough.file`, message: gone })
  })
  body.menuPackages.forEach((m, i) => {
    if (m.menuId && !menus.has(m.menuId)) problems.push({ field: `menuPackages.${i}`, message: gone })
  })
  body.addOns.forEach((a, i) => {
    if (a.addOnId && !addOns.has(a.addOnId)) problems.push({ field: `addOns.${i}`, message: gone })
  })

  const wanted = [
    ...body.venueImages.flatMap((img, i) =>
      img.uploadId ? [{ id: img.uploadId, kind: 'photo', path: `venueImages.${i}` }] : [],
    ),
    ...body.halls.flatMap((h, i) => [
      ...(h.floorPlanUploadId ? [{ id: h.floorPlanUploadId, kind: 'floor_plan', path: `halls.${i}.floorPlan` }] : []),
      ...(h.walkthrough.mode === 'upload' && h.walkthrough.uploadId
        ? [{ id: h.walkthrough.uploadId, kind: 'walkthrough', path: `halls.${i}.walkthrough.file` }]
        : []),
    ]),
  ]
  const rows = wanted.length ? await repo.findUploadsForUpdate(client, { ownerId, ids: wanted.map((w) => w.id) }) : []
  const byId = new Map(rows.map((r) => [r.upload_id, { ...r, url: urlFor(r) }]))
  for (const w of wanted) {
    const row = byId.get(w.id)
    if (!row || row.kind !== w.kind || (row.venue_id && row.venue_id !== venueId))
      problems.push({ field: w.path, message: 'This file isn’t available any more. Remove it and upload it again.' })
  }
  if (problems.length) throw validationError(problems)
  return byId
}

// Photos go live at once (new ones are checked by the AI detector first, REQ-9). A photo of a hall that only exists
// in the pending revision is saved without a hall and linked when the admin approves (newHallPhotos).
async function syncPhotos(client, venueId, body, uploads, bundle) {
  const liveHalls = new Set(bundle.halls.map((h) => h.hall_id))
  const hallFor = (id) => (id && liveHalls.has(id) ? id : null)
  const before = JSON.stringify(bundle.images.map((i) => [i.image_id, i.hall_id, i.category, i.is_cover]))
  const removedUrls = await edits.deleteImagesExcept(
    client,
    venueId,
    body.venueImages.filter((i) => i.imageId).map((i) => i.imageId),
  )
  await edits.clearCovers(client, venueId)
  for (const [sortOrder, image] of body.venueImages.entries()) {
    if (!image.imageId) continue
    await edits.updateImage(client, venueId, {
      imageId: image.imageId,
      hallId: hallFor(image.hallId),
      category: image.category,
      sortOrder,
      isCover: image.isCover,
    })
  }
  const added = body.venueImages.map((image, sortOrder) => ({ image, sortOrder })).filter((x) => x.image.uploadId)
  const inserted = added.length
    ? await edits.insertImagesReturning(
        client,
        venueId,
        added.map(({ image, sortOrder }) => {
          const file = uploads.get(image.uploadId)
          return {
            hallId: hallFor(image.hallId),
            category: image.category,
            url: file.url,
            sortOrder,
            isCover: image.isCover,
            mimeType: file.mime_type,
            size: file.size_bytes,
          }
        }),
      )
    : []
  const newIds = new Map(added.map(({ image }, n) => [image.uploadId, inserted[n].image_id]))
  const newHallPhotos = body.venueImages
    .filter((image) => image.hallId && !liveHalls.has(image.hallId))
    .map((image) => ({ imageId: image.imageId ?? newIds.get(image.uploadId), hallId: image.hallId }))
  const after = JSON.stringify(
    body.venueImages.filter((i) => i.imageId).map((i) => [i.imageId, hallFor(i.hallId), i.category, i.isCover]),
  )
  return {
    removedUrls,
    inserted: inserted.length,
    newHallPhotos,
    changed: removedUrls.length > 0 || inserted.length > 0 || before !== after,
  }
}

export async function editLiveListing(ownerId, venueId, body, { origin }) {
  let removed = []
  let newPhotos = 0
  const result = await withTransaction(async (client) => {
    await lockLive(client, ownerId, venueId)
    const bundle = await loadVenueBundle(client, venueId, { publishedOnly: false })
    const uploads = await checkReferences(client, ownerId, venueId, body, bundle)

    // A hall a booking uses can't be proposed for removal (checked again when the admin approves).
    const kept = new Set(body.halls.map((h) => h.hallId))
    for (const hall of bundle.halls) {
      if (!kept.has(hall.hall_id) && (await edits.hallInUse(client, hall.hall_id)))
        throw validationError([{ field: 'halls', message: `${hall.name} has bookings, so it can’t be removed.` }])
    }

    // 1. What goes live now.
    const liveBefore = liveColumnsFromRow(bundle.base)
    const liveAfter = liveColumns(body)
    await edits.updateLiveFields(client, venueId, liveAfter)
    const photos = await syncPhotos(client, venueId, body, uploads, bundle)
    removed = photos.removedUrls
    newPhotos = photos.inserted
    const menusChanged = await syncMenus(client, venueId, body)
    const addOnsChanged = await syncAddOns(client, venueId, body)
    await edits.recomputeBasePrice(client, venueId)
    const photoUploads = body.venueImages.filter((i) => i.uploadId).map((i) => i.uploadId)
    if (photoUploads.length) await repo.attachUploads(client, { venueId, ids: photoUploads })

    const applied = Object.keys(LIVE_LABELS)
      .filter((key) => JSON.stringify(liveBefore[key] ?? null) !== JSON.stringify(liveAfter[key] ?? null))
      .map((key) => LIVE_LABELS[key])
    if (photos.changed) applied.push('Photos')
    if (menusChanged) applied.push('Menu packages')
    if (addOnsChanged) applied.push('Add-ons')

    // 2. What needs the admin (REQ-5): one pending revision per venue, replaced by a newer proposal.
    const current = approvalFromBundle(bundle)
    const proposed = { ...approvalFromBody(body, uploads), newHallPhotos: photos.newHallPhotos }
    const pending = await edits.findPendingRevision(client, venueId, { lock: true })
    let revision = null
    let revisionAction = 'none'
    if (!sameApproval(proposed, current)) {
      revision = pending
        ? await edits.replaceRevision(client, pending.revision_id, { changes: proposed, previous: current })
        : await edits.insertRevision(client, { venueId, ownerId, changes: proposed, previous: current })
      revisionAction = pending ? 'replaced' : 'created'
    } else if (pending) {
      // The owner put everything back the way it is live: nothing left for the admin to review.
      await edits.setRevisionStatus(client, pending.revision_id, { status: 'withdrawn' })
      revisionAction = 'withdrawn'
    }
    const needsApproval = revision ? revisionDiff(current, proposed, origin).map((row) => row.label) : []

    await edits.insertOwnerActivity(client, {
      ownerId,
      action: 'venue.edit',
      targetId: venueId,
      details: { applied, needsApproval, revisionId: revision?.revision_id ?? null, revisionAction },
    })
    return {
      venueId,
      applied,
      needsApproval,
      revision: revision
        ? { id: revision.revision_id, status: revision.status, submittedAt: iso(revision.submitted_at) }
        : null,
      revisionAction,
    }
  })
  if (newPhotos) queueVerification(venueId)
  removeFiles(removed)
  return result
}

// ---------------------------------------------------------------- the owner's view of a listing and its revision

function toRevision(row, origin) {
  if (!row) return null
  return {
    id: row.revision_id,
    status: row.status,
    submittedAt: iso(row.submitted_at),
    decidedAt: iso(row.decided_at),
    note: row.admin_note,
    changes: revisionDiff(row.previous, row.changes, origin),
  }
}

// GET /owner/venues/:id: the live listing with a pending proposal laid over it, so the editor shows what the owner
// last asked for, plus the latest revision's status.
export async function getMyListing(ownerId, venueId, { origin }) {
  if (!(await repo.isOwner(pool, { venueId, ownerId }))) throw notYours()
  const bundle = await loadVenueBundle(pool, venueId, { publishedOnly: false })
  const listing = toListing(bundle, origin)
  const pending = await edits.findPendingRevision(pool, venueId)
  const latest = pending ?? (await edits.latestRevision(pool, venueId))
  return {
    listing: pending ? overlayRevision(listing, pending.changes, origin) : listing,
    revision: toRevision(latest, origin),
  }
}

export async function getMyRevision(ownerId, venueId, { origin }) {
  if (!(await repo.isOwner(pool, { venueId, ownerId }))) throw notYours()
  return { revision: toRevision(await edits.latestRevision(pool, venueId), origin) }
}

export async function withdrawRevision(ownerId, venueId) {
  await withTransaction(async (client) => {
    await lockOwned(client, ownerId, venueId)
    const pending = await edits.findPendingRevision(client, venueId, { lock: true })
    if (!pending) throw new AppError(409, 'NO_PENDING_CHANGES', 'There are no changes waiting for review.')
    await edits.setRevisionStatus(client, pending.revision_id, { status: 'withdrawn' })
    await edits.insertOwnerActivity(client, {
      ownerId,
      action: 'venue.revision_withdraw',
      targetId: venueId,
      details: { revisionId: pending.revision_id },
    })
  })
}

// ---------------------------------------------------------------- deactivate / reactivate (REQ-5)

// Hidden from search, its page and new bookings (public = approved AND is_active). Confirmed bookings stay valid;
// requests already made stay with the owner to accept or reject (docs/booking-engine.md).
export async function setActive(ownerId, venueId, active, { reason } = {}) {
  return withTransaction(async (client) => {
    const venue = await lockOwned(client, ownerId, venueId)
    if (!['approved', 'suspended'].includes(venue.approval_status)) {
      throw new AppError(
        409,
        'INVALID_STATUS',
        'Only an approved listing can be deactivated or reactivated. This one isn’t live yet.',
      )
    }
    if (venue.is_active === active) {
      return { venue: { id: venueId, isActive: active, approvalStatus: venue.approval_status }, changed: false }
    }
    const row = await edits.setActive(client, venueId, active)
    await edits.insertOwnerActivity(client, {
      ownerId,
      action: active ? 'venue.reactivate' : 'venue.deactivate',
      targetId: venueId,
      details: reason ? { reason } : {},
    })
    return { venue: { id: venueId, isActive: row.is_active, approvalStatus: row.approval_status }, changed: true }
  })
}

// ---------------------------------------------------------------- one package / add-on at a time (EUC-07)

async function largestHall(client, venueId) {
  const { halls } = await loadVenueBundle(client, venueId, { publishedOnly: false })
  return Math.max(...halls.map((h) => h.capacity))
}

async function checkMinGuests(client, venueId, minGuests) {
  const largest = await largestHall(client, venueId)
  if (Number(minGuests) > largest)
    throw validationError([
      {
        field: 'minGuests',
        message: `Your largest hall seats ${largest.toLocaleString('en-US')}, so the minimum can’t be higher.`,
      },
    ])
}

function checkDishes(body) {
  const dishes = body.sections.reduce((sum, s) => sum + s.items.length, 0)
  if (dishes === 0) throw validationError([{ field: 'sections', message: 'Add at least one dish to any section.' }])
}

async function findMenu(client, venueId, menuId) {
  const row = (await edits.activeMenus(client, venueId)).find((m) => m.menu_id === menuId)
  if (!row) throw notFoundError('We couldn’t find that menu package.')
  return row
}

async function afterMenuChange(client, ownerId, venueId, action, details) {
  await edits.recomputeBasePrice(client, venueId)
  await edits.insertOwnerActivity(client, { ownerId, action, targetId: venueId, details })
}

export async function createMenu(ownerId, venueId, body) {
  return withTransaction(async (client) => {
    await lockLive(client, ownerId, venueId)
    checkDishes(body)
    await checkMinGuests(client, venueId, body.minGuests)
    if ((await edits.activeMenus(client, venueId)).length >= 10)
      throw new AppError(409, 'TOO_MANY_MENUS', 'You can have up to 10 packages. Remove one first.')
    const menuId = await edits.insertMenuReturning(
      client,
      venueId,
      menuData(body, await edits.nextMenuOrder(client, venueId)),
    )
    await afterMenuChange(client, ownerId, venueId, 'menu.create', { menuId, name: body.name })
    return { menu: { menuId } }
  })
}

export async function updateMenu(ownerId, venueId, menuId, body) {
  return withTransaction(async (client) => {
    await lockLive(client, ownerId, venueId)
    const row = await findMenu(client, venueId, menuId)
    checkDishes(body)
    await checkMinGuests(client, venueId, body.minGuests)
    const result = await writeMenu(client, venueId, row, menuData(body, row.sort_order))
    await afterMenuChange(client, ownerId, venueId, 'menu.update', {
      menuId: result.menuId,
      replaced: result.replaced ?? null,
    })
    return { menu: { menuId: result.menuId }, replacedMenuId: result.replaced ?? null, changed: result.changed }
  })
}

export async function deleteMenu(ownerId, venueId, menuId) {
  await withTransaction(async (client) => {
    await lockLive(client, ownerId, venueId)
    await findMenu(client, venueId, menuId)
    if ((await edits.activeMenus(client, venueId)).length <= 1)
      throw new AppError(409, 'LAST_MENU', 'A live listing needs at least one menu package. Add another one first.')
    const archived = await edits.menuInUse(client, menuId)
    await removeMenu(client, menuId)
    await afterMenuChange(client, ownerId, venueId, 'menu.delete', { menuId, archived })
  })
}

async function findAddOn(client, venueId, addOnId) {
  const row = (await edits.activeAddOns(client, venueId)).find((a) => a.add_on_id === addOnId)
  if (!row) throw notFoundError('We couldn’t find that add-on.')
  return row
}

export async function createAddOn(ownerId, venueId, body) {
  return withTransaction(async (client) => {
    await lockLive(client, ownerId, venueId)
    if ((await edits.activeAddOns(client, venueId)).length >= 10)
      throw new AppError(409, 'TOO_MANY_ADD_ONS', 'You can have up to 10 add-ons. Remove one first.')
    const addOnId = await edits.insertAddOnReturning(client, venueId, addOnData(body))
    await edits.insertOwnerActivity(client, {
      ownerId,
      action: 'add_on.create',
      targetId: venueId,
      details: { addOnId },
    })
    return { addOn: { addOnId } }
  })
}

export async function updateAddOn(ownerId, venueId, addOnId, body) {
  return withTransaction(async (client) => {
    await lockLive(client, ownerId, venueId)
    const row = await findAddOn(client, venueId, addOnId)
    const result = await writeAddOn(client, venueId, row, addOnData(body))
    await edits.insertOwnerActivity(client, {
      ownerId,
      action: 'add_on.update',
      targetId: venueId,
      details: { addOnId: result.addOnId, replaced: result.replaced ?? null },
    })
    return { addOn: { addOnId: result.addOnId }, replacedAddOnId: result.replaced ?? null, changed: result.changed }
  })
}

export async function deleteAddOn(ownerId, venueId, addOnId) {
  await withTransaction(async (client) => {
    await lockLive(client, ownerId, venueId)
    await findAddOn(client, venueId, addOnId)
    const archived = await edits.addOnInUse(client, addOnId)
    await removeAddOn(client, addOnId)
    await edits.insertOwnerActivity(client, {
      ownerId,
      action: 'add_on.delete',
      targetId: venueId,
      details: { addOnId, archived },
    })
  })
}

// ---------------------------------------------------------------- applying an approved revision (admin)

const VENUE_TYPE = (halls) => {
  const settings = new Set(halls.map((h) => h.setting))
  return settings.size === 1 ? [...settings][0] : 'semi_outdoor'
}

// Runs inside the admin's transaction with the venue and revision rows locked. Halls are updated in place (same
// ids), so their slots and bookings stay attached. -> { removedUrls } (files to delete after the commit).
export async function applyRevision(client, revision) {
  const venueId = revision.venue_id
  const c = revision.changes
  const bundle = await loadVenueBundle(client, venueId, { publishedOnly: false })
  const live = new Map(bundle.halls.map((h) => [h.hall_id, h]))
  const removedUrls = []

  const kept = new Set(c.halls.map((h) => h.hallId))
  for (const hall of bundle.halls) {
    if (kept.has(hall.hall_id)) continue
    if (await edits.hallInUse(client, hall.hall_id))
      throw new AppError(
        409,
        'HALL_IN_USE',
        `${hall.name} has bookings now, so it can’t be removed. Reject this edit and ask the owner to keep the hall.`,
      )
    removedUrls.push(...(await edits.deleteHall(client, hall.hall_id)))
  }

  const fileIds = c.halls.flatMap((h) => [h.floorPlan?.uploadId, h.walkthrough.file?.uploadId].filter(Boolean))
  const files = fileIds.length
    ? new Map(
        (await repo.findUploadsForUpdate(client, { ownerId: revision.owner_id, ids: fileIds })).map((r) => [
          r.upload_id,
          r,
        ]),
      )
    : new Map()
  for (const id of fileIds) {
    const row = files.get(id)
    if (!row || (row.venue_id && row.venue_id !== venueId))
      throw new AppError(
        409,
        'FILE_GONE',
        'A file in this edit is no longer available. Reject it and ask the owner to upload it again.',
      )
  }

  await edits.parkHallNames(client, venueId)
  const realIds = new Map()
  for (const [sortOrder, h] of c.halls.entries()) {
    const row = {
      name: h.name,
      capacity: h.capacity,
      standingCapacity: h.standingCapacity,
      setting: h.setting,
      hasAc: h.hasAc,
      lengthFt: h.lengthFt,
      widthFt: h.widthFt,
      ceilingFt: h.ceilingFt,
      description: h.description,
      zones: h.zones,
      walkthroughMode: h.walkthrough.mode,
      walkthroughUrl: h.walkthrough.mode === 'link' ? h.walkthrough.url : null,
      sortOrder,
    }
    let hallId = h.hallId
    if (live.has(hallId)) {
      await edits.updateHall(client, venueId, { ...row, hallId })
    } else {
      hallId = crypto.randomUUID()
      realIds.set(h.hallId, hallId)
      await repo.insertHall(client, venueId, { ...row, hallId, floorPlanUrl: null, floorPlanType: null })
    }
    if (h.floorPlan?.uploadId) {
      const file = files.get(h.floorPlan.uploadId)
      const type = file.mime_type === 'application/pdf' ? 'pdf' : 'image'
      const old = await edits.setFloorPlan(client, hallId, { url: urlFor(file), type })
      if (old) removedUrls.push(old)
    } else if (!h.floorPlan) {
      const old = await edits.setFloorPlan(client, hallId, { url: null, type: null })
      if (old) removedUrls.push(old)
    }
    const walk = h.walkthrough.file
    if (walk?.uploadId) {
      removedUrls.push(...(await edits.deleteWalkthroughs(client, hallId)))
      await repo.insertWalkthrough(client, venueId, {
        hallId,
        assetType: walk.assetType,
        url: urlFor(files.get(walk.uploadId)),
      })
    } else if (!walk) {
      removedUrls.push(...(await edits.deleteWalkthroughs(client, hallId)))
    }
  }
  if (fileIds.length) await repo.attachUploads(client, { venueId, ids: fileIds })

  // Photos added for a hall that didn't exist yet.
  const byHall = new Map()
  for (const p of c.newHallPhotos ?? []) {
    const hallId = realIds.get(p.hallId) ?? (live.has(p.hallId) ? p.hallId : null)
    if (!hallId || !p.imageId) continue
    if (!byHall.has(hallId)) byHall.set(hallId, [])
    byHall.get(hallId).push(p.imageId)
  }
  for (const [hallId, imageIds] of byHall) await edits.linkImagesToHall(client, venueId, { imageIds, hallId })

  await edits.deleteBridalSuite(client, venueId)
  if (c.bridalSuite.enabled) await repo.insertBridalSuite(client, venueId, c.bridalSuite)

  const rules = c.bookingRules
  const before = approvalFromBundle(bundle).bookingRules
  const calendarChanged =
    JSON.stringify([before.days, before.lunch, before.dinner]) !==
    JSON.stringify([rules.days, rules.lunch, rules.dinner])
  await edits.deleteSlotTemplates(client, venueId)
  for (const type of ['lunch', 'dinner']) {
    if (rules[type])
      await repo.insertSlotTemplate(client, venueId, { type, start: rules[type].start, end: rules[type].end })
  }
  await edits.deleteTiers(client, venueId)
  for (const t of rules.tiers) await repo.insertTier(client, venueId, t)

  const v = c.venue
  await edits.updateApprovalFields(client, venueId, {
    name: v.name,
    address: [v.street, v.area, v.city, v.postalCode].filter(Boolean).join(', '),
    city: v.city,
    lat: v.lat,
    lng: v.lng,
    category: v.category,
    area: v.area,
    postalCode: v.postalCode || null,
    supportedEvents: v.supportedEvents,
    facilities: v.facilities,
    description: v.description,
    venueType: VENUE_TYPE(c.halls),
    capacity: Math.max(...c.halls.map((h) => h.capacity)),
    advancePercent: rules.advancePercent,
    cancellationPolicy: rules.cancellationPolicy,
    cancellationNote: rules.note,
    bookingDays: rules.days,
  })
  if (calendarChanged) await edits.deleteFutureFreeSlots(client, venueId)
  await generateSlots(client, venueId, { days: SLOT_DAYS }) // new halls and new times; existing slots are skipped
  return { removedUrls }
}

export { removeFiles }
