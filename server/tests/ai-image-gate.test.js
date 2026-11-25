import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { jpeg, submission, upload, useTempStorage } from './helpers/venues.js'
import { setImageDetector } from '../src/integrations/imageDetection.js'
import { setVenueEmailSender, testOutbox } from '../src/integrations/mailer.js'
import { settleVerifications } from '../src/modules/venues/imageVerification.js'
import { retryVenueEmails } from '../src/modules/venues/venueEmails.js'

// srs-alignment #42 (EUC-05, EUC-08, EUC-34, SYS-02): the admin's AI threshold gate on venue photos, the venue rule
// (auto-rejection for AI-generated images), the approval gate and the owner emails (onboarded / AI-rejected), sent
// exactly once. The detector is always mocked: no network.

let storage
beforeAll(() => {
  storage = useTempStorage()
})
afterAll(() => {
  setImageDetector(null)
  storage.cleanup()
})
beforeEach(async () => {
  await resetDb()
  await pool.query('INSERT INTO platform_settings DEFAULT VALUES ON CONFLICT (id) DO NOTHING')
  testOutbox.length = 0
  setVenueEmailSender(null)
  scripted([])
})

const auth = (s) => ['Authorization', bearer(s.accessToken)]
const venueMail = (kind) => testOutbox.filter((m) => m.kind === `venue_${kind}`)

// The detector answers these scores in order (an Error = the detector is down); then 0.02.
let queue = []
let calls = 0
function scripted(scores) {
  queue = [...scores]
  calls = 0
  setImageDetector(async () => {
    calls += 1
    const next = queue.length ? queue.shift() : 0.02
    if (next instanceof Error) throw next
    return { score: next }
  })
}

async function photos(agent, owner, n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const res = await upload(agent, owner.accessToken, 'photo', jpeg(2048 + i))
    expect(res.status).toBe(201)
    out.push(res.body)
  }
  return out
}

async function submitWith(agent, owner, uploads) {
  const res = await agent
    .post('/api/owner/venues')
    .set(...auth(owner))
    .send(submission(uploads.map((u) => u.uploadId)))
  expect(res.status).toBe(201)
  await settleVerifications()
  return res.body.venue.id
}

const setThreshold = (agent, admin, threshold) =>
  agent
    .put('/api/admin/settings/ai-threshold')
    .set(...auth(admin))
    .send({ threshold })

describe('threshold setting', () => {
  it('admins read and change it (0-100, audited with old and new); others cannot', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const get = await agent.get('/api/admin/settings/ai-threshold').set(...auth(admin))
    expect(get.body.threshold).toBe(70)

    const res = await setThreshold(agent, admin, 55.5)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ threshold: 55.5, updatedBy: admin.body.name })
    const audit = await one(`SELECT details FROM admin_audit_log WHERE action = 'settings.ai_threshold'`)
    expect(audit.details).toEqual({ from: 70, to: 55.5 })

    for (const bad of [-1, 100.5, '70', 70.123]) expect((await setThreshold(agent, admin, bad)).status).toBe(400)
    for (const role of ['customer', 'venue_owner', 'decorator']) {
      const s = await signedIn(agent, role)
      expect((await setThreshold(agent, s, 10)).status).toBe(403)
      expect((await agent.get('/api/admin/settings/ai-threshold').set(...auth(s))).status).toBe(403)
    }
    expect((await agent.put('/api/admin/settings/ai-threshold').send({ threshold: 10 })).status).toBe(401)
  })
})

