import { createMockStore, subscribeMockStores } from './mockStore.js'
import { toListingPayload, cityCenter } from '../features/host/draft.js'
import { AMENITY_LABELS, CANCELLATION_POLICIES, HOUSE_RULES, VENUE_CATEGORIES } from '../features/host/options.js'
import { GALLERY_SECTIONS } from '../features/venues/constants.js'
import { buildSeedListings } from '../features/admin/seedListings.js'

// Submitted venue listings, the mock for the server's `venues` rows with approval_status (REQ-5, REQ-7):
//   pending -> approved | rejected | changes_requested ([Design], srs-alignment #18); changes_requested -> pending
//   when the owner resubmits. Only approved + active + not suspended listings are public (api/venues.js).
// Records live in localStorage `markiesharkie:listings`; uploaded photos and plans are copied from the wizard's
// IndexedDB into `markiesharkie-listings` on submit (the wizard clears its own store right after). Later:
//   createListing     -> POST /api/owner/venues (+ image uploads, REQ-8/9)
//   setListingStatus  -> POST /api/admin/venues/:id/approve | reject | request-changes
//   setVenueSuspended -> PATCH /api/admin/venues/:id { isActive }
const STORE_VERSION = 1

const store = createMockStore('markiesharkie:listings', {
  seed: () => ({ version: STORE_VERSION, listings: buildSeedListings().map(withPayload), suspended: {} }),
  isValid: (value) => value?.version === STORE_VERSION && Array.isArray(value.listings),
})

export const subscribeListings = subscribeMockStores

function withPayload(record) {
  const history = [{ status: 'pending', at: record.submittedAt, by: 'owner', note: '' }]
  if (record.status !== 'pending') history.push({ status: record.status, at: record.decidedAt, by: 'admin', note: record.rejectionReason || record.changesNote })
  return { isActive: true, fileTypes: {}, updatedAt: record.decidedAt ?? record.submittedAt, history, ...record, payload: toListingPayload(record.draft) }
}

export function listListingRecords() {
  return store.get().listings
}

export function getListingRecord(id) {
  return store.get().listings.find((listing) => listing.id === id) ?? null
}

export function isVenueSuspended(venueId) {
  return Boolean(store.get().suspended[venueId])
}

export function suspendedVenues() {
  return store.get().suspended
}

const updateRecord = (id, recipe) =>
  store.update((value) => ({ ...value, listings: value.listings.map((listing) => (listing.id === id ? recipe(listing) : listing)) }))

// ---------------------------------------------------------------------------------------------------------------
// Files (IndexedDB). Object URLs are cached for the page's lifetime.
// ---------------------------------------------------------------------------------------------------------------
const FILES_DB = 'markiesharkie-listings'
let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(FILES_DB, 1)
        request.onupgradeneeded = () => request.result.createObjectStore('files')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

