import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { jpeg, submission, submitListing, uploadIds, useTempStorage } from './helpers/venues.js'
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

async function setup() {
  const agent = api()
  const admin = await signedIn(agent, 'admin')
  const owner = await signedIn(agent, 'venue_owner')
  const { id, body } = await submitListing(agent, owner.accessToken)
  await settleVerifications()
  return { agent, admin, owner, id, body }
}

const audits = (action) => count('SELECT count(*) FROM admin_audit_log WHERE action = $1', [action])

describe('role checks (REQ-3)', () => {
  it('admin routes need the admin role', async () => {
    const agent = api()
    expect((await agent.get('/api/admin/venues')).status).toBe(401)
    for (const role of ['customer', 'venue_owner', 'decorator']) {
      const s = await signedIn(agent, role)
      expect((await agent.get('/api/admin/venues').set(...auth(s))).status, role).toBe(403)
      expect((await agent.get('/api/admin/stats').set(...auth(s))).status, role).toBe(403)
    }
  })
})

describe('review queue (REQ-7)', () => {
  it('lists by status with counts, search and pagination', async () => {
    const { agent, admin, owner } = await setup()
    await submitListing(agent, owner.accessToken, { venue: { ...submission([]).venue, name: 'Second Banquet' } })
    const res = await agent.get('/api/admin/venues?status=pending&sort=newest&pageSize=1').set(...auth(admin))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 1,
      pageCount: 2,
      counts: { pending: 2, approved: 0 },
    })
    expect(res.body.rows[0]).toMatchObject({
      name: 'Second Banquet',
      status: 'pending',
      hallCount: 2,
      photoCount: 5,
      owner: { email: owner.body.email },
    })
    const found = await agent.get('/api/admin/venues?q=second').set(...auth(admin))
    expect(found.body.rows.map((r) => r.name)).toEqual(['Second Banquet'])
  })

  it('shows every wizard field, all photos with their AI score, and the history', async () => {
    const { agent, admin, id } = await setup()
    const res = await agent.get(`/api/admin/venues/${id}`).set(...auth(admin))
    expect(res.status).toBe(200)
    expect(res.body.listing).toMatchObject({
      id,
      status: 'pending',
      venue: { headline: 'Garden marquee by the canal' },
    })
    expect(res.body.listing.images.every((i) => i.aiScore === 0.05 && i.verificationStatus === 'genuine')).toBe(true)
    expect(res.body.venue.images).toHaveLength(5) // unpublished photos are visible to the admin
    expect(res.body.history).toEqual([])
  })
})

