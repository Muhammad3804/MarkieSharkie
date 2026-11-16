import { z } from 'zod'
import {
  ADD_ON_TYPES,
  AMENITY_KEYS,
  CANCELLATION_POLICIES,
  CITIES,
  EVENT_TYPES,
  HALL_SETTINGS,
  MAX_PHOTOS,
  MIN_PHOTOS,
  PAKISTAN_BOUNDS,
  VENUE_CATEGORIES,
  WEEKDAYS,
} from './options.js'
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

const nameStep = z.object({ venue: z.object({ name: trimmed(3, 80, 'the venue name') }) })

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

const googleMapsUrl = z
  .string()
  .trim()
  .refine((text) => {
    if (text === '') return true
    try {
      const url = new URL(text)
      const host = url.hostname.replace(/^www\./, '')
      return url.protocol === 'https:' && (host === 'maps.app.goo.gl' || host === 'goo.gl' || (host.startsWith('google.') && url.pathname.startsWith('/maps')) || host === 'maps.google.com')
    } catch {
      return false
    }
  }, 'Paste a Google Maps link that starts with https://maps.app.goo.gl or https://www.google.com/maps.')

const outside = 'The pin is outside Pakistan. Drag it onto your venue.'
const pinStep = z.object({
  venue: z.object({
    lat: z.number({ error: 'Place the pin on your venue.' }).min(PAKISTAN_BOUNDS.minLat, outside).max(PAKISTAN_BOUNDS.maxLat, outside),
    lng: z.number({ error: 'Place the pin on your venue.' }).min(PAKISTAN_BOUNDS.minLng, outside).max(PAKISTAN_BOUNDS.maxLng, outside),
    googleMapsUrl,
  }),
})

const hall = z.object({
  name: trimmed(2, 60, 'the hall name'),
  capacity: wholeNumber('seated capacity', MIN_GUESTS, 10000),
  // Optional: '' or a whole number. Not a z.union, which would replace these messages with "Invalid input".
  standingCapacity: z
    .string()
    .trim()
    .refine((text) => text === '' || /^\d+$/.test(text), 'Use a whole number for standing capacity, like 800.')
    .refine((text) => !/^\d+$/.test(text) || Number(text) >= MIN_GUESTS, `Standing capacity must be at least ${MIN_GUESTS}.`)
    .refine((text) => !/^\d+$/.test(text) || Number(text) <= 20000, 'Standing capacity can be at most 20,000.'),
  setting: z.enum(values(HALL_SETTINGS)),
  hasAc: z.boolean(),
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
        items: z
          .array(z.object({ name: trimmed(1, 60, 'the dish name') }))
          .min(1, 'Add at least one dish.')
          .max(40, 'A package can list up to 40 dishes.'),
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

export const STEP_SCHEMAS = {
  'venue-type': venueTypeStep,
  name: nameStep,
  location: locationStep,
  pin: pinStep,
  halls: hallsStep,
  events: eventsStep,
  amenities: amenitiesStep,
  photos: photosStep,
  title: titleStep,
  menus: menusStep,
  custom: customStep,
  rules: rulesStep,
}

const EXTRA_CHECKS = { halls: uniqueHallNames, photos: photosCoverHalls, menus: menuFitsHalls, rules: slotsFit }

// { valid, errors: { 'halls.0.name': 'message', ... } }. Steps without a schema (intros, review) are always valid.
export function validateStep(stepId, draft) {
  const schema = STEP_SCHEMAS[stepId]
  if (!schema) return { valid: true, errors: {} }
  const errors = {}
  const result = schema.safeParse(draft)
  if (!result.success) {
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
