import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { jpeg, submitListing, upload, useTempStorage } from './helpers/venues.js'
import { setImageDetector } from '../src/integrations/imageDetection.js'
import { settleVerifications } from '../src/modules/venues/imageVerification.js'

// EUC-04 / EUC-07 (REQ-5, REQ-6), srs-alignment #35: editing a live venue, menus and add-ons, revisions the admin
// approves, deactivate / reactivate, and the role + ownership checks on every route.

let storage
beforeAll(() => {
  storage = useTempStorage()
})
afterAll(() => storage.cleanup())
beforeEach(async () => {
  await resetDb()
  setImageDetector(async () => ({ score: 0.05 }))
})
afterEach(async () => {
  await settleVerifications()
  setImageDetector(null)
})

const auth = (s) => ['Authorization', bearer(s.accessToken)]

// An approved listing: the owner submits through the API, an admin approves it.
async function liveListing() {
  const agent = api()
  const owner = await signedIn(agent, 'venue_owner')
  const admin = await signedIn(agent, 'admin')
  const { id } = await submitListing(agent, owner.accessToken)
  await settleVerifications()
  const res = await agent
    .post(`/api/admin/venues/${id}/approve`)
    .set(...auth(admin))
    .send({})
  expect(res.status).toBe(204)
  return { agent, owner, admin, id }
}

async function getListing(agent, owner, id) {
  const res = await agent.get(`/api/owner/venues/${id}`).set(...auth(owner))
  expect(res.status).toBe(200)
  return res.body
}

// The owner's listing (GET /owner/venues/:id) -> an edit body that keeps everything as it is.
function editBody(listing) {
  const v = listing.venue
  const rules = listing.bookingRules
  const sections = (items) => {
    const map = new Map()
    for (const item of items) {
      if (!map.has(item.category)) map.set(item.category, [])
      map.get(item.category).push({ name: item.name })
    }
    return [...map].map(([name, list]) => ({ name, items: list }))
  }
  return {
    venue: {
      category: v.category,
      name: v.name,
      hostingSince: v.hostingSince,
      city: v.city,
      street: v.street,
      area: v.area,
      postalCode: v.postalCode,
      lat: v.lat,
      lng: v.lng,
      googleMapsUrl: v.googleMapsUrl ?? '',
      landmark: v.landmark,
      landmarkMinutes: v.landmarkMinutes,
      directions: v.directions,
      supportedEvents: v.supportedEvents,
      facilities: v.facilities,
      customFacilities: [],
      parkingSpaces: v.parkingSpaces,
      headline: v.headline,
      description: v.description,
      houseRules: v.houseRules,
      customHouseRules: [],
    },
    halls: listing.halls.map((h) => ({
      hallId: h.hallId,
      name: h.name,
      capacity: h.capacity,
      standingCapacity: h.standingCapacity,
      setting: h.setting,
      hasAc: h.hasAc,
      lengthFt: h.lengthFt,
      widthFt: h.widthFt,
      ceilingFt: h.ceilingFt,
      description: h.description,
      floorPlanUploadId: null,
      keepFloorPlan: Boolean(h.floorPlan),
      zones: h.zones,
      walkthrough:
        h.walkthrough.mode === 'upload'
          ? { mode: 'upload', keep: true }
          : h.walkthrough.mode === 'link'
            ? { mode: 'link', url: h.walkthrough.url }
            : { mode: h.walkthrough.mode },
    })),
    bridalSuite: listing.bridalSuite,
    venueImages: listing.images.map((i) => ({
      imageId: i.imageId,
      hallId: i.hallId,
      category: i.category,
      isCover: i.isCover,
    })),
    menuPackages: listing.menuPackages.map((m) => ({
      menuId: m.menuId,
      name: m.name,
      description: m.description,
      pricePerHead: m.pricePerHead,
      minGuests: m.minGuests,
      isCustomizable: m.isCustomizable,
      sections: sections(m.items),
    })),
    customMenu: {
      accepts: Boolean(listing.customMenuNote) || listing.menuPackages.some((m) => m.isCustomizable),
      note: listing.customMenuNote,
    },
    addOns: listing.addOns.map((a) => ({
      addOnId: a.addOnId,
      type: a.type,
      name: a.name,
      description: a.description,
      price: a.price,
    })),
    bookingRules: {
      days: rules.days,
      slots: {
        lunch: rules.slots.lunch.enabled ? rules.slots.lunch : { enabled: false },
        dinner: rules.slots.dinner.enabled ? rules.slots.dinner : { enabled: false },
      },
      advancePercent: rules.advancePercent,
      cancellationPolicy: rules.cancellationPolicy,
      customPolicy: rules.cancellationPolicy === 'custom' ? rules.customPolicy : null,
    },
  }
}

