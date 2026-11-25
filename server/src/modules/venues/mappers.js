import { signedQuarantineUrl } from '../../lib/quarantineUrl.js'

// DB rows -> the JSON shapes the client already renders (client/src/features/venues/mockVenues.js getMockVenue and
// client/src/api/listings.js listingToVenue), so venue pages, cards and the admin review work unchanged.
// Money stays a decimal string (never a JS float). File URLs are made absolute with the API's origin.

// Venue page gallery sections, in display order (client/src/features/venues/constants.js GALLERY_SECTIONS).
const GALLERY_KEYS = ['tour', 'hall', 'stage', 'bridal', 'bathroom', 'parking', 'entrance', 'hallway']
// venue_images.category (wizard photo zone) -> gallery section.
const SECTION_FOR = {
  tour: 'tour',
  main_hall: 'hall',
  seating: 'hall',
  stage: 'stage',
  bridal_room: 'bridal',
  washrooms: 'bathroom',
  entrance: 'entrance',
  exterior: 'entrance',
  parking: 'parking',
  hallway: 'hallway',
}
// Wizard amenity keys -> the venue page's amenity keys where they mean the same thing (others pass through).
const AMENITY_FOR = {
  ac: 'climate',
  generator: 'generator',
  valet: 'valet',
  bridal: 'bridal',
  prayer: 'prayer',
  catering: 'catering',
  decor: 'decor',
  sound: 'sound',
  security: 'security',
  photography: 'photo',
}
const CATEGORY_LABELS = {
  marquee: 'Marquee',
  banquet_hall: 'Banquet hall',
  lawn: 'Lawn / outdoor',
  farmhouse: 'Farmhouse',
  hotel_ballroom: 'Hotel ballroom',
  rooftop: 'Rooftop',
}
const POLICY_LABELS = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict', custom: 'Custom' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Quarantined photos (AI-rejected, srs-alignment #42) are never public: they get a short-lived signed link. Only owner
// and admin responses can contain them (public queries read published photos only).
export const absolute = (origin, url) => {
  if (url && url.startsWith('/uploads/quarantine/')) return signedQuarantineUrl(origin, url.slice('/uploads/'.length))
  return url && url.startsWith('/uploads/') ? `${origin}${url}` : (url ?? '')
}
const isoDay = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null
const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))
const num = (value) => (value === null || value === undefined ? null : Number(value))
const time12 = (value) => {
  const [h, m] = String(value).slice(0, 5).split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const hhmm = (value) => String(value).slice(0, 5)

// "Nov 23 - 25" from the first free date (the card's "available" line), or a fallback.
function availableLine(nextFreeDate) {
  const day = isoDay(nextFreeDate)
  if (!day) return 'Fully booked for now'
  const start = new Date(`${day}T00:00:00Z`)
  const end = new Date(start.getTime() + 2 * 86_400_000)
  const label = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${label(start)} - ${end.getUTCDate()}`
    : `${label(start)} - ${label(end)}`
}

function highlights(hallCount, capacity) {
  return hallCount <= 1 ? `${capacity} Guests` : `${hallCount} Halls, up to ${capacity} Guests`
}

// Search result / landing card (client api/venues.js toResult fields).
export function toCard(row, origin) {
  return {
    id: row.id,
    name: row.name,
    area: row.area ?? row.city,
    city: row.city,
    highlights: highlights(row.hallCount, row.capacity),
    availableDates: availableLine(row.nextFreeDate),
    rating: row.reviewCount > 0 ? row.avgRating : 0,
    reviewCount: row.reviewCount,
    priceFrom: row.basePrice,
    priceUnit: 'per_person',
    image: absolute(origin, row.coverUrl),
    lat: row.lat,
    lng: row.lng,
    capacity: row.capacity,
    venueType: row.venueType,
    googleMapsUrl: row.googleMapsUrl,
  }
}

// asset: the hall's walkthrough_assets row (latest), only used when the owner chose 'upload' (REQ-11).
function toHall(h, venueId, origin, asset = null) {
  return {
    hallId: h.hall_id,
    venueId,
    name: h.name,
    capacity: h.capacity,
    standingCapacity: h.standing_capacity ?? h.capacity,
    setting: h.setting,
    hasAc: h.has_ac,
    lengthFt: h.length_ft,
    widthFt: h.width_ft,
    ceilingFt: h.ceiling_ft,
    description: h.description || `${h.name}.`,
    floorPlanUrl: h.floor_plan_url ? absolute(origin, h.floor_plan_url) : null,
    floorPlanType: h.floor_plan_type ?? 'image',
    zones: { stage: h.zone_stage, entrance: h.zone_entrance, seating: h.zone_seating },
    walkthrough: {
      mode: h.walkthrough_mode,
      url: h.walkthrough_url ?? '',
      file:
        h.walkthrough_mode === 'upload' && asset
          ? { url: absolute(origin, asset.file_url), assetType: asset.asset_type }
          : null,
    },
    hallCharge: '0.00', // D5: no hall hire field; the menu price covers the hall
  }
}

function toImage(image, { venueId, venueName, hallName, origin }) {
  const section = SECTION_FOR[image.category] ?? 'hall'
  return {
    imageId: image.image_id,
    venueId,
    hallId: image.hall_id,
    category: section,
    zone: image.category,
    imageUrl: absolute(origin, image.image_url),
    alt: `${venueName}${hallName ? `, ${hallName}` : ''}: ${image.category.replace('_', ' ')} photo`,
    verificationStatus: image.verification_status,
    isPublished: image.is_published,
    isCover: image.is_cover,
    aiScore: image.ai_score === null || image.ai_score === undefined ? null : Number(image.ai_score),
  }
}

// A platform review (REQ-42) as the venue page shows it. Hidden reviews never get here (removed_at IS NULL).
export function toPublicReview(r, venueId) {
  return {
    reviewId: r.review_id,
    venueId,
    customerName: r.customer_name,
    customerCity: `${r.customer_city}, Pakistan`,
    rating: r.rating,
    comment: r.comment ?? '',
    eventType: r.event_type,
    createdAt: iso(r.created_at),
  }
}

// The full venue (client getMockVenue shape). bundle from repository.loadVenueBundle; reviews, ratingCounts and
// bookedDates are passed separately because the admin review doesn't need them.
export function toVenueDetail(bundle, { origin, reviews = [], ratingRows = [], bookedDates = [] }) {
  const { base: v } = bundle
  const id = v.venue_id
  const assetByHall = new Map((bundle.walkthroughs ?? []).map((w) => [w.hall_id, w])) // ordered by upload: latest wins
  const halls = bundle.halls.map((h) => toHall(h, id, origin, assetByHall.get(h.hall_id)))
  const hallName = new Map(halls.map((h) => [h.hallId, h.name]))
  const images = bundle.images.map((image) =>
    toImage(image, { venueId: id, venueName: v.name, hallName: hallName.get(image.hall_id), origin }),
  )
  // Cover first, then the owner's order.
  images.sort((a, b) => Number(b.isCover) - Number(a.isCover))
  const gallery = halls.map((hall) => ({
    hallId: hall.hallId,
    sections: GALLERY_KEYS.map((key) => ({
      key,
      images: images.filter(
        (image) => (image.hallId === null || image.hallId === hall.hallId) && image.category === key,
      ),
    })),
  }))
  // Hero mosaic: hall 1's hall, stage, hall, entrance and parking photos when it has them, else the first five.
  const first = gallery[0] ? Object.fromEntries(gallery[0].sections.map((s) => [s.key, s.images])) : {}
  const mosaic = [first.hall?.[0], first.stage?.[0], first.hall?.[1], first.entrance?.[0], first.parking?.[0]].filter(
    Boolean,
  )
  const heroImages = mosaic.length === 5 ? mosaic : images.slice(0, 5)

  const itemsByMenu = new Map()
  for (const item of bundle.items) {
    if (!itemsByMenu.has(item.menu_id)) itemsByMenu.set(item.menu_id, [])
    itemsByMenu
      .get(item.menu_id)
      .push({ itemId: item.item_id, category: item.category, name: item.name, isOptional: item.is_optional })
  }
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const row of ratingRows) counts[row.rating] = row.n
  const reviewCount = Object.values(counts).reduce((a, b) => a + b, 0)
  const capacity = Math.max(v.capacity, ...halls.map((h) => h.capacity))
  const category = CATEGORY_LABELS[v.category] ?? 'Event venue'
  const area = v.area || v.city
  const houseRules = v.house_rules ?? []
  const policy = POLICY_LABELS[v.cancellation_policy]
  const slot = (type) => bundle.slotTemplates.find((t) => t.slot_type === type)
  const lunch = slot('lunch')
  const dinner = slot('dinner')
  const currentYear = new Date().getUTCFullYear()

  return {
    id,
    name: v.name,
    area,
    city: v.city,
    highlights: highlights(halls.length, capacity),
    availableDates: '',
    rating: reviewCount > 0 ? Number(v.avg_rating) : 0,
    reviewCount,
    priceFrom: v.base_price,
    priceUnit: 'per_person',
    image: images[0]?.imageUrl ?? '',
    tagline: v.headline || category,
    kindLabel: category,
    category: v.category,
    address: v.address.endsWith('Pakistan') ? v.address : `${v.address}, Pakistan`,
    lat: num(v.lat),
    lng: num(v.lng),
    nearby: v.landmark ? `${v.landmark_minutes ?? 10} min from ${v.landmark}` : `${area}, ${v.city}`,
    locationDescription: v.directions || `Located in ${area}, ${v.city}.`,
    venueType: v.venue_type,
    supportedEvents: v.supported_events,
    capacity,
    minGuests: 25,
    basePrice: v.base_price,
    facilities: (v.facilities ?? []).map((key) => AMENITY_FOR[key] ?? key),
    description: v.description,
    avgRating: Number(v.avg_rating),
    googleMapsUrl: v.google_maps_url ?? null, // srs-alignment #37: "Read reviews on Google" link-out only
    approvalStatus: v.approval_status,
    isActive: v.is_active,
    images,
    heroImages,
    gallery,
    menuPackages: bundle.menus.map((m) => ({
      menuId: m.menu_id,
      venueId: id,
      name: m.name,
      description: m.description,
      pricePerHead: m.price_per_head,
      isCustomizable: m.is_customizable,
      minGuests: m.min_guests,
      items: itemsByMenu.get(m.menu_id) ?? [],
    })),
    reviews: reviews.map((r) => toPublicReview(r, id)),
    ratingCounts: counts,
    bookedDates,
    addOns: bundle.addOns.map((a) => ({
      addOnId: a.add_on_id,
      venueId: id,
      type: a.type,
      name: a.name,
      description: a.description,
      price: a.price,
      isAvailable: a.is_available,
    })),
    halls,
    bookingTerms: {
      advancePercent: v.advance_percent,
      cancellationPolicy: v.cancellation_policy,
      customTiers: bundle.tiers.map((t) => ({
        fromDays: String(t.from_days),
        toDays: t.to_days === null ? '' : String(t.to_days),
        refundPercent: String(t.refund_percent),
      })),
      houseRules,
    },
    bridalSuite: bundle.bridalSuite
      ? {
          hallId: `${id}-suite`,
          venueId: id,
          name: bundle.bridalSuite.name,
          capacity: bundle.bridalSuite.capacity,
          standingCapacity: bundle.bridalSuite.capacity * 2,
          lengthFt: bundle.bridalSuite.length_ft,
          widthFt: bundle.bridalSuite.width_ft,
          description: bundle.bridalSuite.description,
        }
      : null,
    ratingCategories: [],
    host: {
      name: `${v.name} events team`,
      replyMinutes: null,
      isTopHost: reviewCount >= 5 && Number(v.avg_rating) >= 4.8,
      yearsHosting: v.hosting_since ? Math.max(1, currentYear - v.hosting_since) : null,
    },
    parkingSpaces: v.parking_spaces ?? 0,
    eventNotes: {
      timing: [
        lunch && `Day events from ${time12(lunch.start_time)}`,
        dinner && `Evening events until ${time12(dinner.end_time)}`,
      ].filter(Boolean),
      policies: [...houseRules, policy && `${policy} cancellation policy`].filter(Boolean),
    },
  }
}

// Everything the owner entered, structured (camelCase) so the client can rebuild the wizard draft from it
// (owner "edit and resubmit", admin review). File references carry their URL.
export function toListing(bundle, origin) {
  const { base: v } = bundle
  const walkByHall = new Map(bundle.walkthroughs.map((w) => [w.hall_id, w]))
  const suffix = [v.area, v.city, v.postal_code].filter(Boolean).join(', ')
  const street = suffix && v.address.endsWith(`, ${suffix}`) ? v.address.slice(0, -(suffix.length + 2)) : v.address
  const lunch = bundle.slotTemplates.find((t) => t.slot_type === 'lunch')
  const dinner = bundle.slotTemplates.find((t) => t.slot_type === 'dinner')
  return {
    id: v.venue_id,
    status: v.approval_status,
    isActive: v.is_active,
    rejectionReason: v.rejection_reason,
    changesNote: v.changes_note,
    suspensionReason: v.suspension_reason,
    submittedAt: iso(v.submitted_at),
    decidedAt: iso(v.reviewed_at),
    owner: {
      id: v.owner_id,
      name: v.owner_name,
      email: v.owner_email,
      phone: v.owner_phone,
      businessName: v.business_name,
    },
    venue: {
      category: v.category ?? '',
      name: v.name,
      city: v.city,
      street,
      area: v.area ?? '',
      postalCode: v.postal_code ?? '',
      lat: num(v.lat),
      lng: num(v.lng),
      googleMapsUrl: v.google_maps_url ?? null,
      supportedEvents: v.supported_events,
      facilities: v.facilities,
      headline: v.headline ?? '',
      description: v.description,
      hostingSince: v.hosting_since ? String(v.hosting_since) : '',
      landmark: v.landmark ?? '',
      landmarkMinutes: v.landmark_minutes ? String(v.landmark_minutes) : '',
      directions: v.directions ?? '',
      parkingSpaces: v.parking_spaces === null ? '' : String(v.parking_spaces),
      houseRules: v.house_rules ?? [],
      venueType: v.venue_type,
      capacity: v.capacity,
      basePrice: v.base_price,
    },
    halls: bundle.halls.map((h) => {
      const asset = walkByHall.get(h.hall_id)
      return {
        hallId: h.hall_id,
        name: h.name,
        capacity: String(h.capacity),
        standingCapacity: h.standing_capacity ? String(h.standing_capacity) : '',
        setting: h.setting,
        hasAc: h.has_ac,
        lengthFt: h.length_ft ? String(h.length_ft) : '',
        widthFt: h.width_ft ? String(h.width_ft) : '',
        ceilingFt: h.ceiling_ft ? String(h.ceiling_ft) : '',
        description: h.description,
        floorPlan: h.floor_plan_url
          ? {
              url: absolute(origin, h.floor_plan_url),
              type: h.floor_plan_type === 'pdf' ? 'application/pdf' : 'image/jpeg',
            }
          : null,
        zones: { stage: h.zone_stage, entrance: h.zone_entrance, seating: h.zone_seating },
        walkthrough: {
          mode: h.walkthrough_mode,
          url: h.walkthrough_url ?? '',
          file: asset ? { url: absolute(origin, asset.file_url), assetType: asset.asset_type } : null,
        },
      }
    }),
    bridalSuite: bundle.bridalSuite
      ? {
          enabled: true,
          name: bundle.bridalSuite.name,
          capacity: String(bundle.bridalSuite.capacity),
          lengthFt: bundle.bridalSuite.length_ft ? String(bundle.bridalSuite.length_ft) : '',
          widthFt: bundle.bridalSuite.width_ft ? String(bundle.bridalSuite.width_ft) : '',
          description: bundle.bridalSuite.description,
        }
      : { enabled: false },
    images: bundle.images.map((image) => ({
      imageId: image.image_id,
      hallId: image.hall_id,
      category: image.category,
      isCover: image.is_cover,
      url: absolute(origin, image.image_url),
      mimeType: image.mime_type,
      size: image.size_bytes,
      verificationStatus: image.verification_status,
      isPublished: image.is_published,
      aiScore: image.ai_score === null || image.ai_score === undefined ? null : Number(image.ai_score),
      // srs-alignment #42: the AI check against the threshold (owner and admin views only).
      check: {
        status: image.decision ?? 'pending',
        detection: image.detection_status,
        aiScorePercent:
          image.ai_score === null || image.ai_score === undefined ? null : Math.round(image.ai_score * 10_000) / 100,
        thresholdApplied: image.threshold_applied === null ? null : Number(image.threshold_applied),
        checkedAt: image.checked_at instanceof Date ? image.checked_at.toISOString() : null,
        reason: image.decision_reason ?? null,
      },
    })),
    menuPackages: bundle.menus.map((m) => ({
      menuId: m.menu_id,
      name: m.name,
      description: m.description,
      pricePerHead: m.price_per_head,
      isCustomizable: m.is_customizable,
      minGuests: String(m.min_guests),
      items: bundle.items
        .filter((item) => item.menu_id === m.menu_id)
        .map((item) => ({ itemId: item.item_id, name: item.name, category: item.category })),
    })),
    customMenuNote: v.custom_menu_note ?? '',
    addOns: bundle.addOns.map((a) => ({
      addOnId: a.add_on_id,
      type: a.type,
      name: a.name,
      description: a.description,
      price: a.price,
    })),
    bookingRules: {
      days: v.booking_days,
      slots: {
        lunch: lunch ? { enabled: true, start: hhmm(lunch.start_time), end: hhmm(lunch.end_time) } : { enabled: false },
        dinner: dinner
          ? { enabled: true, start: hhmm(dinner.start_time), end: hhmm(dinner.end_time) }
          : { enabled: false },
      },
      advancePercent: String(v.advance_percent),
      cancellationPolicy: v.cancellation_policy,
      customPolicy: {
        tiers: bundle.tiers.map((t) => ({
          fromDays: String(t.from_days),
          toDays: t.to_days === null ? '' : String(t.to_days),
          refundPercent: String(t.refund_percent),
        })),
        note: v.cancellation_note ?? '',
      },
    },
  }
}