describe('status transitions', () => {
  it('approve: goes public, photos published, 60 days of slots per hall, audited', async () => {
    const { agent, admin, id } = await setup()
    const res = await agent
      .post(`/api/admin/venues/${id}/approve`)
      .set(...auth(admin))
      .send({ checklist: { photos: true } })
    expect(res.status).toBe(204)
    const v = await one('SELECT approval_status, approved_by, reviewed_at FROM venues WHERE venue_id = $1', [id])
    expect(v).toMatchObject({ approval_status: 'approved', approved_by: admin.user.id })
    expect(await count('SELECT count(*) FROM venue_images WHERE venue_id = $1 AND is_published', [id])).toBe(5)
    const slots = await count('SELECT count(*) FROM time_slots WHERE venue_id = $1', [id])
    expect(slots).toBe(2 * 2 * 60) // 2 halls x lunch + dinner x 60 days
    expect((await api().get(`/api/venues/${id}`)).status).toBe(200)
    const log = await one('SELECT admin_id, details FROM admin_audit_log WHERE action = $1', ['venue.approve'])
    expect(log).toMatchObject({ admin_id: admin.user.id, details: { from: 'pending', checklist: { photos: true } } })
  })

  it('a flagged photo stays unpublished after approval until the admin keeps it (REQ-10)', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const owner = await signedIn(agent, 'venue_owner')
    let n = 0
    setImageDetector(async () => ({ score: n++ === 0 ? 0.97 : 0.02 }))
    const { id } = await submitListing(agent, owner.accessToken)
    await settleVerifications()
    await agent
      .post(`/api/admin/venues/${id}/approve`)
      .set(...auth(admin))
      .send({})
    const flagged = await one(
      `SELECT image_id, is_published FROM venue_images WHERE venue_id = $1 AND verification_status = 'flagged'`,
      [id],
    )
    expect(flagged.is_published).toBe(false)

    const queue = await agent.get('/api/admin/images?status=flagged').set(...auth(admin))
    expect(queue.body.images).toEqual([
      expect.objectContaining({
        id: flagged.image_id,
        aiScore: 0.97,
        highConfidence: true,
        venueName: 'Test Garden Marquee',
      }),
    ])
    expect(
      (
        await agent
          .post(`/api/admin/images/${flagged.image_id}/decision`)
          .set(...auth(admin))
          .send({ decision: 'approved' })
      ).status,
    ).toBe(204)
    expect(
      await one('SELECT verification_status::text AS s, is_published FROM venue_images WHERE image_id = $1', [
        flagged.image_id,
      ]),
    ).toEqual({ s: 'approved', is_published: true })
    const again = await agent
      .post(`/api/admin/images/${flagged.image_id}/decision`)
      .set(...auth(admin))
      .send({ decision: 'rejected' })
    expect(again.status).toBe(409)
    expect(await audits('image.keep')).toBe(1)
  })

  it('reject needs a reason the owner sees; it never becomes public', async () => {
    const { agent, admin, owner, id } = await setup()
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/reject`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(400)
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/reject`)
          .set(...auth(admin))
          .send({ reason: 'Photos are of another venue.' })
      ).status,
    ).toBe(204)
    const mine = (await agent.get('/api/owner/venues').set(...auth(owner))).body.data[0]
    expect(mine).toMatchObject({ approvalStatus: 'rejected', rejectionReason: 'Photos are of another venue.' })
    expect((await api().get(`/api/venues/${id}`)).status).toBe(404)
    expect(await audits('venue.reject')).toBe(1)
  })

  it('pending -> changes requested -> owner resubmits -> pending -> approved', async () => {
    const { agent, admin, owner, id } = await setup()
    const note = 'Please add a photo of the stage.'
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/request-changes`)
          .set(...auth(admin))
          .send({ note })
      ).status,
    ).toBe(204)
    expect((await agent.get('/api/owner/venues').set(...auth(owner))).body.data[0]).toMatchObject({
      approvalStatus: 'changes_requested',
      changesNote: note,
    })

    const ids = await uploadIds(agent, owner.accessToken, 6)
    const body = submission(ids.slice(0, 5))
    body.venueImages.push({ uploadId: ids[5], hallId: 'h1', category: 'stage', isCover: false })
    body.venue.name = 'Test Garden Marquee (new stage)'
    const re = await agent
      .put(`/api/owner/venues/${id}`)
      .set(...auth(owner))
      .send(body)
    expect(re.status).toBe(200)
    expect(re.body.venue.approvalStatus).toBe('pending')
    await settleVerifications()
    const v = await one('SELECT name, approval_status, changes_note FROM venues WHERE venue_id = $1', [id])
    expect(v).toEqual({ name: 'Test Garden Marquee (new stage)', approval_status: 'pending', changes_note: null })
    expect(await count('SELECT count(*) FROM venue_images WHERE venue_id = $1', [id])).toBe(6)
    expect(await count('SELECT count(*) FROM halls WHERE venue_id = $1', [id])).toBe(2)

    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/approve`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(204)
    expect((await api().get(`/api/venues/${id}`)).body.venue.name).toBe('Test Garden Marquee (new stage)')
    const history = (await agent.get(`/api/admin/venues/${id}`).set(...auth(admin))).body.history.map((h) => h.action)
    expect(history).toEqual(['venue.request_changes', 'venue.approve'])
  })

  it('refuses transitions that don’t apply (409) and changes nothing', async () => {
    const { agent, admin, id } = await setup()
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/suspend`)
          .set(...auth(admin))
          .send({ reason: 'Reported twice.' })
      ).status,
    ).toBe(409)
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/unsuspend`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(409)
    await agent
      .post(`/api/admin/venues/${id}/reject`)
      .set(...auth(admin))
      .send({ reason: 'Wrong address given.' })
    const approve = await agent
      .post(`/api/admin/venues/${id}/approve`)
      .set(...auth(admin))
      .send({})
    expect(approve.status).toBe(409)
    expect(approve.body.error.code).toBe('INVALID_STATUS')
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/request-changes`)
          .set(...auth(admin))
          .send({ note: 'Fix it please.' })
      ).status,
    ).toBe(409)
    expect((await one('SELECT approval_status::text AS s FROM venues WHERE venue_id = $1', [id])).s).toBe('rejected')
    expect(
      (
        await agent
          .post('/api/admin/venues/6b1e4c52-a0d9-4f3e-8c7a-2f61d93b0e47/approve')
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(404)
  })

  it('suspend hides a live venue everywhere; unsuspend brings it back', async () => {
    const { agent, admin, id } = await setup()
    await agent
      .post(`/api/admin/venues/${id}/approve`)
      .set(...auth(admin))
      .send({})
    expect((await api().get('/api/venues')).body.total).toBe(1)
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/suspend`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(400) // reason required
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/suspend`)
          .set(...auth(admin))
          .send({ reason: 'Double-booked guests.' })
      ).status,
    ).toBe(204)
    expect((await api().get(`/api/venues/${id}`)).status).toBe(404)
    expect((await api().get('/api/venues')).body.total).toBe(0)
    expect((await api().get('/api/venues/landing')).body.sections).toEqual([])
    expect((await agent.get('/api/admin/venues?status=suspended').set(...auth(admin))).body.rows[0]).toMatchObject({
      id,
      suspensionReason: 'Double-booked guests.',
    })

    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/unsuspend`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(204)
    expect((await api().get(`/api/venues/${id}`)).status).toBe(200)
    expect(await audits('venue.suspend')).toBe(1)
    expect(await audits('venue.unsuspend')).toBe(1)
  })

  it('bulk approve is all or nothing', async () => {
    const { agent, admin, owner, id } = await setup()
    const second = (await submitListing(agent, owner.accessToken)).id
    await agent
      .post(`/api/admin/venues/${second}/reject`)
      .set(...auth(admin))
      .send({ reason: 'Not a real venue.' })
    const blocked = await agent
      .post('/api/admin/venues/approve')
      .set(...auth(admin))
      .send({ ids: [id, second] })
    expect(blocked.status).toBe(409)
    expect((await one('SELECT approval_status::text AS s FROM venues WHERE venue_id = $1', [id])).s).toBe('pending')

    const third = (await submitListing(agent, owner.accessToken)).id
    const ok = await agent
      .post('/api/admin/venues/approve')
      .set(...auth(admin))
      .send({ ids: [id, third] })
    expect(ok.body).toEqual({ approved: 2 })
    expect(await count(`SELECT count(*) FROM venues WHERE approval_status = 'approved'`)).toBe(2)
    expect(await audits('venue.approve')).toBe(2)
  })
})