const edit = (agent, owner, id, body) =>
  agent
    .put(`/api/owner/venues/${id}/edit`)
    .set(...auth(owner))
    .send(body)

// A booking on the venue's first hall that uses a package (and optionally an add-on).
async function bookOn(venueId, { menuId = null, addOnId = null } = {}) {
  const customer = await signedIn(api(), 'customer')
  const hall = await one('SELECT hall_id FROM halls WHERE venue_id = $1 ORDER BY sort_order LIMIT 1', [venueId])
  const slot = await one(
    `INSERT INTO time_slots (venue_id, hall_id, date, start_time, end_time, status)
     VALUES ($1, $2, current_date + 200, '09:00', '11:00', 'booked') RETURNING slot_id`,
    [venueId, hall.hall_id],
  )
  const booking = await one(
    `INSERT INTO bookings (slot_id, customer_id, venue_id, hall_id, menu_package_id, menu_price_per_head, event_type,
                           guest_count, total_amount)
     VALUES ($1, $2, $3, $4, $5, (SELECT price_per_head FROM menu_packages WHERE menu_id = $5), 'walima', 200, 500000)
     RETURNING booking_id`,
    [slot.slot_id, customer.user.id, venueId, hall.hall_id, menuId],
  )
  if (addOnId)
    await pool.query(
      `INSERT INTO booking_add_ons (booking_id, add_on_id, quantity, unit_price)
       SELECT $1, add_on_id, 1, price FROM add_ons WHERE add_on_id = $2`,
      [booking.booking_id, addOnId],
    )
  return { bookingId: booking.booking_id, hallId: hall.hall_id }
}

