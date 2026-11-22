import { emptyDraft, hydrateDraft, newId } from '../features/host/draft.js'
import { AMENITY_KEYS, HOUSE_RULES, MENU_SECTIONS } from '../features/host/options.js'

// Server listing (GET /api/owner/venues/:id, GET /api/admin/venues/:id: everything the owner entered, structured)
// -> the wizard draft (features/host/draft.js), so the admin review page and "edit and resubmit" can reuse the
// wizard's shapes. Replaced the localStorage listings mock; nothing here is stored in the browser.

const HOUSE_RULE_KEYS = new Set(HOUSE_RULES.map((rule) => rule.key))
const AMENITIES = new Set(AMENITY_KEYS)

// '2500.00' -> '2500' (the wizard's rupee text fields)
const rupeeText = (money) => String(money ?? '').replace(/\.00$/, '')

function sections(items) {
  const byName = new Map(MENU_SECTIONS.map((name) => [name, []]))
  for (const item of items) {
    if (!byName.has(item.category)) byName.set(item.category, [])
    byName.get(item.category).push({ itemId: item.itemId ?? newId(), name: item.name })
  }
  return [...byName].map(([name, list]) => ({ sectionId: newId(), name, isDefault: MENU_SECTIONS.includes(name), items: list }))
}

// -> { draft, files: [{ id, url, type }] } where files are the photos / floor plans / walkthroughs by draft file id.
export function listingToDraft(listing) {
  const files = []
  const v = listing.venue
  const rules = listing.bookingRules
  const base = emptyDraft()
  const halls = listing.halls.map((hall) => {
    const planId = `plan-${hall.hallId}`
    const walkId = `walk-${hall.hallId}`
    if (hall.floorPlan) files.push({ id: planId, url: hall.floorPlan.url, type: hall.floorPlan.type })
    if (hall.walkthrough.file) files.push({ id: walkId, url: hall.walkthrough.file.url, type: '' })
    return {
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
      // uploadId: a file that is already on the server, waiting in a pending edit (owner editor); sent back as is.
      floorPlan: hall.floorPlan ? { fileId: planId, fileName: hall.floorPlan.type === 'application/pdf' ? 'floor-plan.pdf' : 'floor-plan.jpg', type: hall.floorPlan.type, size: 0, uploadId: hall.floorPlan.uploadId ?? null } : null,
      zones: hall.zones,
      walkthrough: {
        mode: hall.walkthrough.mode,
        url: hall.walkthrough.url ?? '',
        file: hall.walkthrough.file ? { fileId: walkId, fileName: hall.walkthrough.file.assetType === 'model_3d' ? 'walkthrough.glb' : 'walkthrough.jpg', assetType: hall.walkthrough.file.assetType, size: 0, uploadId: hall.walkthrough.file.uploadId ?? null } : null,
      },
    }
  })
  for (const image of listing.images) files.push({ id: image.imageId, url: image.url, type: image.mimeType })

  const draft = hydrateDraft({
    ...base,
    lastStep: 'review',
    updatedAt: listing.submittedAt,
    listingId: listing.id,
    venue: {
      ...base.venue,
      category: v.category,
      name: v.name,
      city: v.city,
      street: v.street,
      area: v.area,
      postalCode: v.postalCode,
      lat: v.lat,
      lng: v.lng,
      googleMapsUrl: v.googleMapsUrl,
      supportedEvents: v.supportedEvents,
      facilities: v.facilities.filter((key) => AMENITIES.has(key)),
      customFacilities: v.facilities.filter((key) => !AMENITIES.has(key)),
      headline: v.headline,
      description: v.description,
      hostingSince: v.hostingSince,
      landmark: v.landmark,
      landmarkMinutes: v.landmarkMinutes,
      directions: v.directions,
      parkingSpaces: v.parkingSpaces,
      houseRules: v.houseRules.filter((rule) => HOUSE_RULE_KEYS.has(rule)),
      customHouseRules: v.houseRules.filter((rule) => !HOUSE_RULE_KEYS.has(rule)),
    },
    halls,
    bridalSuite: { ...base.bridalSuite, ...listing.bridalSuite },
    venueImages: listing.images.map((image) => ({
      imageId: image.imageId,
      hallId: image.hallId,
      category: image.category === 'tour' ? 'main_hall' : image.category,
      fileName: image.url.split('/').pop(),
      size: image.size ?? 0,
      type: image.mimeType ?? 'image/jpeg',
      isCover: image.isCover,
    })),
    menuPackages: listing.menuPackages.map((menu) => ({
      menuId: menu.menuId,
      name: menu.name,
      description: menu.description,
      pricePerHead: rupeeText(menu.pricePerHead),
      minGuests: menu.minGuests,
      isCustomizable: menu.isCustomizable,
      sections: sections(menu.items),
    })),
    customMenu: { accepts: Boolean(listing.customMenuNote) || listing.menuPackages.some((m) => m.isCustomizable), note: listing.customMenuNote },
    addOns: listing.addOns.map((addOn) => ({ addOnId: addOn.addOnId, type: addOn.type, name: addOn.name, description: addOn.description, price: rupeeText(addOn.price), isAvailable: true })),
    bookingRules: {
      ...base.bookingRules,
      days: rules.days,
      slots: {
        lunch: rules.slots.lunch.enabled ? rules.slots.lunch : { ...base.bookingRules.slots.lunch, enabled: false },
        dinner: rules.slots.dinner.enabled ? rules.slots.dinner : { ...base.bookingRules.slots.dinner, enabled: false },
      },
      advancePercent: rules.advancePercent,
      cancellationPolicy: rules.cancellationPolicy,
      customPolicy: rules.customPolicy.tiers.length
        ? { tiers: rules.customPolicy.tiers.map((tier) => ({ tierId: newId(), ...tier })), note: rules.customPolicy.note }
        : base.bookingRules.customPolicy,
    },
  })
  return { draft, files }
}

const ACTION_STATUS = {
  'venue.approve': 'approved',
  'venue.reject': 'rejected',
  'venue.request_changes': 'changes_requested',
  'venue.suspend': 'suspended',
  'venue.unsuspend': 'approved',
}

// Server history (admin_audit_log rows for the venue) -> the review page's timeline entries.
export function toHistory(listing, history) {
  const entries = [{ status: 'pending', at: listing.submittedAt, by: 'owner', note: '' }]
  for (const entry of history) {
    entries.push({
      status: ACTION_STATUS[entry.action] ?? 'pending',
      at: entry.at,
      by: 'admin',
      note: entry.details?.reason || entry.details?.note || '',
    })
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}
