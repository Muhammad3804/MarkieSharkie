import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { glb, jpeg, pdf, png, submission, submitListing, upload, uploadIds, useTempStorage } from './helpers/venues.js'
import { setImageDetector } from '../src/integrations/imageDetection.js'
import { settleVerifications } from '../src/modules/venues/imageVerification.js'

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

describe('role checks (REQ-3)', () => {
  it('owner routes need a login and the venue_owner role', async () => {
    expect((await api().get('/api/owner/venues')).status).toBe(401)
    const agent = api()
    for (const role of ['customer', 'decorator', 'admin']) {
      const s = await signedIn(agent, role)
      const res = await agent.get('/api/owner/venues').set(...auth(s))
      expect(res.status, role).toBe(403)
      expect(
        (
          await agent
            .post('/api/owner/venues')
            .set(...auth(s))
            .send({})
        ).status,
        role,
      ).toBe(403)
    }
  })
})

describe('drafts (srs-alignment #31)', () => {
  it('saves, reads and deletes my draft; another owner sees only their own', async () => {
    const agent = api()
    const a = await signedIn(agent, 'venue_owner')
    const b = await signedIn(agent, 'venue_owner')
    const draft = { version: 2, lastStep: 'halls', venue: { name: 'Mine' } }
    const put = await agent
      .put('/api/owner/draft')
      .set(...auth(a))
      .send({ draft })
    expect(put.status).toBe(200)
    expect(put.body.updatedAt).toEqual(expect.any(String))
    expect((await agent.get('/api/owner/draft').set(...auth(a))).body.draft).toEqual(draft)
    expect((await agent.get('/api/owner/draft').set(...auth(b))).body).toEqual({ draft: null, updatedAt: null })

    await agent
      .put('/api/owner/draft')
      .set(...auth(a))
      .send({ draft: { ...draft, lastStep: 'photos' } })
    expect(await count('SELECT count(*) FROM venue_drafts')).toBe(1)
    expect((await agent.delete('/api/owner/draft').set(...auth(a))).status).toBe(204)
    expect((await agent.get('/api/owner/draft').set(...auth(a))).body.draft).toBeNull()
  })

  it('rejects an old draft version and a draft for someone else’s venue', async () => {
    const agent = api()
    const a = await signedIn(agent, 'venue_owner')
    const b = await signedIn(agent, 'venue_owner')
    expect(
      (
        await agent
          .put('/api/owner/draft')
          .set(...auth(a))
          .send({ draft: { version: 1 } })
      ).status,
    ).toBe(400)
    const { id } = await submitListing(agent, a.accessToken)
    const res = await agent
      .put('/api/owner/draft')
      .set(...auth(b))
      .send({ venueId: id, draft: { version: 2 } })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/owner/uploads (REQ-8, REQ-11)', () => {
  it('stores JPEG and PNG photos under random names, by their real type', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const res = await upload(agent, s.accessToken, 'photo', png(), 'my holiday.jpg')
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ kind: 'photo', mimeType: 'image/png', size: 2048 })
    expect(res.body.url).toMatch(/\/uploads\/venues\/owner-[0-9a-f-]+\/[0-9a-f]{32}\.png$/)
    expect((await upload(agent, s.accessToken, 'photo', jpeg(), 'x.png')).body.mimeType).toBe('image/jpeg')
  })

  it('refuses other types whatever the name says, and files over the size limit', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const fakeJpeg = await upload(agent, s.accessToken, 'photo', Buffer.from('<script>alert(1)</script>'), 'cute.jpg')
    expect(fakeJpeg.status).toBe(415)
    expect(fakeJpeg.body.error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect((await upload(agent, s.accessToken, 'photo', pdf(), 'menu.pdf')).status).toBe(415)
    const big = await upload(agent, s.accessToken, 'photo', jpeg(5 * 1024 * 1024 + 1))
    expect(big.status).toBe(413)
    expect(big.body.error.code).toBe('FILE_TOO_LARGE')
    expect((await upload(agent, s.accessToken, 'brochure', jpeg())).status).toBe(400)
    expect(await count('SELECT count(*) FROM media_uploads')).toBe(0)
  })

  it('floor plans accept PDF; walkthroughs accept .glb and 360° JPEG', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    expect((await upload(agent, s.accessToken, 'floor_plan', pdf(), 'plan.pdf')).body.mimeType).toBe('application/pdf')
    expect((await upload(agent, s.accessToken, 'walkthrough', glb(), 'hall.glb')).body.mimeType).toBe(
      'model/gltf-binary',
    )
    expect((await upload(agent, s.accessToken, 'walkthrough', jpeg(), 'pano.jpg')).status).toBe(201)
    expect((await upload(agent, s.accessToken, 'walkthrough', png(), 'pano.png')).status).toBe(415)
  })
})