describe('PUT /api/owner/venues/:id/edit (EUC-04, REQ-5)', () => {
  it('an unchanged save changes nothing and asks the admin for nothing', async () => {
    const { agent, owner, id } = await liveListing()
    const { listing } = await getListing(agent, owner, id)
    const res = await edit(agent, owner, id, editBody(listing))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ applied: [], needsApproval: [], revision: null, revisionAction: 'none' })
    expect(await count('SELECT count(*) FROM venue_revisions')).toBe(0)
  })

  it('live fields go live at once; REQ-5 fields wait for the admin while the old version stays public', async () => {
    const { agent, owner, admin, id } = await liveListing()
    const { listing } = await getListing(agent, owner, id)
    const hallId = listing.halls[0].hallId
    const body = editBody(listing)
    body.venue.headline = 'Fresh garden marquee title'
    body.venue.directions = 'Second gate after the canal bridge.'
    body.venue.name = 'Renamed Garden Marquee'
    body.venue.description = `${listing.venue.description} Now with a new rooftop terrace for mehndi nights.`
    body.halls[0].capacity = '450'
    const res = await edit(agent, owner, id, body)
    expect(res.status).toBe(200)
    expect(res.body.applied).toEqual(expect.arrayContaining(['Title', 'Directions']))
    expect(res.body.needsApproval).toEqual(
      expect.arrayContaining(['Venue name', 'Description', 'Main hall: Seated capacity']),
    )
    expect(res.body.revisionAction).toBe('created')

    // Public: new title now, old name and capacity until approved.
    let pub = (await api().get(`/api/venues/${id}`)).body.venue
    expect(pub.tagline).toBe('Fresh garden marquee title')
    expect(pub.name).toBe('Test Garden Marquee')
    expect(pub.halls.find((h) => h.hallId === hallId).capacity).toBe(400)

    // The owner's editor shows the proposal; the revision lists old versus new.
    const mine = await getListing(agent, owner, id)
    expect(mine.listing.venue.name).toBe('Renamed Garden Marquee')
    expect(mine.revision.status).toBe('pending')
    expect(mine.revision.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Venue name',
          before: 'Test Garden Marquee',
          after: 'Renamed Garden Marquee',
        }),
      ]),
    )
    const list = await agent.get('/api/owner/venues').set(...auth(owner))
    expect(list.body.data[0].revision).toMatchObject({ status: 'pending' })

    // Admin queue and detail.
    const queue = await agent.get('/api/admin/revisions?status=pending').set(...auth(admin))
    expect(queue.status).toBe(200)
    expect(queue.body.rows).toHaveLength(1)
    expect(queue.body.counts.pending).toBe(1)
    const revId = queue.body.rows[0].id
    const detail = await agent.get(`/api/admin/revisions/${revId}`).set(...auth(admin))
    expect(detail.body.revision.changes.map((c) => c.label)).toContain('Main hall: Seated capacity')

    // Approve: applied in place, same hall id, audited.
    const approve = await agent
      .post(`/api/admin/revisions/${revId}/approve`)
      .set(...auth(admin))
      .send({})
    expect(approve.status).toBe(204)
    pub = (await api().get(`/api/venues/${id}`)).body.venue
    expect(pub.name).toBe('Renamed Garden Marquee')
    expect(pub.halls.find((h) => h.hallId === hallId).capacity).toBe(450)
    expect(await count(`SELECT count(*) FROM admin_audit_log WHERE action = 'venue.revision_approve'`)).toBe(1)
    expect((await one('SELECT status, decided_by FROM venue_revisions')).status).toBe('approved')
    expect(await count(`SELECT count(*) FROM owner_activity_log WHERE action = 'venue.edit'`)).toBe(1)
    // A decided revision can't be decided again.
    expect(
      (
        await agent
          .post(`/api/admin/revisions/${revId}/reject`)
          .set(...auth(admin))
          .send({ reason: 'Too late now' })
      ).status,
    ).toBe(409)
  })

  it('a newer proposal replaces the pending one; putting it back withdraws it; owner can withdraw', async () => {
    const { agent, owner, id } = await liveListing()
    const { listing } = await getListing(agent, owner, id)
    const body = editBody(listing)
    body.venue.name = 'First Rename'
    expect((await edit(agent, owner, id, body)).body.revisionAction).toBe('created')
    body.venue.name = 'Second Rename'
    expect((await edit(agent, owner, id, body)).body.revisionAction).toBe('replaced')
    expect(await count(`SELECT count(*) FROM venue_revisions WHERE status = 'pending'`)).toBe(1)
    body.venue.name = 'Test Garden Marquee'
    expect((await edit(agent, owner, id, body)).body.revisionAction).toBe('withdrawn')

    body.venue.name = 'Third Rename'
    await edit(agent, owner, id, body)
    const withdraw = await agent.delete(`/api/owner/venues/${id}/revision`).set(...auth(owner))
    expect(withdraw.status).toBe(204)
    expect((await agent.delete(`/api/owner/venues/${id}/revision`).set(...auth(owner))).status).toBe(409)
  })

  it('reject keeps the live venue and tells the owner why', async () => {
    const { agent, owner, admin, id } = await liveListing()
    const body = editBody((await getListing(agent, owner, id)).listing)
    body.bookingRules.advancePercent = '60'
    await edit(agent, owner, id, body)
    const revId = (await agent.get('/api/admin/revisions').set(...auth(admin))).body.rows[0].id
    expect(
      (
        await agent
          .post(`/api/admin/revisions/${revId}/reject`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(400)
    const res = await agent
      .post(`/api/admin/revisions/${revId}/reject`)
      .set(...auth(admin))
      .send({ reason: 'An advance of 60% is above our limit.' })
    expect(res.status).toBe(204)
    expect((await one('SELECT advance_percent FROM venues')).advance_percent).toBe(25)
    const mine = await getListing(agent, owner, id)
    expect(mine.revision).toMatchObject({ status: 'rejected', note: 'An advance of 60% is above our limit.' })
    expect(mine.listing.bookingRules.advancePercent).toBe('25')
  })

  it('a new hall and its photo are linked and get slots when approved', async () => {
    const { agent, owner, admin, id } = await liveListing()
    const body = editBody((await getListing(agent, owner, id)).listing)
    body.halls.push({
      ...body.halls[0],
      hallId: 'new-terrace',
      name: 'Terrace',
      keepFloorPlan: false,
      walkthrough: { mode: 'generate' },
    })
    const photo = (await upload(agent, owner.accessToken, 'photo', jpeg(), 't.jpg')).body.uploadId
    body.venueImages.push({ uploadId: photo, hallId: 'new-terrace', category: 'main_hall', isCover: false })
    const res = await edit(agent, owner, id, body)
    expect(res.status).toBe(200)
    expect(res.body.applied).toContain('Photos')
    expect(res.body.needsApproval).toContain('Terrace (new hall)')
    expect(await count(`SELECT count(*) FROM halls WHERE name = 'Terrace'`)).toBe(0)

    const revId = (await agent.get('/api/admin/revisions').set(...auth(admin))).body.rows[0].id
    expect(
      (
        await agent
          .post(`/api/admin/revisions/${revId}/approve`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(204)
    const terrace = await one(`SELECT hall_id FROM halls WHERE name = 'Terrace'`)
    expect(await count('SELECT count(*) FROM venue_images WHERE hall_id = $1', [terrace.hall_id])).toBe(1)
    expect(await count('SELECT count(*) FROM time_slots WHERE hall_id = $1', [terrace.hall_id])).toBeGreaterThan(0)
  })

  it('a hall with bookings can’t be removed', async () => {
    const { agent, owner, id } = await liveListing()
    const { listing } = await getListing(agent, owner, id)
    await bookOn(id)
    const body = editBody(listing)
    const [first] = body.halls.splice(0, 1)
    body.venueImages = body.venueImages.map((i) =>
      i.hallId === first.hallId ? { ...i, hallId: body.halls[0].hallId } : i,
    )
    const res = await edit(agent, owner, id, body)
    expect(res.status).toBe(400)
    expect(res.body.error.details[0].message).toMatch(/has bookings/)
  })

  it('removed photos are deleted and new ones start pending (REQ-9)', async () => {
    const { agent, owner, id } = await liveListing()
    const body = editBody((await getListing(agent, owner, id)).listing)
    const removed = body.venueImages.splice(3, 1)[0]
    const photo = (await upload(agent, owner.accessToken, 'photo', jpeg(), 'n.jpg')).body.uploadId
    body.venueImages.push({ uploadId: photo, hallId: null, category: 'exterior', isCover: false })
    const res = await edit(agent, owner, id, body)
    expect(res.status).toBe(200)
    expect(await count('SELECT count(*) FROM venue_images WHERE image_id = $1', [removed.imageId])).toBe(0)
    expect(await count(`SELECT count(*) FROM venue_images WHERE venue_id = $1 AND category = 'exterior'`, [id])).toBe(1)
  })

  it('only approved listings can be edited this way; other ids are refused', async () => {
    const agent = api()
    const owner = await signedIn(agent, 'venue_owner')
    const { id, body } = await submitListing(agent, owner.accessToken)
    const res = await edit(agent, owner, id, {
      ...body,
      venueImages: body.venueImages.map(({ uploadId, ...i }) => ({ ...i, uploadId })),
    })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS')
  })
})

describe('menus and add-ons (EUC-07, REQ-6)', () => {
  const menu = (price) => ({
    name: 'Platinum',
    description: 'Three mains.',
    pricePerHead: price,
    minGuests: '100',
    isCustomizable: false,
    sections: [{ name: 'Main course', items: [{ name: 'Biryani' }] }],
  })

  it('creates, edits in place when unused, and recomputes the base price', async () => {
    const { agent, owner, id } = await liveListing()
    const created = await agent
      .post(`/api/owner/venues/${id}/menus`)
      .set(...auth(owner))
      .send(menu('1800'))
    expect(created.status).toBe(201)
    const menuId = created.body.menu.menuId
    expect((await one('SELECT base_price FROM venues')).base_price).toBe('1800.00')
    const updated = await agent
      .put(`/api/owner/venues/${id}/menus/${menuId}`)
      .set(...auth(owner))
      .send(menu('1900'))
    expect(updated.body).toMatchObject({ menu: { menuId }, replacedMenuId: null, changed: true })
    expect((await one('SELECT price_per_head FROM menu_packages WHERE menu_id = $1', [menuId])).price_per_head).toBe(
      '1900.00',
    )
  })

  it('a package a booking uses is archived and replaced, so the booking keeps its price', async () => {
    const { agent, owner, id } = await liveListing()
    const menuId = (
      await one('SELECT menu_id FROM menu_packages WHERE venue_id = $1 ORDER BY sort_order LIMIT 1', [id])
    ).menu_id
    const { bookingId } = await bookOn(id, { menuId })
    const res = await agent
      .put(`/api/owner/venues/${id}/menus/${menuId}`)
      .set(...auth(owner))
      .send(menu('9999'))
    expect(res.status).toBe(200)
    expect(res.body.replacedMenuId).toBe(menuId)
    expect(res.body.menu.menuId).not.toBe(menuId)
    const old = await one('SELECT price_per_head, archived_at FROM menu_packages WHERE menu_id = $1', [menuId])
    expect(old.price_per_head).toBe('2500.00')
    expect(old.archived_at).not.toBeNull()
    expect(
      await one('SELECT menu_package_id, menu_price_per_head FROM bookings WHERE booking_id = $1', [bookingId]),
    ).toEqual({
      menu_package_id: menuId,
      menu_price_per_head: '2500.00',
    })
    // The public page shows only live packages.
    const pub = (await api().get(`/api/venues/${id}`)).body.venue
    expect(pub.menuPackages.map((m) => m.menuId)).not.toContain(menuId)
    expect(pub.menuPackages.map((m) => m.pricePerHead)).toContain('9999.00')

    // Deleting a used package archives it; the last package can't go.
    const others = await pool.query('SELECT menu_id FROM menu_packages WHERE venue_id = $1 AND archived_at IS NULL', [
      id,
    ])
    for (const row of others.rows.slice(1)) {
      expect((await agent.delete(`/api/owner/venues/${id}/menus/${row.menu_id}`).set(...auth(owner))).status).toBe(204)
    }
    const last = await agent.delete(`/api/owner/venues/${id}/menus/${others.rows[0].menu_id}`).set(...auth(owner))
    expect(last.status).toBe(409)
    expect(last.body.error.code).toBe('LAST_MENU')
  })

  it('an add-on a booking uses is archived and replaced; unused ones are deleted', async () => {
    const { agent, owner, id } = await liveListing()
    const addOnId = (await one('SELECT add_on_id FROM add_ons WHERE venue_id = $1', [id])).add_on_id
    await bookOn(id, { addOnId })
    const body = { type: 'sound_system', name: 'DJ and sound', description: 'Five hours.', price: '55000' }
    const res = await agent
      .put(`/api/owner/venues/${id}/add-ons/${addOnId}`)
      .set(...auth(owner))
      .send(body)
    expect(res.body.replacedAddOnId).toBe(addOnId)
    expect((await one('SELECT unit_price FROM booking_add_ons')).unit_price).toBe('45000.00')
    const created = await agent
      .post(`/api/owner/venues/${id}/add-ons`)
      .set(...auth(owner))
      .send({ ...body, type: 'smd', name: 'SMD screen' })
    expect(created.status).toBe(201)
    const del = await agent.delete(`/api/owner/venues/${id}/add-ons/${created.body.addOn.addOnId}`).set(...auth(owner))
    expect(del.status).toBe(204)
    expect(await count('SELECT count(*) FROM add_ons WHERE add_on_id = $1', [created.body.addOn.addOnId])).toBe(0)
  })

  it('checks the minimum guests against the largest hall', async () => {
    const { agent, owner, id } = await liveListing()
    const res = await agent
      .post(`/api/owner/venues/${id}/menus`)
      .set(...auth(owner))
      .send({ ...menu('2000'), minGuests: '5000' })
    expect(res.status).toBe(400)
    expect(res.body.error.details[0].field).toBe('minGuests')
  })
})

describe('deactivate / reactivate (REQ-5)', () => {
  it('hides the venue from its page and search, keeps bookings, and is logged', async () => {
    const { agent, owner, id } = await liveListing()
    const { bookingId } = await bookOn(id)
    const res = await agent
      .post(`/api/owner/venues/${id}/deactivate`)
      .set(...auth(owner))
      .send({ reason: 'Renovation' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ venue: { isActive: false }, changed: true })
    expect((await api().get(`/api/venues/${id}`)).status).toBe(404)
    expect((await api().get('/api/venues?city=Faisalabad')).body.venues.map((v) => v.id)).not.toContain(id)
    expect(await count('SELECT count(*) FROM bookings WHERE booking_id = $1', [bookingId])).toBe(1)
    expect(
      (
        await agent
          .post(`/api/owner/venues/${id}/reactivate`)
          .set(...auth(owner))
          .send({})
      ).body.venue.isActive,
    ).toBe(true)
    expect((await api().get(`/api/venues/${id}`)).status).toBe(200)
    expect(
      await count(`SELECT count(*) FROM owner_activity_log WHERE action IN ('venue.deactivate', 'venue.reactivate')`),
    ).toBe(2)
  })

  it('a listing that isn’t live yet can’t be deactivated', async () => {
    const agent = api()
    const owner = await signedIn(agent, 'venue_owner')
    const { id } = await submitListing(agent, owner.accessToken)
    expect(
      (
        await agent
          .post(`/api/owner/venues/${id}/deactivate`)
          .set(...auth(owner))
          .send({})
      ).status,
    ).toBe(409)
  })
})

describe('role and ownership checks', () => {
  it('another owner gets 404 everywhere; customers get 403; nobody logged in gets 401', async () => {
    const { agent, owner, id } = await liveListing()
    const body = editBody((await getListing(agent, owner, id)).listing)
    const menuId = (await one('SELECT menu_id FROM menu_packages WHERE venue_id = $1 LIMIT 1', [id])).menu_id
    const other = await signedIn(agent, 'venue_owner')
    const customer = await signedIn(agent, 'customer')
    const calls = (s) => [
      () =>
        agent
          .put(`/api/owner/venues/${id}/edit`)
          .set(...auth(s))
          .send(body),
      () => agent.get(`/api/owner/venues/${id}`).set(...auth(s)),
      () => agent.get(`/api/owner/venues/${id}/revision`).set(...auth(s)),
      () =>
        agent
          .post(`/api/owner/venues/${id}/deactivate`)
          .set(...auth(s))
          .send({}),
      () =>
        agent
          .put(`/api/owner/venues/${id}/menus/${menuId}`)
          .set(...auth(s))
          .send({
            name: 'Hijack',
            pricePerHead: '1',
            minGuests: '1',
            sections: [{ name: 'Main course', items: [{ name: 'x' }] }],
          }),
      () => agent.delete(`/api/owner/venues/${id}/menus/${menuId}`).set(...auth(s)),
    ]
    for (const call of calls(other)) expect((await call()).status).toBe(404)
    for (const call of calls(customer)) expect((await call()).status).toBe(403)
    expect((await api().put(`/api/owner/venues/${id}/edit`).send(body)).status).toBe(401)
    expect((await one('SELECT name, is_active FROM venues')).is_active).toBe(true)
    expect(await count('SELECT count(*) FROM menu_packages WHERE menu_id = $1 AND archived_at IS NULL', [menuId])).toBe(
      1,
    )
  })

  it('revision routes are admin only', async () => {
    const { agent, owner } = await liveListing()
    expect((await agent.get('/api/admin/revisions').set(...auth(owner))).status).toBe(403)
    expect((await api().get('/api/admin/revisions')).status).toBe(401)
  })
})
