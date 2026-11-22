import { absolute } from '../venues/mappers.js'

// REQ-5 "a changed venue goes to Admin approval before customers see it" (srs-alignment #35). The fields REQ-5
// lists, plus halls, the bridal suite and booking rules, are compared in one normalised shape built either from a
// request body (the owner's proposal) or from the live rows. Stored as venue_revisions.changes / .previous.
//
//   { venue: { name, category, street, area, city, postalCode, lat, lng, supportedEvents, facilities, description },
//     halls: [{ hallId, name, capacity, standingCapacity, setting, hasAc, lengthFt, widthFt, ceilingFt, description,
//               zones, floorPlan: null | { keep } | { uploadId, url, type }, walkthrough: { mode, url, file } }],
//     bridalSuite: { enabled, name, capacity, lengthFt, widthFt, description },
//     bookingRules: { days, lunch, dinner, advancePercent, cancellationPolicy, tiers, note } }
//
// changes may also carry newHallPhotos: [{ imageId, hallId }] (photos of a hall that only exists once approved).

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const n = (t) => (t === '' || t === null || t === undefined ? null : Number(t))
const r6 = (x) => Math.round(Number(x) * 1e6) / 1e6
const sorted = (list) => [...new Set(list)].sort()
const hhmm = (t) => String(t).slice(0, 5)
const zones = (z) => ({ stage: z?.stage ?? null, entrance: z?.entrance ?? null, seating: z?.seating ?? null })
const byFromDays = (a, b) => b.fromDays - a.fromDays

// The street part of venues.address (it is stored as "street, area, city, postal").
export function streetOf(v) {
  const suffix = [v.area, v.city, v.postal_code].filter(Boolean).join(', ')
  return suffix && v.address.endsWith(`, ${suffix}`) ? v.address.slice(0, -(suffix.length + 2)) : v.address
}

// uploads: uploadId -> media_uploads row (storage url resolved by the caller as row.url).
export function approvalFromBody(body, uploads) {
  const v = body.venue
  const rules = body.bookingRules
  const custom = rules.cancellationPolicy === 'custom'
  const file = (id) => uploads.get(id)
  return {
    venue: {
      name: v.name,
      category: v.category,
      street: v.street,
      area: v.area,
      city: v.city,
      postalCode: v.postalCode || '',
      lat: r6(v.lat),
      lng: r6(v.lng),
      supportedEvents: sorted(v.supportedEvents),
      facilities: sorted([...v.facilities, ...v.customFacilities]),
      description: v.description,
    },
    halls: body.halls.map((h) => {
      const plan = h.floorPlanUploadId ? file(h.floorPlanUploadId) : null
      const w = h.walkthrough
      const walk = w.mode === 'upload' && w.uploadId ? file(w.uploadId) : null
      return {
        hallId: h.hallId,
        name: h.name,
        capacity: n(h.capacity),
        standingCapacity: n(h.standingCapacity),
        setting: h.setting,
        hasAc: h.hasAc,
        lengthFt: n(h.lengthFt),
        widthFt: n(h.widthFt),
        ceilingFt: n(h.ceilingFt),
        description: h.description ?? '',
        zones: zones(h.zones),
        floorPlan: plan
          ? {
              uploadId: h.floorPlanUploadId,
              url: plan.url,
              type: plan.mime_type === 'application/pdf' ? 'pdf' : 'image',
            }
          : h.keepFloorPlan
            ? { keep: true }
            : null,
        walkthrough: {
          mode: w.mode,
          url: w.mode === 'link' ? w.url : null,
          file:
            w.mode !== 'upload'
              ? null
              : walk
                ? {
                    uploadId: w.uploadId,
                    url: walk.url,
                    assetType: walk.mime_type === 'model/gltf-binary' ? 'model_3d' : 'panorama_360',
                  }
                : { keep: true },
        },
      }
    }),
    bridalSuite: body.bridalSuite.enabled
      ? {
          enabled: true,
          name: body.bridalSuite.name,
          capacity: n(body.bridalSuite.capacity),
          lengthFt: n(body.bridalSuite.lengthFt),
          widthFt: n(body.bridalSuite.widthFt),
          description: body.bridalSuite.description ?? '',
        }
      : { enabled: false },
    bookingRules: {
      days: DAYS.filter((d) => rules.days.includes(d)),
      lunch: rules.slots.lunch.enabled ? { start: rules.slots.lunch.start, end: rules.slots.lunch.end } : null,
      dinner: rules.slots.dinner.enabled ? { start: rules.slots.dinner.start, end: rules.slots.dinner.end } : null,
      advancePercent: n(rules.advancePercent),
      cancellationPolicy: rules.cancellationPolicy,
      tiers: custom
        ? (rules.customPolicy?.tiers ?? [])
            .map((t) => ({ fromDays: n(t.fromDays), toDays: n(t.toDays), refundPercent: n(t.refundPercent) }))
            .sort(byFromDays)
        : [],
      note: custom ? rules.customPolicy?.note || null : null,
    },
  }
}