describe('POST /api/owner/venues: submit (REQ-5, REQ-6, EUC-04)', () => {
  it('creates the venue as pending with everything in one go; derived columns come from the server', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const { id } = await submitListing(agent, s.accessToken)
    const v = await one('SELECT * FROM venues WHERE venue_id = $1', [id])
    expect(v).toMatchObject({
      owner_id: s.user.id,
      approval_status: 'pending',
      capacity: 400, // largest hall
      base_price: '2500.00', // cheapest package per head
      venue_type: 'semi_outdoor', // indoor + outdoor halls
      address: '12 Canal Road, Canal Road, Faisalabad, 38000',
      category: 'marquee',
      advance_percent: 25,
      cancellation_policy: 'custom',
      house_rules: ['outside_photographers', 'Music off by 11 PM'],
      facilities: ['catering', 'valet', 'ac', 'Rooftop lounge'],
    })
    expect(v.submitted_at).toBeInstanceOf(Date)
    expect(await count('SELECT count(*) FROM halls WHERE venue_id = $1', [id])).toBe(2)
    expect(await count('SELECT count(*) FROM venue_images WHERE venue_id = $1 AND NOT is_published', [id])).toBe(5)
    expect(await count('SELECT count(*) FROM venue_images WHERE venue_id = $1 AND is_cover', [id])).toBe(1)
    expect(
      await count('SELECT count(*) FROM menu_items mi JOIN menu_packages m USING (menu_id) WHERE m.venue_id = $1', [
        id,
      ]),
    ).toBe(4)
    expect(await count('SELECT count(*) FROM venue_slot_templates WHERE venue_id = $1', [id])).toBe(2)
    expect(await count('SELECT count(*) FROM venue_cancellation_tiers WHERE venue_id = $1', [id])).toBe(2)
    expect(await count('SELECT count(*) FROM bridal_suites WHERE venue_id = $1', [id])).toBe(1)
    expect(await count('SELECT count(*) FROM media_uploads WHERE venue_id = $1', [id])).toBe(5)
    expect(await count('SELECT count(*) FROM time_slots WHERE venue_id = $1', [id])).toBe(0) // only after approval
    expect((await api().get(`/api/venues/${id}`)).status).toBe(404) // not public yet
  })

  it('returns field errors with the wizard’s paths, and saves nothing', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const ids = await uploadIds(agent, s.accessToken, 5)
    const body = submission(ids)
    body.halls[0].capacity = '10'
    body.halls[1].name = 'main HALL'
    body.venueImages[0].isCover = false
    body.menuPackages[0].minGuests = '900'
    body.bookingRules.slots.dinner.start = '15:00'
    const res = await agent
      .post('/api/owner/venues')
      .set(...auth(s))
      .send(body)
    expect(res.status).toBe(400)
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['halls.0.capacity']))
    // Cross-field rules run once the fields themselves are valid.
    body.halls[0].capacity = '400'
    const again = await agent
      .post('/api/owner/venues')
      .set(...auth(s))
      .send(body)
    expect(again.body.error.details.map((d) => d.field)).toEqual(
      expect.arrayContaining([
        'halls.1.name',
        'photos.cover',
        'menuPackages.0.minGuests',
        'bookingRules.slots.dinner.start',
      ]),
    )
    expect(await count('SELECT count(*) FROM venues')).toBe(0)
  })

  it('refuses another owner’s uploads and files of the wrong kind', async () => {
    const agent = api()
    const a = await signedIn(agent, 'venue_owner')
    const b = await signedIn(agent, 'venue_owner')
    const theirs = await uploadIds(agent, b.accessToken, 5)
    const res = await agent
      .post('/api/owner/venues')
      .set(...auth(a))
      .send(submission(theirs))
    expect(res.status).toBe(400)
    expect(res.body.error.details[0]).toMatchObject({ field: 'venueImages' })

    const mine = await uploadIds(agent, a.accessToken, 5)
    const plan = await uploadIds(agent, a.accessToken, 1, 'photo')
    const body = submission(mine)
    body.halls[0].floorPlanUploadId = plan[0] // a photo upload used as a floor plan
    const wrongKind = await agent
      .post('/api/owner/venues')
      .set(...auth(a))
      .send(body)
    expect(wrongKind.body.error.details[0]).toMatchObject({ field: 'halls.0.floorPlan' })
    expect(await count('SELECT count(*) FROM venues')).toBe(0)
  })

  it('stores floor plans and walkthrough files on their hall', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const ids = await uploadIds(agent, s.accessToken, 5)
    const plan = (await upload(agent, s.accessToken, 'floor_plan', pdf(), 'p.pdf')).body.uploadId
    const model = (await upload(agent, s.accessToken, 'walkthrough', glb(), 'h.glb')).body.uploadId
    const body = submission(ids)
    body.halls[0].floorPlanUploadId = plan
    body.halls[0].walkthrough = { mode: 'upload', uploadId: model }
    body.halls[1].walkthrough = { mode: 'link', url: 'https://my.matterport.com/show/?m=abc' }
    const res = await agent
      .post('/api/owner/venues')
      .set(...auth(s))
      .send(body)
    expect(res.status).toBe(201)
    const halls = (
      await pool.query('SELECT name, floor_plan_type, walkthrough_mode, walkthrough_url FROM halls ORDER BY sort_order')
    ).rows
    expect(halls).toEqual([
      { name: 'Main hall', floor_plan_type: 'pdf', walkthrough_mode: 'upload', walkthrough_url: null },
      {
        name: 'Lawn',
        floor_plan_type: null,
        walkthrough_mode: 'link',
        walkthrough_url: 'https://my.matterport.com/show/?m=abc',
      },
    ])
    expect(await one('SELECT asset_type FROM walkthrough_assets')).toEqual({ asset_type: 'model_3d' })
  })
})