describe('the gate at upload', () => {
  it('below the threshold is accepted, at or above it rejected (boundaries at 70 %)', async () => {
    const agent = api()
    const owner = await signedIn(agent, 'venue_owner')
    scripted([0.6999, 0.7, 0.7001, 0.0, 1.0])
    const results = await photos(agent, owner, 5)
    expect(results.map((r) => [r.check.status, r.check.aiScore])).toEqual([
      ['accepted', 69.99],
      ['rejected_ai', 70],
      ['rejected_ai', 70.01],
      ['accepted', 0],
      ['rejected_ai', 100],
    ])
    // A rejected photo is quarantined: not served from /uploads, only through its signed link.
    const rejected = await one(`SELECT storage_key FROM media_uploads WHERE upload_id = $1`, [results[1].uploadId])
    expect(rejected.storage_key.startsWith('quarantine/')).toBe(true)
    expect((await agent.get(`/uploads/${rejected.storage_key}`)).status).toBe(404)
    const signed = new URL(results[1].url)
    expect(signed.pathname).toBe('/api/files/quarantine')
    expect((await agent.get(`${signed.pathname}${signed.search}`)).status).toBe(200)
    signed.searchParams.set('sig', 'x'.repeat(43))
    expect((await agent.get(`${signed.pathname}${signed.search}`)).status).toBe(404)
  })

  it('changing the threshold affects only photos checked afterwards', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const owner = await signedIn(agent, 'venue_owner')
    scripted([0.6, 0.6])
    const [before] = await photos(agent, owner, 1)
    expect(before.check.status).toBe('accepted')
    await setThreshold(agent, admin, 50)
    const [after] = await photos(agent, owner, 1)
    expect(after.check.status).toBe('rejected_ai')
    const rows = (
      await pool.query(`SELECT decision, threshold_applied::float AS t FROM media_uploads ORDER BY created_at`)
    ).rows
    expect(rows).toEqual([
      { decision: 'accepted', t: 70 },
      { decision: 'rejected_ai', t: 50 },
    ])
  })

  it('a detector error never rejects: the photo stays pending and the owner can retry it', async () => {
    const agent = api()
    const owner = await signedIn(agent, 'venue_owner')
    const other = await signedIn(agent, 'venue_owner')
    scripted([new Error('timeout')])
    const [photo] = await photos(agent, owner, 1)
    expect(photo.check).toEqual({ status: 'pending', aiScore: null, canRetry: true })
    expect((await agent.post(`/api/owner/uploads/${photo.uploadId}/check`).set(...auth(other))).status).toBe(404)
    scripted([0.1])
    const retry = await agent.post(`/api/owner/uploads/${photo.uploadId}/check`).set(...auth(owner))
    expect(retry.status).toBe(200)
    expect(retry.body.check).toMatchObject({ status: 'accepted', aiScore: 10 })
  })
})

describe('the venue rule and the approval gate', () => {
  it('too few accepted photos after AI rejections: venue rejected, owner emailed once', async () => {
    const agent = api()
    const owner = await signedIn(agent, 'venue_owner')
    scripted([0.95, 0.02, 0.02, 0.02, 0.02])
    const id = await submitWith(agent, owner, await photos(agent, owner, 5))
    expect(await one('SELECT approval_status, rejection_reason FROM venues WHERE venue_id = $1', [id])).toEqual({
      approval_status: 'rejected',
      rejection_reason: 'AI-generated images',
    })
    const mail = venueMail('ai_rejected')
    expect(mail).toHaveLength(1)
    expect(mail[0].to).toBe(owner.body.email)
    expect(mail[0].text).toContain('images appear to be AI-generated')
    expect(mail[0].text).toContain('resubmit')
    expect(mail[0].text).not.toMatch(/\d+ ?%|score|threshold/i)

    // Running the rule again (retry job, another check) never sends a second email.
    const { evaluateVenue } = await import('../src/modules/venues/imageVerification.js')
    await evaluateVenue(id)
    expect(venueMail('ai_rejected')).toHaveLength(1)
    expect(await count(`SELECT count(*) FROM venue_emails WHERE venue_id = $1`, [id])).toBe(1)
  })

  it('enough accepted photos keep it pending, but any rejected photo blocks approval (409)', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const owner = await signedIn(agent, 'venue_owner')
    scripted([0.9, 0.02, 0.02, 0.02, 0.02, 0.02])
    const id = await submitWith(agent, owner, await photos(agent, owner, 6))
    expect((await one('SELECT approval_status FROM venues WHERE venue_id = $1', [id])).approval_status).toBe('pending')
    const res = await agent
      .post(`/api/admin/venues/${id}/approve`)
      .set(...auth(admin))
      .send({})
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('IMAGES_NOT_READY')
    expect(res.body.error.message).toContain('rejected as AI-generated')
    expect(venueMail('onboarded')).toHaveLength(0)

    // The owner can replace the rejected photo and resubmit while pending; old photos are scored afresh.
    const mine = await agent.get(`/api/owner/venues/${id}`).set(...auth(owner))
    const rejected = mine.body.listing.images.find((i) => i.check.status === 'rejected_ai')
    expect(rejected.check).toMatchObject({ aiScorePercent: 90 })
    expect(rejected.check.thresholdApplied).toBeUndefined()
    const keepIds = (
      await pool.query(`SELECT upload_id FROM media_uploads WHERE decision = 'accepted' ORDER BY created_at`)
    ).rows.map((r) => r.upload_id)
    scripted([0.03])
    const [fresh] = await photos(agent, owner, 1)
    const before = calls
    const re = await agent
      .put(`/api/owner/venues/${id}`)
      .set(...auth(owner))
      .send(submission([...keepIds, fresh.uploadId]))
    expect(re.status).toBe(200)
    await settleVerifications()
    expect(calls - before).toBe(5) // the 5 kept photos were checked again; the new one kept its fresh check
    expect(
      (
        await agent
          .post(`/api/admin/venues/${id}/approve`)
          .set(...auth(admin))
          .send({})
      ).status,
    ).toBe(204)
  })

  it('photos still waiting for the check block approval', async () => {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const owner = await signedIn(agent, 'venue_owner')
    const down = new Error('down')
    scripted([down, down, down, down, down, down, down, down, down, down])
    const id = await submitWith(agent, owner, await photos(agent, owner, 5))
    expect((await one('SELECT approval_status FROM venues WHERE venue_id = $1', [id])).approval_status).toBe('pending')
    const res = await agent
      .post(`/api/admin/venues/${id}/approve`)
      .set(...auth(admin))
      .send({})
    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('waiting for the AI check')
  })
})

