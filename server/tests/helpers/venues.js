import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bearer } from './app.js'
import { one, pool } from './db.js'
import { createLocalStorage, setStorage } from '../../src/integrations/storage.js'

// Tiny files with the right first bytes (the server checks content, not names).
export const jpeg = (size = 2048) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 7)])
export const png = (size = 2048) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(size - 8, 3)])
export const pdf = () => Buffer.from('%PDF-1.4\n% test floor plan\n')
export const glb = () => Buffer.concat([Buffer.from('glTF'), Buffer.alloc(64, 1)])

// Uploads go to a temp folder per test file.
export function useTempStorage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markie-uploads-test-'))
  setStorage(createLocalStorage(dir))
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

export async function upload(agent, token, kind, buffer = jpeg(), name = 'photo.jpg') {
  return agent
    .post('/api/owner/uploads')
    .set('Authorization', bearer(token))
    .field('kind', kind)
    .attach('file', buffer, name)
}

export async function uploadIds(agent, token, count, kind = 'photo') {
  const ids = []
  for (let i = 0; i < count; i++) {
    const res = await upload(agent, token, kind)
    if (res.status !== 201) throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`)
    ids.push(res.body.uploadId)
  }
  return ids
}

// A complete, valid submission (shaped like the wizard draft), using the given photo upload ids.
export function submission(photoIds, overrides = {}) {
  const body = {
    venue: {
      category: 'marquee',
      name: 'Test Garden Marquee',
      hostingSince: '2015',
      city: 'Faisalabad',
      street: '12 Canal Road',
      area: 'Canal Road',
      postalCode: '38000',
      lat: 31.45,
      lng: 73.13,
      googleMapsUrl: '',
      landmark: 'Clock Tower',
      landmarkMinutes: '15',
      directions: 'Turn left after the bridge.',
      supportedEvents: ['wedding', 'mehndi'],
      facilities: ['catering', 'valet', 'ac'],
      customFacilities: ['Rooftop lounge'],
      parkingSpaces: '120',
      headline: 'Garden marquee by the canal',
      description: 'A garden marquee by the canal with two halls, in-house catering and valet parking for every event.',
      houseRules: ['outside_photographers'],
      customHouseRules: ['Music off by 11 PM'],
    },
    halls: [
      {
        hallId: 'h1',
        name: 'Main hall',
        capacity: '400',
        standingCapacity: '600',
        setting: 'indoor',
        hasAc: true,
        lengthFt: '120',
        widthFt: '80',
        ceilingFt: '18',
        description: 'The big hall.',
        floorPlanUploadId: null,
        zones: { stage: 1, entrance: 7, seating: 4 },
        walkthrough: { mode: 'generate' },
      },
      {
        hallId: 'h2',
        name: 'Lawn',
        capacity: '250',
        standingCapacity: '',
        setting: 'outdoor',
        hasAc: false,
        lengthFt: '100',
        widthFt: '60',
        ceilingFt: '20',
        description: '',
        floorPlanUploadId: null,
        zones: { stage: null, entrance: null, seating: null },
        walkthrough: { mode: 'skip' },
      },
    ],
    bridalSuite: {
      enabled: true,
      name: 'Bridal suite',
      capacity: '20',
      lengthFt: '30',
      widthFt: '20',
      description: 'Mirrors.',
    },
    venueImages: photoIds.map((uploadId, index) => ({
      uploadId,
      hallId: index === 1 ? 'h2' : index === 4 ? null : 'h1',
      category: index === 4 ? 'parking' : 'main_hall',
      isCover: index === 0,
    })),
    menuPackages: [
      {
        name: 'Silver',
        description: 'Starter, two mains, dessert.',
        pricePerHead: '2500',
        minGuests: '100',
        isCustomizable: false,
        sections: [
          { name: 'Main course', items: [{ name: 'Chicken karahi' }, { name: 'Pulao' }] },
          { name: 'Desserts / Sweets', items: [{ name: 'Kheer' }] },
        ],
      },
      {
        name: 'Gold',
        description: '',
        pricePerHead: '3200.50',
        minGuests: '150',
        isCustomizable: true,
        sections: [{ name: 'Main course', items: [{ name: 'Mutton qorma' }] }],
      },
    ],
    customMenu: { accepts: true, note: 'Ask us for a custom menu.' },
    addOns: [{ type: 'sound_system', name: 'DJ and sound', description: 'Four hours.', price: '45000' }],
    bookingRules: {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      slots: {
        lunch: { enabled: true, start: '12:00', end: '16:00' },
        dinner: { enabled: true, start: '19:00', end: '23:00' },
      },
      advancePercent: '25',
      cancellationPolicy: 'custom',
      customPolicy: {
        tiers: [
          { fromDays: '30', toDays: '', refundPercent: '100' },
          { fromDays: '7', toDays: '30', refundPercent: '50' },
        ],
        note: 'Refunds by bank transfer.',
      },
    },
  }
  return { ...body, ...overrides }
}

// Uploads 5 photos and submits a listing. -> { id, body }
export async function submitListing(agent, token, overrides = {}) {
  const ids = await uploadIds(agent, token, 5)
  const body = submission(ids, overrides)
  const res = await agent.post('/api/owner/venues').set('Authorization', bearer(token)).send(body)
  if (res.status !== 201) throw new Error(`submit failed: ${res.status} ${JSON.stringify(res.body)}`)
  return { id: res.body.venue.id, body }
}

// A public (or any status) venue straight in SQL, for search tests: one hall, one published photo, slots.
export async function insertVenue({
  ownerId,
  name,
  city = 'Lahore',
  area = 'Gulberg',
  capacity = 500,
  price = '3000.00',
  status = 'approved',
  isActive = true,
  venueType = 'indoor',
  events = ['wedding'],
  facilities = [],
  rating = 0,
  slotDates = [],
  bookedDates = [],
}) {
  const venue = await one(
    `INSERT INTO venues (owner_id, name, address, city, area, venue_type, supported_events, capacity, base_price,
                         facilities, approval_status, is_active, avg_rating, location, reviewed_at)
     VALUES ($1, $2, 'Street 1', $3, $4, $5::venue_type, $6::event_type[], $7, $8, $9, $10::approval_status, $11, $12,
             ST_SetSRID(ST_MakePoint(74.3, 31.5), 4326)::geography, now() - interval '60 days')
     RETURNING venue_id`,
    [ownerId, name, city, area, venueType, events, capacity, price, facilities, status, isActive, rating],
  )
  const hall = await one(`INSERT INTO halls (venue_id, name, capacity) VALUES ($1, 'Hall 1', $2) RETURNING hall_id`, [
    venue.venue_id,
    capacity,
  ])
  await pool.query(
    `INSERT INTO venue_images (venue_id, hall_id, image_url, verification_status, is_published, is_cover)
     VALUES ($1, $2, '/uploads/seed/x.webp', 'genuine', $3, true)`,
    [venue.venue_id, hall.hall_id, status === 'approved' || status === 'suspended'],
  )
  for (const date of slotDates) {
    await pool.query(
      `INSERT INTO time_slots (venue_id, hall_id, date, start_time, end_time, status)
       VALUES ($1, $2, $3, '19:00', '23:00', $4::slot_status)`,
      [venue.venue_id, hall.hall_id, date, bookedDates.includes(date) ? 'booked' : 'available'],
    )
  }
  return { id: venue.venue_id, hallId: hall.hall_id }
}
