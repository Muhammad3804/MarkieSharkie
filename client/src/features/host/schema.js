import { MAPS_LINK_MESSAGE, isGoogleMapsUrl } from '../../lib/googleMaps.js'
import { z } from 'zod'
import {
  ADD_ON_TYPES,
  AMENITY_KEYS,
  CANCELLATION_POLICIES,
  CITIES,
  EVENT_TYPES,
  HALL_SETTINGS,
  HOUSE_RULES,
  LAYOUT_ZONES,
  MAX_DISHES,
  MAX_PHOTOS,
  MAX_POLICY_TIERS,
  MIN_PHOTOS,
  PAKISTAN_BOUNDS,
  VENUE_CATEGORIES,
  WALKTHROUGH_MODES,
  WEEKDAYS,
} from './options.js'
import { dishCount, sectionKey } from './draft.js'
import { MIN_GUESTS } from '../../lib/booking.js'

// Validation for every wizard step, in one place. Each schema takes the whole draft and returns errors keyed
// by a dotted path ("halls.0.capacity") that matches the field ids in the step components.
// The server validates the same rules again with Zod at the route boundary (CLAUDE.md rule 7).

const values = (list) => list.map((item) => item.value)
const trimmed = (min, max, label) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `Enter ${label}.` : `${capitalise(label)} needs at least ${min} characters.`)
    .max(max, `Keep ${label} under ${max + 1} characters.`)
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// Whole number typed into a text field, between min and max.
const wholeNumber = (label, min, max) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .regex(/^\d+$/, `Use a whole number for ${label}, like 300.`)
    .refine((text) => Number(text) >= min, `${capitalise(label)} must be at least ${min.toLocaleString('en-US')}.`)
    .refine((text) => Number(text) <= max, `${capitalise(label)} can be at most ${max.toLocaleString('en-US')}.`)

// Optional whole number: '' or a number in range. Not a z.union, which would replace these messages with
// "Invalid input".
const optionalWhole = (label, min, max) =>
  z
    .string()
    .trim()
    .refine((text) => text === '' || /^\d+$/.test(text), `Use a whole number for ${label}.`)
    .refine((text) => !/^\d+$/.test(text) || Number(text) >= min, `${capitalise(label)} must be at least ${min.toLocaleString('en-US')}.`)
    .refine((text) => !/^\d+$/.test(text) || Number(text) <= max, `${capitalise(label)} can be at most ${max.toLocaleString('en-US')}.`)

const optionalText = (max, label) => z.string().trim().max(max, `Keep ${label} under ${max + 1} characters.`)

// Rupee amount typed into a text field: digits, optional paisa. Never parsed as a float (money.js does the maths).
const rupees = (label, { allowZero = false } = {}) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .regex(/^\d{1,7}(\.\d{1,2})?$/, `Enter ${label} in rupees using digits only, like 2500.`)
    .refine((text) => allowZero || Number(text) > 0, `${capitalise(label)} must be more than Rs. 0.`)

const venueTypeStep = z.object({
  venue: z.object({ category: z.enum(values(VENUE_CATEGORIES), { error: 'Pick the option that fits your venue best.' }) }),
})

const thisYear = new Date().getFullYear()
const nameStep = z.object({
  venue: z.object({
    name: trimmed(3, 80, 'the venue name'),
    hostingSince: optionalWhole('the year', 1947, thisYear),
  }),
})

const locationStep = z.object({
  venue: z.object({
    city: z.enum(values(CITIES), { error: 'Choose your city.' }),
    street: trimmed(5, 160, 'the street address'),
    area: trimmed(2, 80, 'the area'),
    postalCode: z
      .string()
      .trim()
      .regex(/^(\d{5})?$/, 'Postal codes in Pakistan have 5 digits, like 38000.'),
  }),
})

// Optional. Same rules as the server (lib/googleMaps.js): https, Google's Maps hosts only, 500 characters max.
const googleMapsUrl = z
  .string()
  .trim()
  .max(500, 'That link is too long. Use the short link from Share, then Copy link.')
  .refine((text) => text === '' || isGoogleMapsUrl(text), MAPS_LINK_MESSAGE)

const outside = 'The pin is outside Pakistan. Drag it onto your venue.'
const pinStep = z.object({
  venue: z.object({
    lat: z.number({ error: 'Place the pin on your venue.' }).min(PAKISTAN_BOUNDS.minLat, outside).max(PAKISTAN_BOUNDS.maxLat, outside),
    lng: z.number({ error: 'Place the pin on your venue.' }).min(PAKISTAN_BOUNDS.minLng, outside).max(PAKISTAN_BOUNDS.maxLng, outside),
    googleMapsUrl,
  }),
})

