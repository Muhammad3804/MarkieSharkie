import { CITIES, CUSTOM_POLICY_STARTER, MENU_SECTIONS, SLOT_TYPES } from './options.js'
import { toPaisa } from '../../lib/money.js'

// One listing draft, shaped like the tables in db/schema.sql (camelCase, as the API will return them):
//   venue        -> venues          halls        -> halls
//   venueImages  -> venue_images    menuPackages -> menu_packages (+ sections[].items -> menu_items; the section
//   addOns       -> add_ons                         name is menu_items.category)
//   halls[].walkthrough with mode 'upload' -> walkthrough_assets (REQ-11)
// Fields marked UI-only have no column yet; they are listed in docs/progress.md ("Host wizard").
export const DRAFT_VERSION = 2

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
    // UI-only from here: size in feet, description, layout and walkthrough
    lengthFt: '',
    widthFt: '',
    ceilingFt: '',
    description: '',
    floorPlan: null, // { fileId, fileName, type, size }; the file lives in IndexedDB (photoStore.js)
    zones: { stage: null, entrance: null, seating: null }, // cell 0-8 of a 3 x 3 grid, row 0 = back of the hall
    // mode: generate | upload | link | skip. upload -> walkthrough_assets: file = { fileId, fileName, assetType, size }
    walkthrough: { mode: 'generate', file: null, url: '' },
  }
}

// Floor area in square feet; null until both sides are whole numbers.
export function hallArea(hall) {
  return /^\d+$/.test(hall.lengthFt) && /^\d+$/.test(hall.widthFt) ? Number(hall.lengthFt) * Number(hall.widthFt) : null
}

// isDefault: one of MENU_SECTIONS (shown as a fixed heading); others are the host's own and can be renamed.
export const newSection = (name = '', dishes = [], isDefault = MENU_SECTIONS.includes(name)) => ({
  sectionId: newId(),
  name,
  isDefault,
  items: dishes.map((dish) => ({ itemId: newId(), name: dish })),
})

// "Live  Stations " -> "live stations", for duplicate checks.
export const sectionKey = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export const dishCount = (menu) => menu.sections.reduce((sum, section) => sum + section.items.length, 0)

export function newMenuPackage(template) {
  return {
    menuId: newId(),
    name: template?.name ?? '',
    description: template?.description ?? '',
    pricePerHead: template?.pricePerHead ?? '', // rupees as a string; numeric(10,2) on the server
    minGuests: template?.minGuests ?? '100',
    isCustomizable: false,
    // Every default section, then any extra ones the template brings (e.g. "Salads & raita").
    sections: [...new Set([...MENU_SECTIONS, ...Object.keys(template?.sections ?? {})])].map((name) => newSection(name, template?.sections?.[name] ?? [])),
  }
}

export function newAddOn(type = 'sound_system') {
  return { addOnId: newId(), type, name: '', description: '', price: '', isAvailable: true }
}

// "30 or more days before: 100% back" / "7 to 30 days before: 50% back".
export function tierSummary(tier) {
  if (!/^\d+$/.test(tier.fromDays) || !/^\d+$/.test(tier.refundPercent)) return ''
  const range = tier.toDays ? `${tier.fromDays} to ${tier.toDays} days before` : `${tier.fromDays} or more days before`
  return `${range}: ${tier.refundPercent}% back`
}

export const newPolicyTier = (tier = { fromDays: '', toDays: '', refundPercent: '' }) => ({ tierId: newId(), ...tier })

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
      // UI-only extras the venue page shows
      hostingSince: '', // year; the page shows "N yrs hosting events"
      landmark: '', // "15 min from Clock Tower"
      landmarkMinutes: '',
      directions: '', // "Getting there"
      parkingSpaces: '',
      houseRules: [],
      customHouseRules: [],
    },
    halls: [newHall(0)],
    bridalSuite: { enabled: false, name: 'Bridal suite', capacity: '', lengthFt: '', widthFt: '', description: '' }, // UI-only
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
      // Used when cancellationPolicy is 'custom': refund % by days before the event. toDays '' = "or more".
      customPolicy: { tiers: CUSTOM_POLICY_STARTER.map((tier) => newPolicyTier(tier)), note: '' },
    },
  }
}