describe('dashboard and audit log (NFR-4)', () => {
  it('stats count venues, users and weekly submissions; the audit log is searchable', async () => {
    const { agent, admin, id } = await setup()
    await agent
      .post(`/api/admin/venues/${id}/approve`)
      .set(...auth(admin))
      .send({})
    const stats = await agent.get('/api/admin/stats').set(...auth(admin))
    expect(stats.body.kpis).toMatchObject({
      pendingApprovals: 0,
      liveVenues: 1,
      suspendedVenues: 0,
      usersByRole: { venue_owner: 1 },
    })
    expect(stats.body.weeks).toHaveLength(12)
    expect(stats.body.weeks.at(-1)).toMatchObject({ submitted: 1, approved: 1 })
    expect(stats.body.activity[0]).toMatchObject({ action: 'venue.approve', target: 'Test Garden Marquee' })

    const log = await agent.get('/api/admin/audit?q=garden&action=venue').set(...auth(admin))
    expect(log.body.rows).toEqual([
      expect.objectContaining({
        action: 'venue.approve',
        targetLabel: 'Test Garden Marquee',
        adminName: admin.body.name,
      }),
    ])
    expect(await pool.query('SELECT 1')).toBeTruthy()
  })
})

describe('AI image check test panel (REQ-9 demo)', () => {
  it('says which detector runs, scores a photo with the real rules and audits it, storing nothing else', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const status = await agent.get('/api/admin/image-detection').set(...auth(admin))
    expect(status.body).toMatchObject({ provider: 'custom', live: false, flagThreshold: 0.8, genuineThreshold: 0.3 })

    setImageDetector(async () => ({ score: 0.91 }))
    const res = await agent
      .post('/api/admin/image-detection/test')
      .set(...auth(admin))
      .attach('file', jpeg(), 'ai.jpg')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      score: 0.91,
      verdict: 'flagged',
      highConfidence: true,
      thresholds: { genuine: 0.3, flag: 0.8 },
    })
    expect(res.body.durationMs).toEqual(expect.any(Number))

    setImageDetector(async () => ({ score: 0.04 }))
    const real = await agent
      .post('/api/admin/image-detection/test')
      .set(...auth(admin))
      .attach('file', jpeg(), 'real.jpg')
    expect(real.body).toMatchObject({ verdict: 'genuine', highConfidence: false })

    expect(await count('SELECT count(*) FROM venue_images')).toBe(0)
    expect(await count('SELECT count(*) FROM media_uploads')).toBe(0)
    expect(await audits('image.detection_test')).toBe(2)
  })

  it('reports a detector that is down as 502, and refuses non-photos and non-admins', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    setImageDetector(async () => {
      throw new Error('sightengine: Incorrect API user or secret')
    })
    const down = await agent
      .post('/api/admin/image-detection/test')
      .set(...auth(admin))
      .attach('file', jpeg(), 'x.jpg')
    expect(down.status).toBe(502)
    expect(down.body.error).toMatchObject({
      code: 'DETECTOR_UNAVAILABLE',
      message: expect.stringMatching(/Incorrect API user or secret/),
    })
    const notPhoto = await agent
      .post('/api/admin/image-detection/test')
      .set(...auth(admin))
      .attach('file', Buffer.from('hello'), 'x.jpg')
    expect(notPhoto.status).toBe(415)
    const owner = await signedIn(agent, 'venue_owner')
    expect((await agent.get('/api/admin/image-detection').set(...auth(owner))).status).toBe(403)
    expect(
      (
        await agent
          .post('/api/admin/image-detection/test')
          .set(...auth(owner))
          .attach('file', jpeg(), 'x.jpg')
      ).status,
    ).toBe(403)
  })
})