const directionsStep = z.object({
  venue: z.object({
    landmark: optionalText(80, 'the landmark'),
    landmarkMinutes: optionalWhole('the travel time', 1, 180),
    directions: optionalText(500, 'the directions'),
  }),
})

const hall = z.object({
  name: trimmed(2, 60, 'the hall name'),
  capacity: wholeNumber('seated capacity', MIN_GUESTS, 10000),
  standingCapacity: optionalWhole('standing capacity', MIN_GUESTS, 20000),
  setting: z.enum(values(HALL_SETTINGS)),
  hasAc: z.boolean(),
  lengthFt: wholeNumber('the length', 10, 1000),
  widthFt: wholeNumber('the width', 10, 1000),
  ceilingFt: wholeNumber('the ceiling height', 8, 100),
  description: optionalText(300, 'the description'),
})

const bridalStep = z.object({
  bridalSuite: z.discriminatedUnion('enabled', [
    z.object({ enabled: z.literal(false) }),
    z.object({
      enabled: z.literal(true),
      name: trimmed(2, 60, 'the suite name'),
      capacity: wholeNumber('the capacity', 1, 200),
      lengthFt: optionalWhole('the length', 5, 200),
      widthFt: optionalWhole('the width', 5, 200),
      description: optionalText(300, 'the description'),
    }),
  ]),
})

const hallsStep = z.object({
  halls: z
    .array(hall)
    .min(1, 'Add at least one hall.')
    .max(10, 'You can list up to 10 halls.'),
})

const eventsStep = z.object({
  venue: z.object({
    supportedEvents: z.array(z.enum(values(EVENT_TYPES))).min(1, 'Pick at least one kind of event you host.'),
  }),
})

const amenitiesStep = z.object({
  venue: z.object({
    facilities: z.array(z.enum(AMENITY_KEYS)),
    customFacilities: z.array(trimmed(2, 40, 'the amenity')).max(10, 'You can add up to 10 of your own amenities.'),
    parkingSpaces: optionalWhole('the number of cars', 1, 5000),
  }),
})

const photosStep = z.object({
  venueImages: z
    .array(z.object({ imageId: z.string(), hallId: z.string().nullable(), isCover: z.boolean() }))
    .min(MIN_PHOTOS, `Add at least ${MIN_PHOTOS} photos.`)
    .max(MAX_PHOTOS, `You can add up to ${MAX_PHOTOS} photos.`),
})

const titleStep = z.object({
  venue: z.object({
    headline: trimmed(10, 60, 'the title'),
    description: trimmed(50, 1000, 'the description'),
  }),
})

const menusStep = z.object({
  menuPackages: z
    .array(
      z.object({
        name: trimmed(2, 60, 'the package name'),
        description: z.string().trim().max(200, 'Keep the description under 201 characters.'),
        pricePerHead: rupees('the price per guest'),
        minGuests: wholeNumber('the minimum guest count', 1, 10000),
        sections: z
          .array(z.object({ name: trimmed(2, 40, 'the section name'), items: z.array(z.object({ name: trimmed(1, 60, 'the dish name') })) }))
          .max(15, 'A package can have up to 15 sections.'),
      }),
    )
    .min(1, 'Add at least one menu package.')
    .max(10, 'You can add up to 10 packages.'),
})

const customStep = z.object({
    customMenu: z.object({ accepts: z.boolean(), note: z.string().trim().max(300, 'Keep the note under 301 characters.') }),
    addOns: z
      .array(
        z.object({
          type: z.enum(values(ADD_ON_TYPES)),
          name: trimmed(2, 60, 'the add-on name'),
          description: z.string().trim().max(200, 'Keep the description under 201 characters.'),
          price: rupees('the price'),
        }),
      )
      .max(10, 'You can add up to 10 add-ons.'),
})

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time, like 19:00.')
const slot = z
  .object({ enabled: z.boolean(), start: time, end: time })
  .refine((s) => !s.enabled || s.end > s.start, { path: ['end'], message: 'End time must be after the start time. Slots can’t run past midnight.' })

const rulesStep = z.object({
  bookingRules: z.object({
    days: z.array(z.enum(values(WEEKDAYS))).min(1, 'Pick at least one day you take bookings.'),
    slots: z.object({ lunch: slot, dinner: slot }),
    advancePercent: wholeNumber('the advance', 0, 100),
    cancellationPolicy: z.enum(values(CANCELLATION_POLICIES), { error: 'Choose a cancellation policy.' }),
  }),
})