// v1 -> v2: dishes were one flat list (now sections), halls had no size/layout/walkthrough, and "Lobby" photos are
// now "Lobby / hallways". Missing hall fields are filled in by hydrateDraft.
function migrateV1(stored) {
  return {
    ...stored,
    version: 2,
    menuPackages: (stored.menuPackages ?? []).map(({ items = [], ...menu }) => ({
      ...menu,
      sections: MENU_SECTIONS.map((name) => newSection(name, name === 'Main course' ? items.map((item) => item.name) : [])),
    })),
    venueImages: (stored.venueImages ?? []).map((image) => (image.category === 'lobby' ? { ...image, category: 'hallway' } : image)),
  }
}

// Merge a stored draft over a fresh one so drafts saved by an older build still have every field.
export function hydrateDraft(raw) {
  if (!raw || typeof raw !== 'object') return null
  const stored = raw.version === 1 ? migrateV1(raw) : raw
  if (stored.version !== DRAFT_VERSION) return null
  const base = emptyDraft()
  const hallBase = newHall(0)
  return {
    ...base,
    ...stored,
    venue: { ...base.venue, ...stored.venue },
    customMenu: { ...base.customMenu, ...stored.customMenu },
    bookingRules: {
      ...base.bookingRules,
      ...stored.bookingRules,
      slots: { ...base.bookingRules.slots, ...stored.bookingRules?.slots },
      customPolicy: { ...base.bookingRules.customPolicy, ...stored.bookingRules?.customPolicy },
    },
    halls:
      Array.isArray(stored.halls) && stored.halls.length
        ? stored.halls.map((hall) => ({ ...hallBase, ...hall, zones: { ...hallBase.zones, ...hall.zones }, walkthrough: { ...hallBase.walkthrough, ...hall.walkthrough } }))
        : base.halls,
    bridalSuite: { ...base.bridalSuite, ...stored.bridalSuite },
    venueImages: Array.isArray(stored.venueImages) ? stored.venueImages : [],
    menuPackages: Array.isArray(stored.menuPackages) ? stored.menuPackages.map((menu) => ({ ...menu, sections: Array.isArray(menu.sections) ? menu.sections : [] })) : [],
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
// the server recomputes them and never trusts the client's values. Photos and files are uploaded separately.
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
      // One menu_items row per dish; the section name is menu_items.category. Section order is list order (UI-only).
      items: menu.sections.flatMap((section) => section.items.map((item) => ({ name: item.name, category: section.name.trim().replace(/\s+/g, ' '), isOptional: false }))),
    })),
    addOns: draft.addOns.map((addOn) => ({
      type: addOn.type,
      name: addOn.name.trim(),
      description: addOn.description.trim(),
      price: toRupeeString(toPaisa(addOn.price)),
      isAvailable: true,
    })),
    venueImages: draft.venueImages.map(({ imageId, hallId, category, isCover }) => ({ imageId, hallId, category, isCover })),
    // REQ-11 uploads. walkthrough_assets has no hall_id; the hall link is UI-only until it does.
    walkthroughAssets: halls
      .filter((hall) => hall.walkthrough.mode === 'upload' && hall.walkthrough.file)
      .map((hall) => ({ hallId: hall.hallId, assetType: hall.walkthrough.file.assetType, fileId: hall.walkthrough.file.fileId })),
    // UI-only, kept so nothing the host typed is lost before the columns exist.
    extras: {
      category: venue.category,
      headline: venue.headline.trim(),
      googleMapsUrl: venue.googleMapsUrl.trim(),
      hostingSince: venue.hostingSince,
      gettingThere: { landmark: venue.landmark.trim(), minutes: venue.landmarkMinutes, directions: venue.directions.trim() },
      parkingSpaces: venue.parkingSpaces,
      houseRules: [...venue.houseRules, ...venue.customHouseRules],
      hallDetails: halls.map(({ hallId, standingCapacity, setting, hasAc, lengthFt, widthFt, ceilingFt, description, floorPlan, zones, walkthrough }) => ({
        hallId,
        standingCapacity,
        setting,
        hasAc,
        lengthFt,
        widthFt,
        ceilingFt,
        description: description.trim(),
        floorPlanFileId: floorPlan?.fileId ?? null,
        zones,
        walkthrough: { mode: walkthrough.mode, url: walkthrough.mode === 'link' ? walkthrough.url.trim() : '' },
      })),
      bridalSuite: draft.bridalSuite.enabled ? draft.bridalSuite : null,
      customMenuNote: draft.customMenu.accepts ? draft.customMenu.note.trim() : '',
      bookingRules: {
        ...draft.bookingRules,
        customPolicy: draft.bookingRules.cancellationPolicy === 'custom' ? draft.bookingRules.customPolicy : null,
      },
    },
  }
}
