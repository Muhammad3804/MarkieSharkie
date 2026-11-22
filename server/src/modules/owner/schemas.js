import { z } from 'zod'
import { EVENT_TYPES } from '../../config/constants.js'

// POST /api/owner/venues and PUT /api/owner/venues/:id. The body mirrors the wizard draft
// (client/src/features/host/draft.js) and these rules mirror client/src/features/host/schema.js, so a server error
// comes back with the same dotted path as the wizard field it belongs to ("halls.0.capacity"). Text numbers stay
// strings like the form sends them; the service converts them. Files are referenced by uploadId (POST /owner/uploads).

const MIN_GUESTS = 25
const PAKISTAN = { minLat: 23.5, maxLat: 37.2, minLng: 60.8, maxLng: 77.9 }
const CATEGORIES = ['marquee', 'banquet_hall', 'lawn', 'farmhouse', 'hotel_ballroom', 'rooftop']
const PHOTO_CATEGORIES = [
  'main_hall',
  'stage',
  'seating',
  'bridal_room',
  'washrooms',
  'entrance',
  'exterior',
  'parking',
  'hallway',
]
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const trimmed = (min, max, label) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(min, min === 1 ? `Enter ${label}.` : `${capitalise(label)} needs at least ${min} characters.`)
    .max(max, `Keep ${label} under ${max + 1} characters.`)