export function approvalFromBundle(bundle) {
  const v = bundle.base
  const walk = new Map(bundle.walkthroughs.map((w) => [w.hall_id, w]))
  const slot = (type) => bundle.slotTemplates.find((t) => t.slot_type === type)
  const lunch = slot('lunch')
  const dinner = slot('dinner')
  const suite = bundle.bridalSuite
  const custom = v.cancellation_policy === 'custom'
  return {
    venue: {
      name: v.name,
      category: v.category,
      street: streetOf(v),
      area: v.area ?? '',
      city: v.city,
      postalCode: v.postal_code ?? '',
      lat: r6(v.lat),
      lng: r6(v.lng),
      supportedEvents: sorted(v.supported_events),
      facilities: sorted(v.facilities ?? []),
      description: v.description,
    },
    halls: bundle.halls.map((h) => ({
      hallId: h.hall_id,
      name: h.name,
      capacity: h.capacity,
      standingCapacity: h.standing_capacity,
      setting: h.setting,
      hasAc: h.has_ac,
      lengthFt: h.length_ft,
      widthFt: h.width_ft,
      ceilingFt: h.ceiling_ft,
      description: h.description ?? '',
      zones: { stage: h.zone_stage, entrance: h.zone_entrance, seating: h.zone_seating },
      floorPlan: h.floor_plan_url ? { keep: true } : null,
      walkthrough: {
        mode: h.walkthrough_mode,
        url: h.walkthrough_mode === 'link' ? h.walkthrough_url : null,
        file: h.walkthrough_mode === 'upload' ? (walk.has(h.hall_id) ? { keep: true } : null) : null,
      },
    })),
    bridalSuite: suite
      ? {
          enabled: true,
          name: suite.name,
          capacity: suite.capacity,
          lengthFt: suite.length_ft,
          widthFt: suite.width_ft,
          description: suite.description ?? '',
        }
      : { enabled: false },
    bookingRules: {
      days: DAYS.filter((d) => (v.booking_days ?? []).includes(d)),
      lunch: lunch ? { start: hhmm(lunch.start_time), end: hhmm(lunch.end_time) } : null,
      dinner: dinner ? { start: hhmm(dinner.start_time), end: hhmm(dinner.end_time) } : null,
      advancePercent: v.advance_percent,
      cancellationPolicy: v.cancellation_policy,
      tiers: custom
        ? bundle.tiers
            .map((t) => ({ fromDays: t.from_days, toDays: t.to_days, refundPercent: t.refund_percent }))
            .sort(byFromDays)
        : [],
      note: custom ? v.cancellation_note || null : null,
    },
  }
}

const comparable = ({ venue, halls, bridalSuite, bookingRules }) =>
  JSON.stringify({ venue, halls, bridalSuite, bookingRules })
export const sameApproval = (a, b) => comparable(a) === comparable(b)

// ---------------------------------------------------------------- old vs new, for the admin and the owner

const LABELS = {
  name: 'Venue name',
  category: 'Venue type',
  supportedEvents: 'Events hosted',
  facilities: 'Amenities',
  description: 'Description',
}
const HALL_LABELS = {
  name: 'Name',
  capacity: 'Seated capacity',
  standingCapacity: 'Standing capacity',
  setting: 'Setting',
  hasAc: 'Air conditioning',
  lengthFt: 'Length (ft)',
  widthFt: 'Width (ft)',
  ceilingFt: 'Ceiling (ft)',
  description: 'Description',
}
const SUITE_LABELS = {
  name: 'Name',
  capacity: 'Capacity',
  lengthFt: 'Length (ft)',
  widthFt: 'Width (ft)',
  description: 'Description',
}
const SETTINGS = { indoor: 'Indoor', outdoor: 'Outdoor', semi_outdoor: 'Semi-outdoor' }
const ZONE_CELLS = [
  'back left',
  'back centre',
  'back right',
  'middle left',
  'middle centre',
  'middle right',
  'front left',
  'front centre',
  'front right',
]
const POLICIES = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict', custom: 'Custom' }

