import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bearer } from './helpers/app.js'
import { one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { bookingFor, liveVenue } from './helpers/bookings.js'
import { jpeg, png, pdf, useTempStorage } from './helpers/venues.js'
import { setDisputeEmailSender, testOutbox } from '../src/integrations/mailer.js'

// REQ-48 / EUC-35 (srs-alignment #41): disputes raised by a booking's customer or venue owner, private evidence,
// replies and admin notes, the admin's take -> resolve / reject with audit and emails to both parties; and
// "Report this listing" (venue_reports) with its admin review.

let storage
beforeAll(() => {
  storage = useTempStorage()
})
afterAll(() => storage.cleanup())
beforeEach(async () => {
  await resetDb()
  testOutbox.length = 0
  setDisputeEmailSender(null)
})

const auth = (s) => ['Authorization', bearer(s.accessToken)]
const decisionMail = () => testOutbox.filter((m) => m.kind === 'dispute_decision')
const DESCRIPTION = 'The stage lights were not set up although they were part of the agreed package.'
const auditActions = (id) =>
  pool
    .query('SELECT action, details FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at, log_id', [id])
    .then((r) => r.rows)

async function uploadEvidence(agent, s, buffer = jpeg(), name = 'photo.jpg') {
  return agent
    .post('/api/disputes/uploads')
    .set(...auth(s))
    .attach('file', buffer, name)
}

// A confirmed booking between a fresh customer and a fresh owner, plus strangers of both roles.
async function setup({ confirm = true } = {}) {
  const v = await liveVenue()
  const customer = await signedIn(v.agent, 'customer')
  const { bookingId } = await bookingFor(v, customer, { confirm })
  const otherCustomer = await signedIn(v.agent, 'customer')
  const otherOwner = await signedIn(v.agent, 'venue_owner')
  return { ...v, customer, bookingId, otherCustomer, otherOwner }
}

async function open(t, who = t.customer, body = {}) {
  return t.agent
    .post(`/api/bookings/${t.bookingId}/disputes`)
    .set(...auth(who))
    .send({ category: 'service_not_as_described', description: DESCRIPTION, ...body })
}

describe('opening a dispute', () => {
  it('the customer opens one with evidence; both parties see it, nobody else does', async () => {
    const t = await setup()
    const up = await uploadEvidence(t.agent, t.customer)
    expect(up.status).toBe(201)
    const res = await open(t, t.customer, { evidenceIds: [up.body.fileId] })
    expect(res.status).toBe(201)
    const d = res.body.dispute
    expect(d).toMatchObject({ status: 'open', raisedByRole: 'customer', raisedByYou: true, canReply: true })
    expect(d.reference).toMatch(/^MS-[0-9A-F]{6}$/)
    expect(d.files).toHaveLength(1)

    const owner = await t.agent.get(`/api/disputes/${d.id}`).set(...auth(t.owner))
    expect(owner.status).toBe(200)
    expect(owner.body.dispute).toMatchObject({ raisedByYou: false, yourRole: 'venue_owner' })
    expect((await t.agent.get('/api/disputes').set(...auth(t.owner))).body.data.map((x) => x.id)).toEqual([d.id])

    for (const stranger of [t.otherCustomer, t.otherOwner]) {
      expect((await t.agent.get(`/api/disputes/${d.id}`).set(...auth(stranger))).status).toBe(404)
      expect((await t.agent.get('/api/disputes').set(...auth(stranger))).body.data).toEqual([])
      expect((await open(t, stranger)).status).toBe(404) // a non-party can't open one either
      const reply = await t.agent
        .post(`/api/disputes/${d.id}/notes`)
        .set(...auth(stranger))
        .send({ body: 'Me too' })
      expect(reply.status).toBe(404)
    }
    const decorator = await signedIn(t.agent, 'decorator')
    expect((await t.agent.get('/api/disputes').set(...auth(decorator))).status).toBe(403)
    expect((await t.agent.get('/api/disputes').set(...auth(t.admin))).status).toBe(403)
    expect((await t.agent.get('/api/disputes')).status).toBe(401)
  })

  it('one open dispute per booking per party; the owner can open their own', async () => {
    const t = await setup()
    expect((await open(t)).status).toBe(201)
    const again = await open(t)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('DISPUTE_EXISTS')
    const owner = await open(t, t.owner, { category: 'conduct' })
    expect(owner.status).toBe(201)
    expect(owner.body.dispute.raisedByRole).toBe('venue_owner')
  })

  it('only confirmed, completed or cancelled bookings; validation on the body', async () => {
    const t = await setup({ confirm: false })
    const res = await open(t)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_DISPUTABLE')
    const short = await open(t, t.customer, { description: 'Bad' })
    expect(short.status).toBe(400)
    const cat = await open(t, t.customer, { category: 'refund_now' })
    expect(cat.status).toBe(400)
  })

  it('evidence: only JPEG / PNG, only your own unattached uploads, never public', async () => {
    const t = await setup()
    expect((await uploadEvidence(t.agent, t.customer, pdf(), 'x.pdf')).status).toBe(415)
    expect((await uploadEvidence(t.agent, t.customer, png(), 'x.png')).status).toBe(201)
    const theirs = await uploadEvidence(t.agent, t.otherCustomer)
    const notMine = await open(t, t.customer, { evidenceIds: [theirs.body.fileId] })
    expect(notMine.status).toBe(400)

    const mine = await uploadEvidence(t.agent, t.customer)
    const d = (await open(t, t.customer, { evidenceIds: [mine.body.fileId] })).body.dispute
    const url = d.files[0].url
    for (const who of [t.customer, t.owner, t.admin]) {
      const res = await t.agent.get(url).set(...auth(who))
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/jpeg')
      expect(res.headers['cache-control']).toBe('private, no-store')
    }
    expect((await t.agent.get(url).set(...auth(t.otherCustomer))).status).toBe(404)
    expect((await t.agent.get(url)).status).toBe(401)

    // The file on disk is under disputes/, which the public /uploads route refuses.
    const { storage_key: key } = await one('SELECT storage_key FROM dispute_files WHERE dispute_id = $1', [d.id])
    expect(key.startsWith('disputes/')).toBe(true)
    expect((await t.agent.get(`/uploads/${key}`)).status).toBe(404)
  })
})

describe('replies and admin notes', () => {
  it('parties reply to each other; internal admin notes stay with admins', async () => {
    const t = await setup()
    const d = (await open(t)).body.dispute
    await t.agent
      .post(`/api/disputes/${d.id}/notes`)
      .set(...auth(t.owner))
      .send({ body: 'The lights were set up; see our photos.' })
    await t.agent
      .post(`/api/admin/disputes/${d.id}/notes`)
      .set(...auth(t.admin))
      .send({ body: 'Owner has a history of this.' })
    await t.agent
      .post(`/api/admin/disputes/${d.id}/notes`)
      .set(...auth(t.admin))
      .send({ body: 'Please both send photos from the night.', internal: false })

    const seen = (await t.agent.get(`/api/disputes/${d.id}`).set(...auth(t.customer))).body.dispute.notes
    expect(seen.map((n) => n.body)).toEqual([
      'The lights were set up; see our photos.',
      'Please both send photos from the night.',
    ])
    expect(seen[1].authorName).toBe('MarkieSharkie admin')
    const admin = (await t.agent.get(`/api/admin/disputes/${d.id}`).set(...auth(t.admin))).body.dispute.notes
    expect(admin.filter((n) => n.internal).map((n) => n.body)).toEqual(['Owner has a history of this.'])
    expect((await auditActions(d.id)).map((r) => r.action)).toEqual(['dispute.note', 'dispute.note'])
  })
})

describe('admin decisions', () => {
  it('take -> resolve with recorded compensation; audited; both parties emailed; closed for replies', async () => {
    const t = await setup()
    const d = (await open(t)).body.dispute
    const url = `/api/admin/disputes/${d.id}`
    const body = {
      outcome: 'partially_upheld',
      compensation: '15000',
      resolution: 'Lights were missing for half the event.',
    }

    const early = await t.agent
      .post(`${url}/resolve`)
      .set(...auth(t.admin))
      .send(body)
    expect(early.status).toBe(409) // must be taken first
    expect(
      (
        await t.agent
          .post(`${url}/take`)
          .set(...auth(t.admin))
          .send({})
      ).status,
    ).toBe(200)
    expect(
      (
        await t.agent
          .post(`${url}/take`)
          .set(...auth(t.admin))
          .send({})
      ).status,
    ).toBe(409)

    const detail = await t.agent.get(url).set(...auth(t.admin))
    expect(detail.body.booking.bookingId).toBe(t.bookingId)
    expect(detail.body.booking.events.length).toBeGreaterThan(0) // the booking's status history
    expect(detail.body.dispute.parties.customer.email).toBe(t.customer.body.email)

    const tooMuch = await t.agent
      .post(`${url}/resolve`)
      .set(...auth(t.admin))
      .send({ ...body, compensation: '999999999' })
    expect(tooMuch.status).toBe(400)
    const dismissedWithMoney = await t.agent
      .post(`${url}/resolve`)
      .set(...auth(t.admin))
      .send({ ...body, outcome: 'dismissed' })
    expect(dismissedWithMoney.status).toBe(400)

    const res = await t.agent
      .post(`${url}/resolve`)
      .set(...auth(t.admin))
      .send(body)
    expect(res.status).toBe(200)
    expect(res.body.dispute).toMatchObject({
      status: 'resolved',
      outcome: 'partially_upheld',
      compensation: '15000.00',
    })

    const mail = decisionMail()
    expect(mail.map((m) => m.to).sort()).toEqual([t.customer.body.email, t.owner.body.email].sort())
    expect(mail[0].text).toContain('Rs 15000.00')
    expect(mail[0].text).toContain(`/disputes/${d.id}`)

    expect(
      (
        await t.agent
          .post(`${url}/reject`)
          .set(...auth(t.admin))
          .send({ reason: 'Changed my mind.' })
      ).status,
    ).toBe(409)
    const reply = await t.agent
      .post(`/api/disputes/${d.id}/notes`)
      .set(...auth(t.customer))
      .send({ body: 'Thanks' })
    expect(reply.status).toBe(409)
    expect(reply.body.error.code).toBe('DISPUTE_CLOSED')

    const actions = await auditActions(d.id)
    expect(actions.map((r) => r.action)).toEqual(['dispute.take', 'dispute.resolve'])
    expect(actions[1].details).toMatchObject({ outcome: 'partially_upheld', compensation: '15000.00' })
    // No money moved anywhere: the booking is untouched.
    expect((await one('SELECT status FROM bookings WHERE booking_id = $1', [t.bookingId])).status).toBe('confirmed')

    // Closed, so the customer can open a new one.
    expect((await open(t)).status).toBe(201)
  })

  it('rejects straight from open; a failed email never undoes the decision', async () => {
    const t = await setup()
    const d = (await open(t)).body.dispute
    setDisputeEmailSender(async () => {
      throw new Error('smtp down')
    })
    const res = await t.agent
      .post(`/api/admin/disputes/${d.id}/reject`)
      .set(...auth(t.admin))
      .send({ reason: 'This is about a different booking.' })
    expect(res.status).toBe(200)
    expect(res.body.dispute.status).toBe('rejected')
    expect((await one('SELECT status, resolution FROM disputes WHERE dispute_id = $1', [d.id])).status).toBe('rejected')
  })

  it('the database refuses a rejected dispute without its reason (last line of defence)', async () => {
    const t = await setup()
    const d = (await open(t)).body.dispute
    await expect(pool.query(`UPDATE disputes SET status = 'rejected' WHERE dispute_id = $1`, [d.id])).rejects.toThrow(
      /disputes_rejected_fields/,
    )
  })

  it('lists with status, category and search; counts in /admin/stats; admin only', async () => {
    const t = await setup()
    const d = (await open(t)).body.dispute
    await open(t, t.owner, { category: 'conduct' })
    const list = await t.agent.get('/api/admin/disputes').set(...auth(t.admin))
    expect(list.status).toBe(200)
    expect(list.body.counts).toMatchObject({ open: 2, under_review: 0 })
    const byCat = await t.agent.get('/api/admin/disputes?category=conduct').set(...auth(t.admin))
    expect(byCat.body.rows.map((r) => r.raisedByRole)).toEqual(['venue_owner'])
    const byRef = await t.agent.get(`/api/admin/disputes?q=${d.reference}`).set(...auth(t.admin))
    expect(byRef.body.total).toBe(2)
    expect((await t.agent.get('/api/admin/stats').set(...auth(t.admin))).body.kpis.openDisputes).toBe(2)

    for (const who of [t.customer, t.owner]) {
      expect((await t.agent.get('/api/admin/disputes').set(...auth(who))).status).toBe(403)
      expect(
        (
          await t.agent
            .post(`/api/admin/disputes/${d.id}/take`)
            .set(...auth(who))
            .send({})
        ).status,
      ).toBe(403)
    }
  })
})

describe('venue reports', () => {
  it('a signed-in user reports a live venue once; the admin takes and resolves it, audited', async () => {
    const t = await setup()
    const url = `/api/venues/${t.venueId}/reports`
    const body = { reason: 'fake_photos', details: 'The stage photos are from another listing.' }
    expect((await t.agent.post(url).send(body)).status).toBe(401)
    expect(
      (
        await t.agent
          .post(url)
          .set(...auth(t.admin))
          .send(body)
      ).status,
    ).toBe(403)
    const own = await t.agent
      .post(url)
      .set(...auth(t.owner))
      .send(body)
    expect(own.body.error.code).toBe('OWN_VENUE')

    const res = await t.agent
      .post(url)
      .set(...auth(t.customer))
      .send(body)
    expect(res.status).toBe(201)
    const dup = await t.agent
      .post(url)
      .set(...auth(t.customer))
      .send(body)
    expect(dup.body.error.code).toBe('REPORT_EXISTS')
    expect(
      (
        await t.agent
          .post(url)
          .set(...auth(t.customer))
          .send({ ...body, reason: 'spam' })
      ).status,
    ).toBe(400)
    expect(
      (
        await t.agent
          .post(`/api/venues/00000000-0000-4000-8000-000000000000/reports`)
          .set(...auth(t.customer))
          .send(body)
      ).status,
    ).toBe(404)

    const list = await t.agent.get('/api/admin/venue-reports').set(...auth(t.admin))
    expect(list.body.rows).toHaveLength(1)
    expect(list.body.rows[0]).toMatchObject({ venueName: expect.any(String), reason: 'fake_photos', status: 'open' })
    expect(list.body.rows[0].reporter.email).toBe(t.customer.body.email)
    expect((await t.agent.get('/api/admin/stats').set(...auth(t.admin))).body.kpis.openReports).toBe(1)

    const id = res.body.report.id
    const resolveBody = { resolution: 'Asked the owner to replace the photos.' }
    expect(
      (
        await t.agent
          .post(`/api/admin/venue-reports/${id}/take`)
          .set(...auth(t.admin))
          .send({})
      ).status,
    ).toBe(200)
    expect(
      (
        await t.agent
          .post(`/api/admin/venue-reports/${id}/resolve`)
          .set(...auth(t.admin))
          .send(resolveBody)
      ).status,
    ).toBe(200)
    expect(
      (
        await t.agent
          .post(`/api/admin/venue-reports/${id}/resolve`)
          .set(...auth(t.admin))
          .send(resolveBody)
      ).status,
    ).toBe(409)
    expect((await auditActions(id)).map((r) => r.action)).toEqual(['report.take', 'report.resolve'])
    // Resolved, so the same user can report it again.
    expect(
      (
        await t.agent
          .post(url)
          .set(...auth(t.customer))
          .send(body)
      ).status,
    ).toBe(201)
    expect((await t.agent.get('/api/admin/venue-reports').set(...auth(t.customer))).status).toBe(403)

    const audit = await t.agent.get('/api/admin/audit?action=report').set(...auth(t.admin))
    expect(audit.body.rows.map((r) => r.targetLabel ?? r.target)).toContain(list.body.rows[0].venueName)
  })
})