const houseRulesStep = z.object({
  venue: z.object({
    houseRules: z.array(z.enum(HOUSE_RULES.map((rule) => rule.key))),
    customHouseRules: z.array(trimmed(3, 80, 'the rule')).max(10, 'You can add up to 10 of your own rules.'),
  }),
})

// Cross-field rules. Plain functions rather than Zod refinements, because Zod skips an object's refinements once
// any field in it fails, and these messages should show alongside the field errors.

// halls_name_per_venue: names must be unique within the venue.
function uniqueHallNames(draft) {
  const errors = {}
  const seen = new Set()
  draft.halls.forEach((hall, index) => {
    const key = hall.name.trim().toLowerCase()
    if (key && seen.has(key)) errors[`halls.${index}.name`] = 'Each hall needs its own name.'
    seen.add(key)
  })
  return errors
}

function photosCoverHalls(draft) {
  const errors = {}
  for (const hall of draft.halls) {
    if (!draft.venueImages.some((image) => image.hallId === hall.hallId)) {
      errors[`photos.${hall.hallId}`] = `Add at least one photo of ${hall.name.trim() || 'this hall'}.`
    }
  }
  if (draft.venueImages.length && !draft.venueImages.some((image) => image.isCover)) errors['photos.cover'] = 'Choose a cover photo.'
  if (draft.venueImages.some((image) => image.missing)) {
    errors['photos.missing'] = 'Some photos are no longer saved on this device. Remove the ones marked “not available” and add them again.'
  }
  return errors
}

function slotsFit(draft) {
  const { lunch, dinner } = draft.bookingRules.slots
  if (!lunch.enabled && !dinner.enabled) return { 'bookingRules.slots': 'Offer at least one time slot.' }
  // time_slots_no_overlap: lunch has to end before dinner starts.
  if (lunch.enabled && dinner.enabled && lunch.end > dinner.start) return { 'bookingRules.slots.dinner.start': 'Dinner has to start after lunch ends.' }
  return {}
}

// Menu minimum guests can't exceed the largest hall (nobody could ever book it).
function menuFitsHalls(draft) {
  const largest = Math.max(0, ...draft.halls.map((h) => Number(h.capacity) || 0))
  const errors = {}
  draft.menuPackages.forEach((menu, index) => {
    if (/^\d+$/.test(menu.minGuests.trim()) && largest && Number(menu.minGuests) > largest) {
      errors[`menuPackages.${index}.minGuests`] = `Your largest hall seats ${largest.toLocaleString('en-US')}, so the minimum can’t be higher.`
    }
  })
  return errors
}

// "15 min from Clock Tower" needs both halves.
function landmarkPair(draft) {
  const { landmark, landmarkMinutes } = draft.venue
  if (landmark.trim() && !landmarkMinutes.trim()) return { 'venue.landmarkMinutes': 'Add how many minutes away it is, or clear the landmark.' }
  if (!landmark.trim() && landmarkMinutes.trim()) return { 'venue.landmark': 'Name the landmark, or clear the minutes.' }
  return {}
}

// At least one dish per package, section names unique within the package, and a cap on dishes.
function menuSections(draft) {
  const errors = {}
  draft.menuPackages.forEach((menu, index) => {
    const dishes = dishCount(menu)
    if (dishes === 0) errors[`menuPackages.${index}.sections`] = 'Add at least one dish to any section.'
    if (dishes > MAX_DISHES) errors[`menuPackages.${index}.sections`] = `A package can list up to ${MAX_DISHES} dishes.`
    const seen = new Set()
    menu.sections.forEach((section, sectionIndex) => {
      const key = sectionKey(section.name)
      const path = `menuPackages.${index}.sections.${sectionIndex}.name`
      if (!key && section.items.length) errors[path] = 'Name this section, or remove it.'
      else if (key && seen.has(key)) errors[path] = 'Each section needs its own name.'
      seen.add(key)
    })
  })
  return errors
}

// Two zones can't sit in the same cell of the plan.
function zonesApart(draft) {
  const errors = {}
  draft.halls.forEach((hall, index) => {
    const taken = new Map()
    for (const zone of LAYOUT_ZONES) {
      const cell = hall.zones[zone.key]
      if (cell == null) continue
      if (taken.has(cell)) errors[`halls.${index}.zones.${zone.key}`] = `${zone.label} is in the same spot as ${taken.get(cell)}. Pick another spot.`
      else taken.set(cell, zone.label.toLowerCase())
    }
  })
  return errors
}