describe('approval emails', () => {
  async function readyVenue() {
    const agent = api()
    const admin = await signedIn(agent, 'admin')
    const owner = await signedIn(agent, 'venue_owner')
    const id = await submitWith(agent, owner, await photos(agent, owner, 5))
    return { agent, admin, owner, id }
  }
  const approve = (t) =>
    t.agent
      .post(`/api/admin/venues/${t.id}/approve`)
      .set(...auth(t.admin))
      .send({})

  it('approval sends exactly one "onboarded" email, even on a double click', async () => {
    const t = await readyVenue()
    const [a, b] = await Promise.all([approve(t), approve(t)])
    expect([a.status, b.status].sort()).toEqual([204, 409])
    const mail = venueMail('onboarded')
    expect(mail).toHaveLength(1)
    expect(mail[0]).toMatchObject({ to: t.owner.body.email, subject: expect.stringContaining('Test Garden Marquee') })
    expect(mail[0].text).toContain('Your marquee has been onboarded')
    const detail = await t.agent.get(`/api/admin/venues/${t.id}`).set(...auth(t.admin))
    expect(detail.body.emails).toEqual([expect.objectContaining({ kind: 'onboarded', status: 'sent', attempts: 1 })])
    expect(await count('SELECT count(*) FROM venue_images WHERE venue_id = $1 AND is_published', [t.id])).toBe(5)
  })

  it('a failed email keeps the approval, is recorded, retried by the job and resendable once', async () => {
    const t = await readyVenue()
    setVenueEmailSender(async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    })
    expect((await approve(t)).status).toBe(204)
    expect((await one('SELECT approval_status FROM venues WHERE venue_id = $1', [t.id])).approval_status).toBe(
      'approved',
    )
    const email = await one('SELECT email_id, status, attempts, last_error FROM venue_emails WHERE venue_id = $1', [
      t.id,
    ])
    expect(email).toMatchObject({ status: 'failed', attempts: 1, last_error: 'ECONNREFUSED' })

    setVenueEmailSender(null)
    const resend = await t.agent
      .post(`/api/admin/venues/${t.id}/emails/${email.email_id}/resend`)
      .set(...auth(t.admin))
      .send({})
    expect(resend.status).toBe(200)
    expect(resend.body.status).toBe('sent')
    expect(venueMail('onboarded')).toHaveLength(1)
    const again = await t.agent
      .post(`/api/admin/venues/${t.id}/emails/${email.email_id}/resend`)
      .set(...auth(t.admin))
      .send({})
    expect(again.status).toBe(409)
    await retryVenueEmails()
    expect(venueMail('onboarded')).toHaveLength(1)
    expect(
      (await t.agent.post(`/api/admin/venues/${t.id}/emails/${email.email_id}/resend`).set(...auth(t.owner))).status,
    ).toBe(403)
  })

  it('the retry job delivers an email that failed earlier', async () => {
    const t = await readyVenue()
    setVenueEmailSender(async () => {
      throw new Error('smtp down')
    })
    await approve(t)
    setVenueEmailSender(null)
    await retryVenueEmails() // too soon: waits 2 minutes per attempt
    expect(venueMail('onboarded')).toHaveLength(0)
    await retryVenueEmails({ backoffMinutes: 0 })
    expect(venueMail('onboarded')).toHaveLength(1)
    expect((await one('SELECT status FROM venue_emails WHERE venue_id = $1', [t.id])).status).toBe('sent')
  })
})

describe('public and booking', () => {
  it('an unapproved venue is neither public nor bookable', async () => {
    const agent = api()
    const owner = await signedIn(agent, 'venue_owner')
    const customer = await signedIn(agent, 'customer')
    scripted([0.9])
    const id = await submitWith(agent, owner, await photos(agent, owner, 6))
    expect((await agent.get(`/api/venues/${id}`)).status).toBe(404)
    expect((await agent.get('/api/venues')).body.venues.map((v) => v.id)).not.toContain(id)
    expect(await count('SELECT count(*) FROM time_slots WHERE venue_id = $1', [id])).toBe(0)
    const fake = await agent
      .post('/api/slots/00000000-0000-4000-8000-000000000000/hold')
      .set(...auth(customer))
      .send({})
    expect(fake.status).toBe(404)
    expect((await agent.get('/api/admin/settings/ai-threshold').set(...auth(customer))).status).toBe(403)
  })
})