function show(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  return String(value)
}

const address = (v) => [v.street, v.area, v.city, v.postalCode].filter(Boolean).join(', ')
const slotText = (s) => (s ? `${s.start} to ${s.end}` : 'Not offered')
const tiersText = (tiers) =>
  tiers.length
    ? tiers
        .map((t) => `${t.fromDays}${t.toDays === null ? '+' : `–${t.toDays}`} days: ${t.refundPercent}% back`)
        .join('; ')
    : '—'
const zonesText = (z) =>
  ['stage', 'entrance', 'seating']
    .filter((k) => z[k] !== null)
    .map((k) => `${k} at ${ZONE_CELLS[z[k]]}`)
    .join(', ') || '—'
const fileText = (f) => (!f ? 'None' : f.keep ? 'Current file' : 'New file uploaded')
const walkText = (w) =>
  w.mode === 'link'
    ? `Link: ${w.url}`
    : w.mode === 'upload'
      ? `Upload (${fileText(w.file)})`
      : { generate: 'Generated from the size', skip: 'None' }[w.mode]
const hallSummary = (h) =>
  `${h.capacity} seated, ${h.lengthFt} × ${h.widthFt} ft, ${h.ceilingFt} ft ceiling, ${SETTINGS[h.setting] ?? h.setting}`

// -> [{ section, label, before, after, afterUrl? }] for every field that differs.
export function revisionDiff(prev, next, origin = null) {
  const rows = []
  const add = (section, label, a, b, extra = {}) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      rows.push({ section, label, before: show(a), after: show(b), ...extra })
  }
  for (const key of Object.keys(LABELS)) add('Venue', LABELS[key], prev.venue[key], next.venue[key])
  add('Venue', 'Address', address(prev.venue), address(next.venue))
  add('Venue', 'Map pin', `${prev.venue.lat}, ${prev.venue.lng}`, `${next.venue.lat}, ${next.venue.lng}`)

  const before = new Map(prev.halls.map((h) => [h.hallId, h]))
  for (const h of next.halls) {
    const old = before.get(h.hallId)
    if (!old) {
      rows.push({ section: 'Halls', label: `${h.name} (new hall)`, before: '—', after: hallSummary(h) })
      continue
    }
    for (const key of Object.keys(HALL_LABELS)) {
      const a = key === 'setting' ? SETTINGS[old[key]] : old[key]
      const b = key === 'setting' ? SETTINGS[h[key]] : h[key]
      add('Halls', `${h.name}: ${HALL_LABELS[key]}`, a, b)
    }
    add('Halls', `${h.name}: Layout`, zonesText(old.zones), zonesText(h.zones))
    if (JSON.stringify(old.floorPlan) !== JSON.stringify(h.floorPlan))
      rows.push({
        section: 'Halls',
        label: `${h.name}: Floor plan`,
        before: fileText(old.floorPlan),
        after: fileText(h.floorPlan),
        ...(h.floorPlan?.url ? { afterUrl: absolute(origin, h.floorPlan.url) } : {}),
      })
    if (JSON.stringify(old.walkthrough) !== JSON.stringify(h.walkthrough))
      rows.push({
        section: 'Halls',
        label: `${h.name}: 3D walkthrough`,
        before: walkText(old.walkthrough),
        after: walkText(h.walkthrough),
        ...(h.walkthrough.file?.url
          ? { afterUrl: absolute(origin, h.walkthrough.file.url), afterAssetType: h.walkthrough.file.assetType }
          : {}),
      })
  }
  const kept = new Set(next.halls.map((h) => h.hallId))
  for (const h of prev.halls)
    if (!kept.has(h.hallId))
      rows.push({ section: 'Halls', label: `${h.name} (removed)`, before: hallSummary(h), after: 'Removed' })

  const a = prev.bridalSuite
  const b = next.bridalSuite
  if (a.enabled !== b.enabled)
    add('Bridal suite', 'Bridal suite', a.enabled ? a.name : 'None', b.enabled ? b.name : 'None')
  else if (a.enabled)
    for (const key of Object.keys(SUITE_LABELS)) add('Bridal suite', SUITE_LABELS[key], a[key], b[key])

  const r1 = prev.bookingRules
  const r2 = next.bookingRules
  add('Booking rules', 'Booking days', r1.days, r2.days)
  add('Booking rules', 'Lunch slot', slotText(r1.lunch), slotText(r2.lunch))
  add('Booking rules', 'Dinner slot', slotText(r1.dinner), slotText(r2.dinner))
  add('Booking rules', 'Advance payment', `${r1.advancePercent}%`, `${r2.advancePercent}%`)
  add('Booking rules', 'Cancellation policy', POLICIES[r1.cancellationPolicy], POLICIES[r2.cancellationPolicy])
  add('Booking rules', 'Refund rules', tiersText(r1.tiers), tiersText(r2.tiers))
  add('Booking rules', 'Policy note', r1.note, r2.note)
  return rows
}