const isHttpsUrl = (text) => {
  try {
    return new URL(text).protocol === 'https:'
  } catch {
    return false
  }
}

function walkthroughs(draft) {
  const errors = {}
  draft.halls.forEach((hall, index) => {
    const { mode, file, url } = hall.walkthrough
    if (!WALKTHROUGH_MODES.some((m) => m.value === mode)) errors[`halls.${index}.walkthrough.mode`] = 'Choose an option for this hall.'
    if (mode === 'upload' && !file) errors[`halls.${index}.walkthrough.file`] = 'Upload a .glb model or a 360° photo, or pick another option.'
    if (mode === 'link' && !isHttpsUrl(url.trim())) errors[`halls.${index}.walkthrough.url`] = 'Paste a full link that starts with https://, like https://my.matterport.com/show/?m=…'
  })
  return errors
}

// Custom cancellation policy: valid rows that don't overlap. A row covers [fromDays, toDays) days before the event;
// an empty toDays means "or more".
function customPolicy(draft) {
  const { cancellationPolicy, customPolicy: policy } = draft.bookingRules
  if (cancellationPolicy !== 'custom') return {}
  const errors = {}
  const base = 'bookingRules.customPolicy'
  if (!policy.tiers.length) errors[`${base}.tiers`] = 'Add at least one rule.'
  if (policy.tiers.length > MAX_POLICY_TIERS) errors[`${base}.tiers`] = `Use up to ${MAX_POLICY_TIERS} rules.`
  if (policy.note.trim().length > 300) errors[`${base}.note`] = 'Keep the note under 301 characters.'
  const ranges = []
  policy.tiers.forEach((tier, index) => {
    const path = `${base}.tiers.${index}`
    const from = tier.fromDays.trim()
    const to = tier.toDays.trim()
    const refund = tier.refundPercent.trim()
    if (!/^\d+$/.test(from) || Number(from) > 365) errors[`${path}.fromDays`] = 'Enter whole days from 0 to 365.'
    if (to && (!/^\d+$/.test(to) || Number(to) > 366)) errors[`${path}.toDays`] = 'Enter whole days up to 366, or leave it empty for “or more”.'
    else if (to && /^\d+$/.test(from) && Number(to) <= Number(from)) errors[`${path}.toDays`] = 'This has to be more than the “from” days.'
    if (!/^\d+$/.test(refund) || Number(refund) > 100) errors[`${path}.refundPercent`] = 'Enter a refund from 0 to 100%.'
    if (!errors[`${path}.fromDays`] && !errors[`${path}.toDays`]) ranges.push({ index, from: Number(from), to: to ? Number(to) : Infinity })
  })
  for (let a = 0; a < ranges.length; a++) {
    for (let b = a + 1; b < ranges.length; b++) {
      const [x, y] = [ranges[a], ranges[b]]
      if (x.from < y.to && y.from < x.to) {
        errors[`${base}.tiers.${y.index}.fromDays`] ??= `Overlaps rule ${x.index + 1}. Each day count can only be in one rule.`
      }
    }
  }
  return errors
}

export const STEP_SCHEMAS = {
  'venue-type': venueTypeStep,
  name: nameStep,
  location: locationStep,
  pin: pinStep,
  directions: directionsStep,
  halls: hallsStep,
  'bridal-suite': bridalStep,
  events: eventsStep,
  amenities: amenitiesStep,
  photos: photosStep,
  title: titleStep,
  menus: menusStep,
  custom: customStep,
  rules: rulesStep,
  'house-rules': houseRulesStep,
}

const EXTRA_CHECKS = {
  directions: landmarkPair,
  halls: uniqueHallNames,
  photos: photosCoverHalls,
  layout: zonesApart,
  walkthrough: walkthroughs,
  menus: (draft) => ({ ...menuSections(draft), ...menuFitsHalls(draft) }),
  rules: (draft) => ({ ...slotsFit(draft), ...customPolicy(draft) }),
}

// { valid, errors: { "halls.0.name": "message", ... } }. Steps with neither a schema nor checks (intros, review) are always valid.
export function validateStep(stepId, draft) {
  const schema = STEP_SCHEMAS[stepId]
  const errors = {}
  const result = schema?.safeParse(draft)
  if (result && !result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.')
      if (!(key in errors)) errors[key] = issue.message
    }
  }
  for (const [key, message] of Object.entries(EXTRA_CHECKS[stepId]?.(draft) ?? {})) {
    if (!(key in errors)) errors[key] = message
  }
  return { valid: Object.keys(errors).length === 0, errors }
}
