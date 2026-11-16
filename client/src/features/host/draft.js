import { CITIES, SLOT_TYPES } from './options.js'
import { toPaisa } from '../../lib/money.js'

// One listing draft, shaped like the tables in db/schema.sql (camelCase, as the API will return them):
//   venue        -> venues          halls        -> halls
//   venueImages  -> venue_images    menuPackages -> menu_packages (+ items -> menu_items)
//   addOns       -> add_ons
// Fields marked UI-only have no column yet; they are listed in docs/progress.md ("Host wizard").
export const DRAFT_VERSION = 1

// crypto.randomUUID only exists on HTTPS/localhost (not when testing from a phone on the LAN).
export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function newHall(index = 0) {
  return {
    hallId: newId(),
    name: index === 0 ? 'Main hall' : `Hall ${index + 1}`,
    capacity: '', // halls.capacity: seated guests
    standingCapacity: '', // UI-only
    setting: 'indoor', // venue_type enum, per hall; venues.venue_type is derived from these
    hasAc: true, // UI-only
  }
}

export function newMenuPackage(template) {
  return {
    menuId: newId(),
    name: template?.name ?? '',
    description: template?.description ?? '',
    pricePerHead: template?.pricePerHead ?? '', // rupees as a string; numeric(10,2) on the server
    minGuests: template?.minGuests ?? '100',
    isCustomizable: false,
    items: (template?.items ?? []).map((name) => ({ itemId: newId(), name })),
  }
}

export function newAddOn(type = 'sound_system') {
  return { addOnId: newId(), type, name: '', description: '', price: '', isAvailable: true }
}

export function emptyDraft() {
  return {
    version: DRAFT_VERSION,
    updatedAt: null,
    lastStep: null,
    venue: {
      category: '', // UI-only (Marquee, Banquet hall, ...)
      name: '',
      city: '',
      street: '',
      area: '',
      postalCode: '',
      lat: null,
      lng: null,
      googleMapsUrl: '', // UI-only; google_place_id is resolved on the server later
      supportedEvents: [],
      facilities: [],
      customFacilities: [],
      headline: '', // UI-only listing title
      description: '',
    },
    halls: [newHall(0)],
    // { imageId, hallId (null = venue-wide), category, fileName, size, type, isCover }. Order in the array is the
    // display order. The files themselves live in IndexedDB (photoStore.js), keyed by imageId.
    venueImages: [],
    menuPackages: [],
    customMenu: { accepts: false, note: '' }, // UI-only note; acceptance per package is menu_packages.is_customizable
    addOns: [],
    bookingRules: {
      // UI-only until time_slots are generated from them (docs/booking-engine.md "Create slots")
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      slots: Object.fromEntries(SLOT_TYPES.map((slot) => [slot.value, { enabled: true, start: slot.start, end: slot.end }])),
      advancePercent: '25',
      cancellationPolicy: '',
    },
  }
}

// Merge a stored draft over a fresh one so drafts saved by an older build still have every field.
export function hydrateDraft(stored) {
  const base = emptyDraft()
  if (!stored || typeof stored !== 'object' || stored.version !== DRAFT_VERSION) return null
  return {
    ...base,
    ...stored,
    venue: { ...base.venue, ...stored.venue },
    customMenu: { ...base.customMenu, ...stored.customMenu },
    bookingRules: { ...base.bookingRules, ...stored.bookingRules, slots: { ...base.bookingRules.slots, ...stored.bookingRules?.slots } },
    halls: Array.isArray(stored.halls) && stored.halls.length ? stored.halls : base.halls,
    venueImages: Array.isArray(stored.venueImages) ? stored.venueImages : [],
    menuPackages: Array.isArray(stored.menuPackages) ? stored.menuPackages : [],
    addOns: Array.isArray(stored.addOns) ? stored.addOns : [],
  }
}

// Keep exactly one cover while there are photos: if the cover was removed, the first photo takes over.
export function ensureCover(images) {
  if (!images.length || images.some((image) => image.isCover)) return images
  return [{ ...images[0], isCover: true }, ...images.slice(1)]
}

// True once the host has answered anything, so the intro can offer "Continue your listing".
export function hasProgress(draft) {
  return Boolean(draft?.lastStep)
}

// REQ-5 venue_type from the per-hall settings: all halls the same -> that type, a mix -> semi_outdoor.
export function deriveVenueType(halls) {
  const settings = new Set(halls.map((hall) => hall.setting))
  return settings.size === 1 ? [...settings][0] : 'semi_outdoor'
}

export function cityCenter(city) {
  const match = CITIES.find((c) => c.value === city)
  return match ? { lat: match.lat, lng: match.lng } : null
}

export function formatAddress(venue) {
  return [venue.street, venue.area, venue.city, venue.postalCode].map((part) => part.trim()).filter(Boolean).join(', ')
}

const toRupeeString = (paisa) => `${Math.floor(paisa / 100)}.${String(paisa % 100).padStart(2, '0')}`

// The body submitListing() will POST. Derived columns (capacity, base_price, venue_type) are filled here;
// the server recomputes them and never trusts the client's values. Photos are uploaded separately.
export function toListingPayload(draft) {
  const { venue, halls } = draft
  const prices = draft.menuPackages.map((menu) => toPaisa(menu.pricePerHead))
  return {
    venue: {
      name: venue.name.trim(),
      address: formatAddress(venue),
      city: venue.city,
      location: venue.lat == null ? null : { lat: venue.lat, lng: venue.lng },
      venueType: deriveVenueType(halls),
      supportedEvents: venue.supportedEvents,
      capacity: Math.max(...halls.map((hall) => Number(hall.capacity))), // venues.capacity = largest hall
      basePrice: prices.length ? toRupeeString(Math.min(...prices)) : '0.00', // cheapest package per head
      facilities: [...venue.facilities, ...venue.customFacilities],
      description: venue.description.trim(),
    },
    halls: halls.map((hall) => ({ hallId: hall.hallId, name: hall.name.trim(), capacity: Number(hall.capacity) })),
    menuPackages: draft.menuPackages.map((menu) => ({
      menuId: menu.menuId,
      name: menu.name.trim(),
      description: menu.description.trim(),
      pricePerHead: toRupeeString(toPaisa(menu.pricePerHead)),
      isCustomizable: draft.customMenu.accepts && menu.isCustomizable,
      minGuests: Number(menu.minGuests),
      // menu_items.category is NOT NULL; dishes get real categories in the owner's menu editor later.
      items: menu.items.map((item) => ({ name: item.name, category: 'main', isOptional: false })),
    })),
    addOns: draft.addOns.map((addOn) => ({
      type: addOn.type,
      name: addOn.name.trim(),
      description: addOn.description.trim(),
      price: toRupeeString(toPaisa(addOn.price)),
      isAvailable: true,
    })),
    venueImages: draft.venueImages.map(({ imageId, hallId, category, isCover }) => ({ imageId, hallId, category, isCover })),
    // UI-only, kept so nothing the host typed is lost before the columns exist.
    extras: {
      category: venue.category,
      headline: venue.headline.trim(),
      googleMapsUrl: venue.googleMapsUrl.trim(),
      hallDetails: halls.map(({ hallId, standingCapacity, setting, hasAc }) => ({ hallId, standingCapacity, setting, hasAc })),
      customMenuNote: draft.customMenu.accepts ? draft.customMenu.note.trim() : '',
      bookingRules: draft.bookingRules,
    },
  }
}