// The owner's editor shows the pending proposal, not the live values, so a second edit doesn't drop the first.
// listing = mappers.toListing(...) of the live venue. Returns a new listing with the proposal applied.
export function overlayRevision(listing, changes, origin) {
  const live = new Map(listing.halls.map((h) => [h.hallId, h]))
  const s = (x) => (x === null || x === undefined ? '' : String(x))
  const c = changes
  const out = {
    ...listing,
    venue: {
      ...listing.venue,
      name: c.venue.name,
      category: c.venue.category,
      street: c.venue.street,
      area: c.venue.area,
      city: c.venue.city,
      postalCode: c.venue.postalCode,
      lat: c.venue.lat,
      lng: c.venue.lng,
      supportedEvents: c.venue.supportedEvents,
      facilities: c.venue.facilities,
      description: c.venue.description,
    },
    halls: c.halls.map((h) => {
      const old = live.get(h.hallId)
      const f = h.walkthrough.file
      return {
        hallId: h.hallId,
        name: h.name,
        capacity: s(h.capacity),
        standingCapacity: s(h.standingCapacity),
        setting: h.setting,
        hasAc: h.hasAc,
        lengthFt: s(h.lengthFt),
        widthFt: s(h.widthFt),
        ceilingFt: s(h.ceilingFt),
        description: h.description,
        zones: h.zones,
        floorPlan: h.floorPlan?.keep
          ? (old?.floorPlan ?? null)
          : h.floorPlan
            ? {
                url: absolute(origin, h.floorPlan.url),
                type: h.floorPlan.type === 'pdf' ? 'application/pdf' : 'image/jpeg',
                uploadId: h.floorPlan.uploadId,
              }
            : null,
        walkthrough: {
          mode: h.walkthrough.mode,
          url: h.walkthrough.url ?? '',
          file: f?.keep
            ? (old?.walkthrough.file ?? null)
            : f
              ? { url: absolute(origin, f.url), assetType: f.assetType, uploadId: f.uploadId }
              : null,
        },
      }
    }),
    bridalSuite: c.bridalSuite.enabled
      ? {
          enabled: true,
          name: c.bridalSuite.name,
          capacity: s(c.bridalSuite.capacity),
          lengthFt: s(c.bridalSuite.lengthFt),
          widthFt: s(c.bridalSuite.widthFt),
          description: c.bridalSuite.description,
        }
      : { enabled: false },
    bookingRules: {
      days: c.bookingRules.days,
      slots: {
        lunch: c.bookingRules.lunch ? { enabled: true, ...c.bookingRules.lunch } : { enabled: false },
        dinner: c.bookingRules.dinner ? { enabled: true, ...c.bookingRules.dinner } : { enabled: false },
      },
      advancePercent: s(c.bookingRules.advancePercent),
      cancellationPolicy: c.bookingRules.cancellationPolicy,
      customPolicy: {
        tiers: c.bookingRules.tiers.map((t) => ({
          fromDays: s(t.fromDays),
          toDays: s(t.toDays),
          refundPercent: s(t.refundPercent),
        })),
        note: c.bookingRules.note ?? '',
      },
    },
  }
  const photoHall = new Map((c.newHallPhotos ?? []).map((p) => [p.imageId, p.hallId]))
  out.images = listing.images.map((image) =>
    photoHall.has(image.imageId) ? { ...image, hallId: photoHall.get(image.imageId) } : image,
  )
  return out
}