async function filesTx(mode, action) {
  const db = await openDb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('files', mode)
      const request = action(tx.objectStore('files'))
      tx.oncomplete = () => resolve(request?.result)
      tx.onerror = () => resolve(undefined)
      tx.onabort = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

const memoryFiles = new Map() // fileId -> Blob when IndexedDB is unavailable (this page load only)
const objectUrls = new Map()
const loading = new Map() // fileId -> Promise while the file is being read

async function storeFiles(files) {
  const entries = Object.entries(files)
  if (!entries.length) return
  for (const [id, blob] of entries) memoryFiles.set(id, blob)
  await filesTx('readwrite', (os) => {
    let last
    for (const [id, blob] of entries) last = os.put(blob, id)
    return last
  })
}

// Bundled demo photos for the seeded listings: asset key ("hall-1") -> URL.
const ASSET_URLS = Object.fromEntries(
  Object.entries({
    ...import.meta.glob('../assets/gallery/*.webp', { eager: true, import: 'default' }),
    ...import.meta.glob('../assets/venue-detail/floorplan-*.webp', { eager: true, import: 'default' }),
  }).map(([path, url]) => [path.split('/').pop().replace('.webp', ''), url]),
)

// { fileId: url } for every photo and floor plan of a listing. Missing files are left out.
export async function resolveListingFiles(record) {
  const ids = [
    ...record.payload.venueImages.map((image) => image.imageId),
    ...record.payload.extras.hallDetails.map((hall) => hall.floorPlanFileId).filter(Boolean),
  ]
  const urls = {}
  const toLoad = []
  for (const id of ids) {
    if (record.sources?.[id]) urls[id] = ASSET_URLS[record.sources[id]]
    else if (objectUrls.has(id)) urls[id] = objectUrls.get(id)
    else toLoad.push(id)
  }
  for (const id of toLoad) {
    // One pending load per file, so concurrent calls share it instead of each creating (and leaking) an object URL.
    if (!loading.has(id)) {
      loading.set(
        id,
        (async () => {
          const blob = memoryFiles.get(id) ?? (await filesTx('readonly', (os) => os.get(id)))
          if (blob instanceof Blob) objectUrls.set(id, URL.createObjectURL(blob))
          loading.delete(id)
        })(),
      )
    }
    await loading.get(id)
    if (objectUrls.has(id)) urls[id] = objectUrls.get(id)
  }
  return urls
}

// ---------------------------------------------------------------------------------------------------------------
// Owner side
// ---------------------------------------------------------------------------------------------------------------
// TODO(auth): the owner comes from the session (venue_owner) once auth exists.
export const DEMO_OWNER = { name: 'Demo owner', email: 'owner@example.pk', phone: '+923001112233' }

const fileTypesOf = (draft) =>
  Object.fromEntries([
    ...draft.venueImages.map((image) => [image.imageId, image.type]),
    ...draft.halls.filter((hall) => hall.floorPlan).map((hall) => [hall.floorPlan.fileId, hall.floorPlan.type]),
  ])

// A new listing (approval_status 'pending'). `files` = { fileId: Blob } read from the wizard's photo store.
// When the draft came from a listing the admin sent back (draft.listingId), that listing is resubmitted instead.
export async function createListing({ draft, files }) {
  await storeFiles(files)
  const now = new Date().toISOString()
  const previous = draft.listingId ? getListingRecord(draft.listingId) : null
  const cleanDraft = { ...draft }
  delete cleanDraft.listingId
  if (previous && previous.status === 'changes_requested') {
    updateRecord(previous.id, (listing) => ({
      ...listing,
      status: 'pending',
      draft: cleanDraft,
      payload: toListingPayload(cleanDraft),
      fileTypes: fileTypesOf(cleanDraft),
      sources: {},
      updatedAt: now,
      submittedAt: now,
      history: [...listing.history, { status: 'pending', at: now, by: 'owner', note: 'Resubmitted with changes' }],
    }))
    return getListingRecord(previous.id)
  }
  const record = {
    id: `listing-${Date.now().toString(36)}`,
    status: 'pending',
    isActive: true,
    submittedAt: now,
    updatedAt: now,
    decidedAt: null,
    owner: DEMO_OWNER,
    draft: cleanDraft,
    payload: toListingPayload(cleanDraft),
    sources: {},
    fileTypes: fileTypesOf(cleanDraft),
    rejectionReason: '',
    changesNote: '',
    history: [{ status: 'pending', at: now, by: 'owner', note: '' }],
  }
  store.update((value) => ({ ...value, listings: [record, ...value.listings] }))
  return record
}

// The listing's files as Blobs, so "Edit and resubmit" can put them back into the wizard's photo store.
export async function readListingFiles(record) {
  const urls = await resolveListingFiles(record)
  const files = {}
  for (const [id, url] of Object.entries(urls)) {
    const blob = await fetch(url).then((response) => response.blob()).catch(() => null)
    if (blob) files[id] = blob
  }
  return files
}

// ---------------------------------------------------------------------------------------------------------------
// Admin side (called through api/admin.js, which also writes the audit log)
// ---------------------------------------------------------------------------------------------------------------
export function setListingStatus(id, { status, by, reason = '', note = '' }) {
  const now = new Date().toISOString()
  updateRecord(id, (listing) => ({
    ...listing,
    status,
    decidedAt: now,
    decidedBy: by,
    updatedAt: now,
    rejectionReason: status === 'rejected' ? reason : '',
    changesNote: status === 'changes_requested' ? note : '',
    history: [...listing.history, { status, at: now, by: 'admin', note: reason || note }],
  }))
  return getListingRecord(id)
}

export function setVenueSuspended(venueId, suspended, { by, reason = '' }) {
  store.update((value) => {
    const next = { ...value.suspended }
    if (suspended) next[venueId] = { at: new Date().toISOString(), by, reason }
    else delete next[venueId]
    return { ...value, suspended: next }
  })
}

export function resetListings() {
  store.reset()
}

// ---------------------------------------------------------------------------------------------------------------
// Listing -> venue detail shape (same fields as mockVenues.js getMockVenue, so every venue component works)
// ---------------------------------------------------------------------------------------------------------------
// Wizard photo zone -> venue gallery section (GALLERY_SECTIONS keys).
const SECTION_FOR = { main_hall: 'hall', seating: 'hall', stage: 'stage', bridal_room: 'bridal', washrooms: 'bathroom', entrance: 'entrance', exterior: 'entrance', parking: 'parking', hallway: 'hallway' }
// Wizard amenity keys -> the venue page's amenity keys where they mean the same thing; others show their label.
const AMENITY_FOR = { ac: 'climate', generator: 'generator', valet: 'valet', bridal: 'bridal', prayer: 'prayer', catering: 'catering', decor: 'decor', sound: 'sound', security: 'security', photography: 'photo' }

const label = (list, value) => list.find((item) => item.value === value)?.label ?? ''
const numberOrNull = (text) => (/^\d+$/.test(String(text ?? '')) ? Number(text) : null)
function time12(value) {
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function listingToVenue(record, urls) {
  const { venue: v, halls: payloadHalls, extras: x } = record.payload
  const id = record.id
  const category = label(VENUE_CATEGORIES, x.category) || 'Event venue'
  const point = v.location ?? cityCenter(v.city) ?? { lat: 31.5204, lng: 74.3587 }
  const area = x.area || v.city

  const halls = payloadHalls.map((hall) => {
    const detail = x.hallDetails.find((d) => d.hallId === hall.hallId) ?? {}
    return {
      hallId: hall.hallId,
      venueId: id,
      name: hall.name,
      capacity: hall.capacity,
      standingCapacity: numberOrNull(detail.standingCapacity) ?? hall.capacity,
      lengthFt: numberOrNull(detail.lengthFt),
      widthFt: numberOrNull(detail.widthFt),
      ceilingFt: numberOrNull(detail.ceilingFt),
      description: detail.description || `${hall.name} at ${v.name}.`,
      floorPlanUrl: detail.floorPlanFileId ? (urls[detail.floorPlanFileId] ?? null) : null,
      floorPlanType: record.fileTypes?.[detail.floorPlanFileId] === 'application/pdf' ? 'pdf' : 'image',
      zones: detail.zones ?? {},
      walkthrough: detail.walkthrough ?? { mode: 'skip', url: '' },
      hallCharge: '0.00', // the wizard has no hall hire field; the menu price covers the hall
    }
  })

  // Cover first, then the order the host chose. Venue-wide photos appear in every hall's gallery.
  const ordered = [...record.payload.venueImages].filter((image) => urls[image.imageId]).sort((a, b) => Number(b.isCover) - Number(a.isCover))
  const toImage = (image, hall) => ({
    imageId: image.imageId,
    venueId: id,
    hallId: image.hallId,
    category: SECTION_FOR[image.category] ?? 'hall',
    imageUrl: urls[image.imageId],
    alt: `${v.name}${hall ? `, ${hall.name}` : ''}: ${(image.category ?? 'venue').replace('_', ' ')} photo`,
    verificationStatus: 'genuine',
    isPublished: true,
  })
  const gallery = halls.map((hall) => ({
    hallId: hall.hallId,
    sections: GALLERY_SECTIONS.map((section) => ({
      key: section.key,
      images: ordered.filter((image) => (image.hallId === null || image.hallId === hall.hallId) && (SECTION_FOR[image.category] ?? 'hall') === section.key).map((image) => toImage(image, hall)),
    })),
  }))
  const images = ordered.map((image) => toImage(image, halls.find((hall) => hall.hallId === image.hallId)))
  const largest = Math.max(...halls.map((hall) => hall.capacity))
  const slots = x.bookingRules?.slots ?? {}
  const houseRules = (x.houseRules ?? []).map((key) => HOUSE_RULES.find((rule) => rule.key === key)?.label ?? key)
  const policy = label(CANCELLATION_POLICIES, x.bookingRules?.cancellationPolicy)
  const since = numberOrNull(x.hostingSince)
  const landmark = x.gettingThere?.landmark

  return {
    // card fields (landing rows, Explore)
    id,
    name: v.name,
    area,
    city: v.city,
    highlights: halls.length === 1 ? `${largest} Guests` : `${halls.length} Halls, up to ${largest} Guests`,
    availableDates: 'New on MarkieSharkie',
    rating: 0,
    reviewCount: 0,
    priceFrom: v.basePrice,
    priceUnit: 'per_person',
    image: images[0]?.imageUrl ?? '',
    // venues
    tagline: category,
    kindLabel: category,
    address: `${v.address}, Pakistan`,
    lat: point.lat,
    lng: point.lng,
    nearby: landmark ? `${x.gettingThere.minutes || '10'} min from ${landmark}` : `${area}, ${v.city}`,
    locationDescription: x.gettingThere?.directions || `Located in ${area}, ${v.city}.`,
    venueType: v.venueType,
    supportedEvents: v.supportedEvents,
    capacity: v.capacity,
    minGuests: 25,
    basePrice: v.basePrice,
    facilities: v.facilities.map((key) => AMENITY_FOR[key] ?? AMENITY_LABELS[key] ?? key),
    description: v.description,
    avgRating: 0,
    approvalStatus: record.status,
    isActive: record.isActive,
    images,
    heroImages: images.slice(0, 5),
    gallery,
    menuPackages: record.payload.menuPackages.map((menu) => ({
      ...menu,
      venueId: id,
      items: menu.items.map((item, index) => ({ itemId: `${menu.menuId}-item-${index + 1}`, ...item })),
    })),
    addOns: record.payload.addOns.map((addOn, index) => ({ addOnId: `${id}-addon-${index + 1}`, venueId: id, ...addOn })),
    reviews: [],
    ratingCounts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    bookedDates: [],
    // UI-only (see mockVenues.js)
    halls,
    bridalSuite: x.bridalSuite
      ? {
          hallId: `${id}-suite`,
          venueId: id,
          name: x.bridalSuite.name || 'Bridal suite',
          capacity: numberOrNull(x.bridalSuite.capacity) ?? 0,
          standingCapacity: numberOrNull(x.bridalSuite.capacity) ?? 0,
          lengthFt: numberOrNull(x.bridalSuite.lengthFt),
          widthFt: numberOrNull(x.bridalSuite.widthFt),
          description: x.bridalSuite.description || 'A private preparation room for the bridal party.',
        }
      : null,
    bookingTerms: {
      advancePercent: numberOrNull(x.bookingRules?.advancePercent) ?? 0,
      cancellationPolicy: x.bookingRules?.cancellationPolicy || 'strict',
      customTiers: x.bookingRules?.customPolicy?.tiers ?? [],
      houseRules,
    },
    ratingCategories: [],
    host: { name: `${v.name} team`, replyMinutes: null, isTopHost: false, yearsHosting: since ? Math.max(1, new Date().getFullYear() - since) : null },
    parkingSpaces: numberOrNull(x.parkingSpaces) ?? 0,
    eventNotes: {
      timing: [slots.lunch?.enabled && `Day events from ${time12(slots.lunch.start)}`, slots.dinner?.enabled && `Evening events until ${time12(slots.dinner.end)}`].filter(Boolean),
      policies: [...houseRules, policy && `${policy} cancellation policy`].filter(Boolean),
    },
  }
}

const isPublic = (record, suspended) => record.status === 'approved' && record.isActive && !suspended[record.id]

// Approved, active, not suspended listings as venues, newest approval first (for api/venues.js).
export async function getPublicListingVenues() {
  const { listings, suspended } = store.get()
  const visible = listings.filter((record) => isPublic(record, suspended)).sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt))
  return Promise.all(visible.map(async (record) => listingToVenue(record, await resolveListingFiles(record))))
}

// Any status, for the admin review page. null when the id is unknown.
export async function getListingVenue(id, { publicOnly = false } = {}) {
  const record = getListingRecord(id)
  if (!record || (publicOnly && !isPublic(record, store.get().suspended))) return null
  return listingToVenue(record, await resolveListingFiles(record))
}