const optionalText = (max, label) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max + 1} characters.`)
    .default('')
const wholeNumber = (label, min, max) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .regex(/^\d{1,7}$/, `Use a whole number for ${label}, like 300.`)
    .refine((t) => Number(t) >= min, `${capitalise(label)} must be at least ${min.toLocaleString('en-US')}.`)
    .refine((t) => Number(t) <= max, `${capitalise(label)} can be at most ${max.toLocaleString('en-US')}.`)
const optionalWhole = (label, min, max) =>
  z
    .string()
    .trim()
    .refine((t) => t === '' || /^\d{1,7}$/.test(t), `Use a whole number for ${label}.`)
    .refine(
      (t) => !/^\d+$/.test(t) || Number(t) >= min,
      `${capitalise(label)} must be at least ${min.toLocaleString('en-US')}.`,
    )
    .refine(
      (t) => !/^\d+$/.test(t) || Number(t) <= max,
      `${capitalise(label)} can be at most ${max.toLocaleString('en-US')}.`,
    )
    .default('')
const rupees = (label) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, `Enter ${label} in rupees using digits only, like 2500.`)
    .refine((t) => Number(t) > 0, `${capitalise(label)} must be more than Rs. 0.`)
const uploadId = z.uuid({ error: 'This file wasn’t uploaded. Remove it and add it again.' })
const clientId = z.string().trim().min(1).max(64)
const httpsUrl = (message) =>
  z
    .string()
    .trim()
    .refine((t) => {
      try {
        return new URL(t).protocol === 'https:'
      } catch {
        return false
      }
    }, message)
// REQ-43 / EUC-30, srs-alignment #37: a link to the venue on Google Maps, nothing else from Google. Optional; trimmed;
// '' becomes null; https only (no http:, javascript:, data:); the host must be one of Google's Maps hosts.
export const GOOGLE_MAPS_HOSTS = [
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
  'g.page',
]
const MAPS_LINK_MESSAGE =
  'Paste a Google Maps link that starts with https://maps.app.goo.gl/ or https://www.google.com/maps.'
export const googleMapsUrlSchema = z
  .string({ error: MAPS_LINK_MESSAGE })
  .trim()
  .max(500, 'That link is too long. Use the short link from Share, then Copy link.')
  .nullable()
  .optional()
  .transform((text) => (text ? text : null))
  .refine((text) => {
    if (text === null) return true
    try {
      const url = new URL(text)
      return url.protocol === 'https:' && !url.username && !url.password && GOOGLE_MAPS_HOSTS.includes(url.hostname)
    } catch {
      return false
    }
  }, MAPS_LINK_MESSAGE)
const googleMapsUrl = googleMapsUrlSchema
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time, like 19:00.')
const zoneCell = z.number().int().min(0).max(8).nullable().default(null)
const outside = 'The pin is outside Pakistan. Drag it onto your venue.'

// edit = PUT /owner/venues/:id/edit on a live venue: files already on the server are kept by reference
// (keepFloorPlan, walkthrough { mode: 'upload', keep: true }) instead of being uploaded again.
const hallSchemaFor = (edit) =>
  z
    .object({
      hallId: clientId,
      name: trimmed(2, 60, 'the hall name'),
      capacity: wholeNumber('seated capacity', MIN_GUESTS, 10000),
      standingCapacity: optionalWhole('standing capacity', MIN_GUESTS, 20000),
      setting: z.enum(['indoor', 'outdoor', 'semi_outdoor']),
      hasAc: z.boolean(),
      lengthFt: wholeNumber('the length', 10, 1000),
      widthFt: wholeNumber('the width', 10, 1000),
      ceilingFt: wholeNumber('the ceiling height', 8, 100),
      description: optionalText(300, 'the description'),
      floorPlanUploadId: uploadId.nullable().default(null),
      ...(edit ? { keepFloorPlan: z.boolean().default(false) } : {}),
      zones: z.object({ stage: zoneCell, entrance: zoneCell, seating: zoneCell }).strict(),
      walkthrough: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('generate') }).strict(),
        z.object({ mode: z.literal('skip') }).strict(),
        z
          .object({
            mode: z.literal('link'),
            url: httpsUrl('Paste a full link that starts with https://, like https://my.matterport.com/show/?m=…').pipe(
              z.string().max(500, 'Use a shorter link.'),
            ),
          })
          .strict(),
        edit
          ? z
              .object({ mode: z.literal('upload'), uploadId: uploadId.optional(), keep: z.literal(true).optional() })
              .strict()
          : z.object({ mode: z.literal('upload'), uploadId }).strict(),
      ]),
    })
    .strict()

const sectionSchema = z
  .object({
    name: trimmed(2, 40, 'the section name'),
    items: z.array(z.object({ name: trimmed(1, 60, 'the dish name') }).strict()).max(60),
  })
  .strict()

const menuFields = {
  name: trimmed(2, 60, 'the package name'),
  description: optionalText(200, 'the description'),
  pricePerHead: rupees('the price per guest'),
  minGuests: wholeNumber('the minimum guest count', 1, 10000),
  isCustomizable: z.boolean().default(false),
  sections: z.array(sectionSchema).max(15, 'A package can have up to 15 sections.'),
}
const menuSchema = z.object(menuFields).strict()
// POST / PUT /owner/venues/:id/menus[/:menuId] (EUC-07, REQ-6).
export const menuBodySchema = menuSchema
const menuSchemaFor = (edit) => (edit ? z.object({ ...menuFields, menuId: z.uuid().optional() }).strict() : menuSchema)

const slotSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false), start: time.optional(), end: time.optional() }).strict(),
  z
    .object({ enabled: z.literal(true), start: time, end: time })
    .strict()
    .refine((s) => s.end > s.start, {
      path: ['end'],
      message: 'End time must be after the start time. Slots can’t run past midnight.',
    }),
])

const tierSchema = z
  .object({
    fromDays: wholeNumber('the days', 0, 365),
    toDays: optionalWhole('the days', 1, 366),
    refundPercent: wholeNumber('the refund', 0, 100),
  })
  .strict()

const thisYear = () => new Date().getFullYear()

const addOnFields = {
  type: z.enum(['sound_system', 'smd']),
  name: trimmed(2, 60, 'the add-on name'),
  description: optionalText(200, 'the description'),
  price: rupees('the price'),
}
// POST / PUT /owner/venues/:id/add-ons[/:addOnId] (EUC-07, REQ-6).
export const addOnBodySchema = z.object(addOnFields).strict()

function listingSchema(edit) {
  return z
    .object({
      venue: z
        .object({
          category: z.enum(CATEGORIES, { error: 'Pick the option that fits your venue best.' }),
          name: trimmed(3, 80, 'the venue name'),
          hostingSince: optionalWhole('the year', 1947, 2100).refine(
            (t) => !t || Number(t) <= thisYear(),
            'The year can’t be in the future.',
          ),
          city: trimmed(2, 60, 'your city'),
          street: trimmed(5, 160, 'the street address'),
          area: trimmed(2, 80, 'the area'),
          postalCode: z
            .string()
            .trim()
            .regex(/^(\d{5})?$/, 'Postal codes in Pakistan have 5 digits, like 38000.')
            .default(''),
          lat: z
            .number({ error: 'Place the pin on your venue.' })
            .min(PAKISTAN.minLat, outside)
            .max(PAKISTAN.maxLat, outside),
          lng: z
            .number({ error: 'Place the pin on your venue.' })
            .min(PAKISTAN.minLng, outside)
            .max(PAKISTAN.maxLng, outside),
          googleMapsUrl,
          landmark: optionalText(80, 'the landmark'),
          landmarkMinutes: optionalWhole('the travel time', 1, 180),
          directions: optionalText(500, 'the directions'),
          supportedEvents: z.array(z.enum(EVENT_TYPES)).min(1, 'Pick at least one kind of event you host.'),
          facilities: z.array(z.string().trim().min(1).max(40)).max(40),
          customFacilities: z
            .array(trimmed(2, 40, 'the amenity'))
            .max(10, 'You can add up to 10 of your own amenities.')
            .default([]),
          parkingSpaces: optionalWhole('the number of cars', 1, 5000),
          headline: trimmed(10, 60, 'the title'),
          description: trimmed(50, 1000, 'the description'),
          houseRules: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
          customHouseRules: z
            .array(trimmed(3, 80, 'the rule'))
            .max(10, 'You can add up to 10 of your own rules.')
            .default([]),
        })
        .strict(),
      halls: z.array(hallSchemaFor(edit)).min(1, 'Add at least one hall.').max(10, 'You can list up to 10 halls.'),
      bridalSuite: z
        .discriminatedUnion('enabled', [
          z.object({ enabled: z.literal(false) }).passthrough(),
          z
            .object({
              enabled: z.literal(true),
              name: trimmed(2, 60, 'the suite name'),
              capacity: wholeNumber('the capacity', 1, 200),
              lengthFt: optionalWhole('the length', 5, 200),
              widthFt: optionalWhole('the width', 5, 200),
              description: optionalText(300, 'the description'),
            })
            .strict(),
        ])
        .default({ enabled: false }),
      venueImages: z
        .array(
          z
            .object({
              ...(edit ? { uploadId: uploadId.optional(), imageId: z.uuid().optional() } : { uploadId }),
              hallId: clientId.nullable(),
              category: z.enum(PHOTO_CATEGORIES),
              isCover: z.boolean(),
            })
            .strict(),
        )
        .min(5, 'Add at least 5 photos.')
        .max(60, 'You can add up to 60 photos.'),
      menuPackages: z
        .array(menuSchemaFor(edit))
        .min(1, 'Add at least one menu package.')
        .max(10, 'You can add up to 10 packages.'),
      customMenu: z
        .object({ accepts: z.boolean(), note: optionalText(300, 'the note') })
        .strict()
        .default({ accepts: false, note: '' }),
      addOns: z
        .array(z.object({ ...addOnFields, ...(edit ? { addOnId: z.uuid().optional() } : {}) }).strict())
        .max(10, 'You can add up to 10 add-ons.')
        .default([]),
      bookingRules: z
        .object({
          days: z.array(z.enum(WEEKDAYS)).min(1, 'Pick at least one day you take bookings.'),
          slots: z.object({ lunch: slotSchema, dinner: slotSchema }).strict(),
          advancePercent: wholeNumber('the advance', 0, 100),
          cancellationPolicy: z.enum(['flexible', 'moderate', 'strict', 'custom'], {
            error: 'Choose a cancellation policy.',
          }),
          customPolicy: z
            .object({ tiers: z.array(tierSchema).max(6, 'Use up to 6 rules.'), note: optionalText(300, 'the note') })
            .strict()
            .nullable()
            .default(null),
        })
        .strict(),
    })
    .strict()
    .superRefine((body, ctx) => {
      const issue = (path, message) => ctx.addIssue({ code: 'custom', path, message })

      // halls_name_per_venue
      const names = new Set()
      body.halls.forEach((hall, index) => {
        const key = hall.name.toLowerCase()
        if (names.has(key)) issue(['halls', index, 'name'], 'Each hall needs its own name.')
        names.add(key)
        const cells = Object.entries(hall.zones).filter(([, cell]) => cell !== null)
        const seen = new Map()
        for (const [zone, cell] of cells) {
          if (seen.has(cell))
            issue(
              ['halls', index, 'zones', zone],
              `${capitalise(zone)} is in the same spot as ${seen.get(cell)}. Pick another spot.`,
            )
          else seen.set(cell, zone)
        }
      })
      const hallIds = new Set(body.halls.map((h) => h.hallId))

      // Photos: every hall has one, exactly one cover, every photo's hall is listed.
      body.venueImages.forEach((image, index) => {
        if (image.hallId !== null && !hallIds.has(image.hallId))
          issue(['venueImages', index, 'hallId'], 'This photo belongs to a hall that isn’t listed.')
      })
      for (const hall of body.halls) {
        if (!body.venueImages.some((image) => image.hallId === hall.hallId))
          issue(['photos', hall.hallId], `Add at least one photo of ${hall.name}.`)
      }
      const covers = body.venueImages.filter((image) => image.isCover).length
      if (covers !== 1) issue(['photos', 'cover'], covers ? 'Choose only one cover photo.' : 'Choose a cover photo.')
      if (new Set(body.venueImages.map((i) => i.uploadId ?? i.imageId)).size !== body.venueImages.length)
        issue(['venueImages'], 'The same photo is listed twice.')
      if (edit) {
        body.venueImages.forEach((image, index) => {
          if (Boolean(image.uploadId) === Boolean(image.imageId))
            issue(['venueImages', index], 'This photo wasn’t uploaded. Remove it and add it again.')
        })
        body.halls.forEach((hall, index) => {
          const w = hall.walkthrough
          if (w.mode === 'upload' && Boolean(w.uploadId) === Boolean(w.keep))
            issue(['halls', index, 'walkthrough', 'file'], 'Upload the 3D model or 360° photo again.')
          if (hall.keepFloorPlan && hall.floorPlanUploadId)
            issue(['halls', index, 'floorPlan'], 'Keep the current floor plan or upload a new one, not both.')
        })
      }

      // "15 min from Clock Tower" needs both halves.
      if (body.venue.landmark && !body.venue.landmarkMinutes)
        issue(['venue', 'landmarkMinutes'], 'Add how many minutes away it is, or clear the landmark.')
      if (!body.venue.landmark && body.venue.landmarkMinutes)
        issue(['venue', 'landmark'], 'Name the landmark, or clear the minutes.')

      // Menus: at least one dish, section names unique, total dishes capped, minimum within the largest hall.
      const largest = Math.max(...body.halls.map((h) => Number(h.capacity)))
      body.menuPackages.forEach((menu, index) => {
        const dishes = menu.sections.reduce((sum, s) => sum + s.items.length, 0)
        if (dishes === 0) issue(['menuPackages', index, 'sections'], 'Add at least one dish to any section.')
        if (dishes > 60) issue(['menuPackages', index, 'sections'], 'A package can list up to 60 dishes.')
        const sections = new Set()
        menu.sections.forEach((section, s) => {
          const key = section.name.replace(/\s+/g, ' ').toLowerCase()
          if (sections.has(key))
            issue(['menuPackages', index, 'sections', s, 'name'], 'Each section needs its own name.')
          sections.add(key)
        })
        if (Number(menu.minGuests) > largest) {
          issue(
            ['menuPackages', index, 'minGuests'],
            `Your largest hall seats ${largest.toLocaleString('en-US')}, so the minimum can’t be higher.`,
          )
        }
      })

      // Slots: at least one, and lunch ends before dinner starts (time_slots_no_overlap).
      const { lunch, dinner } = body.bookingRules.slots
      if (!lunch.enabled && !dinner.enabled) issue(['bookingRules', 'slots'], 'Offer at least one time slot.')
      if (lunch.enabled && dinner.enabled && lunch.end > dinner.start)
        issue(['bookingRules', 'slots', 'dinner', 'start'], 'Dinner has to start after lunch ends.')

      // Custom cancellation policy: needs rows that don't overlap ([from, to) days before the event, to '' = or more).
      if (body.bookingRules.cancellationPolicy === 'custom') {
        const tiers = body.bookingRules.customPolicy?.tiers ?? []
        if (!tiers.length) issue(['bookingRules', 'customPolicy', 'tiers'], 'Add at least one rule.')
        const ranges = tiers.map((t, index) => ({
          index,
          from: Number(t.fromDays),
          to: t.toDays ? Number(t.toDays) : Infinity,
        }))
        ranges.forEach((x, index) => {
          if (x.to <= x.from)
            issue(
              ['bookingRules', 'customPolicy', 'tiers', index, 'toDays'],
              'This has to be more than the “from” days.',
            )
        })
        for (let a = 0; a < ranges.length; a++) {
          for (let b = a + 1; b < ranges.length; b++) {
            if (ranges[a].from < ranges[b].to && ranges[b].from < ranges[a].to) {
              issue(
                ['bookingRules', 'customPolicy', 'tiers', b, 'fromDays'],
                `Overlaps rule ${a + 1}. Each day count can only be in one rule.`,
              )
            }
          }
        }
      }
    })
}

// POST /api/owner/venues and PUT /api/owner/venues/:id (new listing / resubmit before approval).
export const listingSubmissionSchema = listingSchema(false)
// PUT /api/owner/venues/:id/edit (EUC-04 / EUC-07: edit a live venue; srs-alignment #35).
export const listingEditSchema = listingSchema(true)

export const menuParamsSchema = z.object({ id: z.uuid({ error: 'Unknown venue.' }), menuId: z.uuid() }).strict()
export const addOnParamsSchema = z.object({ id: z.uuid({ error: 'Unknown venue.' }), addOnId: z.uuid() }).strict()
export const deactivateBodySchema = z
  .object({ reason: z.string().trim().max(300, 'Keep the reason to 300 characters.').optional() })
  .strict()
  .default({})

const DRAFT_MAX_BYTES = 256 * 1024

// PUT /api/owner/draft: the wizard's whole draft, stored as-is (autosave). Only its size and version are checked;
// the full rules run on submit.
export const draftBodySchema = z
  .object({
    venueId: z.uuid().nullable().default(null),
    draft: z
      .looseObject({ version: z.literal(2, { error: 'This draft was saved by an older version. Start again.' }) })
      .refine((d) => Buffer.byteLength(JSON.stringify(d)) <= DRAFT_MAX_BYTES, 'The draft is too large to save.'),
  })
  .strict()

export const draftQuerySchema = z.object({ venueId: z.uuid().optional() }).strict()

export const venueParamsSchema = z.object({ id: z.uuid({ error: 'Unknown venue.' }) }).strict()

export const uploadKinds = ['photo', 'floor_plan', 'walkthrough']