describe('AI image check after submit (REQ-9)', () => {
  it('marks each photo genuine or flagged from the detector score and records the check', async () => {
    let n = 0
    setImageDetector(async () => ({ score: n++ === 2 ? 0.93 : 0.04 }))
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const { id } = await submitListing(agent, s.accessToken)
    await settleVerifications()
    const rows = (
      await pool.query(
        'SELECT verification_status::text AS s, count(*)::int AS n FROM venue_images WHERE venue_id = $1 GROUP BY 1 ORDER BY 1',
        [id],
      )
    ).rows
    expect(rows).toEqual([
      { s: 'flagged', n: 1 },
      { s: 'genuine', n: 4 },
    ])
    expect(await count('SELECT count(*) FROM image_verifications')).toBe(5)
    const mine = (await agent.get('/api/owner/venues').set(...auth(s))).body.data[0]
    expect(mine.photoChecks).toMatchObject({ genuine: 4, flagged: 1, pending: 0 })
  })

  it('keeps photos pending when the detector is down, and the owner can retry later', async () => {
    setImageDetector(async () => {
      throw new Error('service unavailable')
    })
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const { id } = await submitListing(agent, s.accessToken)
    await settleVerifications()
    expect(
      await count(`SELECT count(*) FROM venue_images WHERE venue_id = $1 AND verification_status = 'pending'`, [id]),
    ).toBe(5)

    setImageDetector(async () => ({ score: 0.01 }))
    const retry = await agent.post(`/api/owner/venues/${id}/images/verify`).set(...auth(s))
    expect(retry.status).toBe(202)
    expect(retry.body).toEqual({ pending: 5 })
    await settleVerifications()
    expect(
      await count(`SELECT count(*) FROM venue_images WHERE venue_id = $1 AND verification_status = 'genuine'`, [id]),
    ).toBe(5)
  })
})

describe('my venues and ownership', () => {
  it('lists only my venues; another owner gets 404 for my venue and can’t resubmit it', async () => {
    const agent = api()
    const a = await signedIn(agent, 'venue_owner')
    const b = await signedIn(agent, 'venue_owner')
    const { id, body } = await submitListing(agent, a.accessToken)
    expect((await agent.get('/api/owner/venues').set(...auth(a))).body.data.map((v) => v.id)).toEqual([id])
    expect((await agent.get('/api/owner/venues').set(...auth(b))).body.data).toEqual([])
    expect((await agent.get(`/api/owner/venues/${id}`).set(...auth(b))).status).toBe(404)
    expect(
      (
        await agent
          .put(`/api/owner/venues/${id}`)
          .set(...auth(b))
          .send(body)
      ).status,
    ).toBe(404)
    expect((await agent.post(`/api/owner/venues/${id}/images/verify`).set(...auth(b))).status).toBe(404)

    const mine = await agent.get(`/api/owner/venues/${id}`).set(...auth(a))
    expect(mine.status).toBe(200)
    expect(mine.body.listing).toMatchObject({
      id,
      status: 'pending',
      venue: {
        name: 'Test Garden Marquee',
        street: '12 Canal Road',
        postalCode: '38000',
        landmarkMinutes: '15',
        supportedEvents: ['wedding', 'mehndi'],
      },
      bookingRules: { cancellationPolicy: 'custom', advancePercent: '25' },
    })
    expect(mine.body.listing.halls.map((h) => h.name)).toEqual(['Main hall', 'Lawn'])
    expect(mine.body.listing.images).toHaveLength(5)
  })

  it('can’t resubmit a listing that is still pending (409)', async () => {
    const agent = api()
    const s = await signedIn(agent, 'venue_owner')
    const { id } = await submitListing(agent, s.accessToken)
    const ids = await uploadIds(agent, s.accessToken, 5)
    const res = await agent
      .put(`/api/owner/venues/${id}`)
      .set(...auth(s))
      .send(submission(ids))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS')
  })
})
