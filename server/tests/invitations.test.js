import crypto from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { count, one, pool, resetDb } from './helpers/db.js'
import { signedIn } from './helpers/factories.js'
import { bookingFor, liveVenue } from './helpers/bookings.js'
import { useTempStorage } from './helpers/venues.js'
import { setImageDetector } from '../src/integrations/imageDetection.js'
import { setInvitationSender, testOutbox } from '../src/integrations/mailer.js'
import { settleVerifications } from '../src/modules/venues/imageVerification.js'

// Invitations, guests and RSVPs (EUC-25, 26, 27; srs-alignment #39).

let storage
beforeAll(() => {
  storage = useTempStorage()
})
afterAll(() => storage.cleanup())
beforeEach(async () => {
  await resetDb()
  testOutbox.length = 0
  setImageDetector(async () => ({ score: 0.05 }))
})
afterEach(async () => {
  await settleVerifications()
  setImageDetector(null)
  setInvitationSender(null)
})

const auth = (s) => ['Authorization', bearer(s.accessToken)]
const card = {
  template: 'classic',
  title: 'Sara & Ali’s Walima',
  eventType: 'walima',
  hostNames: 'The Khan and Malik families',
  message: 'Join us for dinner.',
  dressCode: 'Formal',
  notes: 'Parking at gate 2.',
  contactPhone: '0300-1112223',
  rsvpBy: '',
}
const tokenOf = (link) => link.split('/i/')[1]
const invitationMail = () => testOutbox.filter((m) => m.kind === 'invitation')
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex')

// A confirmed booking with an invitation and two guests (one email, one mobile only), sent.
async function sentInvitation() {
  const v = await liveVenue()
  const host = await signedIn(v.agent, 'customer')
  const { bookingId, slotId } = await bookingFor(v, host)
  const saved = await v.agent
    .put(`/api/bookings/${bookingId}/invitation`)
    .set(...auth(host))
    .send(card)
  expect(saved.status).toBe(201)
  const invitationId = saved.body.invitation.invitationId
  const added = await v.agent
    .post(`/api/invitations/${invitationId}/guests`)
    .set(...auth(host))
    .send({
      guests: [
        { name: 'Ayesha Malik', email: 'ayesha@example.com' },
        { name: 'Bilal Raza', phone: '0321-5556667' },
      ],
    })
  expect(added.status).toBe(201)
  const sent = await v.agent
    .post(`/api/invitations/${invitationId}/send`)
    .set(...auth(host))
    .send({})
  expect(sent.status).toBe(200)
  const byName = Object.fromEntries(sent.body.results.map((r) => [r.name, r]))
  return { v, host, bookingId, slotId, invitationId, results: byName }
}

describe('the invitation (EUC-25, REQ-36)', () => {
  it('only the customer of a confirmed booking can make it; one per booking; date and venue from the booking', async () => {
    const v = await liveVenue()
    const host = await signedIn(v.agent, 'customer')
    const pending = await bookingFor(v, host, { confirm: false })
    const early = await v.agent
      .put(`/api/bookings/${pending.bookingId}/invitation`)
      .set(...auth(host))
      .send(card)
    expect(early.status).toBe(409)
    expect(early.body.error.code).toBe('NOT_CONFIRMED')

    const { bookingId } = await bookingFor(v, host, { days: 41 })
    const other = await signedIn(v.agent, 'customer')
    expect(
      (
        await v.agent
          .put(`/api/bookings/${bookingId}/invitation`)
          .set(...auth(other))
          .send(card)
      ).status,
    ).toBe(404)
    expect((await v.agent.get(`/api/bookings/${bookingId}/invitation`).set(...auth(other))).status).toBe(404)
    expect((await v.agent.get(`/api/bookings/${bookingId}/invitation`).set(...auth(v.owner))).status).toBe(403)

    const created = await v.agent
      .put(`/api/bookings/${bookingId}/invitation`)
      .set(...auth(host))
      .send(card)
    expect(created.status).toBe(201)
    expect(created.body.invitation).toMatchObject({
      title: card.title,
      dressCode: 'Formal',
      contactPhone: '+923001112223',
      venueName: 'Test Garden Marquee',
      hallName: 'Main hall',
      startTime: '19:00',
    })
    const updated = await v.agent
      .put(`/api/bookings/${bookingId}/invitation`)
      .set(...auth(host))
      .send({ ...card, title: 'Our Walima' })
    expect(updated.status).toBe(200)
    expect(updated.body.invitation.invitationId).toBe(created.body.invitation.invitationId)
    expect(await count('SELECT count(*) FROM invitations WHERE booking_id = $1', [bookingId])).toBe(1)
    const late = await v.agent
      .put(`/api/bookings/${bookingId}/invitation`)
      .set(...auth(host))
      .send({ ...card, rsvpBy: '2099-01-01' })
    expect(late.body.error.details[0].field).toBe('rsvpBy')
  })

  it('validates guests: a contact is required, no duplicates', async () => {
    const { v, host, invitationId } = await sentInvitation()
    const post = (guests) =>
      v.agent
        .post(`/api/invitations/${invitationId}/guests`)
        .set(...auth(host))
        .send({ guests })
    expect((await post([{ name: 'No Contact' }])).status).toBe(400)
    expect((await post([{ name: 'Bad Phone', phone: '12345' }])).status).toBe(400)
    expect(
      (
        await post([
          { name: 'Twice', email: 'x@example.com' },
          { name: 'Again', email: 'x@example.com' },
        ])
      ).status,
    ).toBe(400)
    const dup = await post([{ name: 'Ayesha again', email: 'AYESHA@example.com' }])
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('GUEST_EXISTS')
  })
})

describe('sending (EUC-25 steps 5-6)', () => {
  it('emails guests with an email, gives a copyable link for everyone, and stores only the token hash', async () => {
    const { invitationId, results } = await sentInvitation()
    expect(results['Ayesha Malik']).toMatchObject({ delivery: 'sent' })
    expect(results['Bilal Raza']).toMatchObject({ delivery: 'manual' })
    expect(invitationMail()).toHaveLength(1)
    expect(invitationMail()[0]).toMatchObject({ to: 'ayesha@example.com', link: results['Ayesha Malik'].link })
    expect(invitationMail()[0].subject).toMatch(/You’re invited/)
    const token = tokenOf(results['Ayesha Malik'].link)
    expect(token.length).toBeGreaterThanOrEqual(30)
    const stored = await one(`SELECT invite_token, delivery_status, sent_at FROM guests WHERE name = 'Ayesha Malik'`)
    expect(stored.invite_token).toBe(sha256(token))
    expect(stored.invite_token).not.toContain(token)
    expect(stored.delivery_status).toBe('sent')
    expect(
      await count(`SELECT count(*) FROM guests WHERE invitation_id = $1 AND delivery_status = 'pending'`, [
        invitationId,
      ]),
    ).toBe(1)
  })

  it('a mailer failure keeps the invitation, marks the guest not delivered, and a retry works', async () => {
    const v = await liveVenue()
    const host = await signedIn(v.agent, 'customer')
    const { bookingId } = await bookingFor(v, host)
    const { invitationId } = (
      await v.agent
        .put(`/api/bookings/${bookingId}/invitation`)
        .set(...auth(host))
        .send(card)
    ).body.invitation
    await v.agent
      .post(`/api/invitations/${invitationId}/guests`)
      .set(...auth(host))
      .send({ guests: [{ name: 'Ayesha Malik', email: 'ayesha@example.com' }] })
    setInvitationSender(async () => {
      throw new Error('SMTP timeout')
    })
    const failed = await v.agent
      .post(`/api/invitations/${invitationId}/send`)
      .set(...auth(host))
      .send({})
    expect(failed.body.results[0]).toMatchObject({ delivery: 'failed', error: 'SMTP timeout' })
    expect(failed.body.results[0].link).toMatch(/\/i\//) // still shareable by hand
    const list = await v.agent.get(`/api/invitations/${invitationId}/guests?status=not_delivered`).set(...auth(host))
    expect(list.body.guests).toEqual([
      expect.objectContaining({ name: 'Ayesha Malik', delivery: 'failed', deliveryError: 'SMTP timeout' }),
    ])

    setInvitationSender(null)
    const retry = await v.agent
      .post(`/api/invitations/${invitationId}/send`)
      .set(...auth(host))
      .send({})
    expect(retry.body.results[0].delivery).toBe('sent')
    expect(invitationMail()).toHaveLength(1)
  })

  it('"send to everyone not sent yet" keeps links already shared and skips revoked guests', async () => {
    const { v, host, invitationId, results } = await sentInvitation()
    const bilal = tokenOf(results['Bilal Raza'].link)
    await v.agent
      .post(`/api/invitations/${invitationId}/guests/${results['Ayesha Malik'].guestId}/revoke`)
      .set(...auth(host))
      .send({})
    await v.agent
      .post(`/api/invitations/${invitationId}/guests`)
      .set(...auth(host))
      .send({ guests: [{ name: 'Chand Bibi', phone: '0345-1231231' }] })
    const again = await v.agent
      .post(`/api/invitations/${invitationId}/send`)
      .set(...auth(host))
      .send({})
    expect(again.body.results.map((r) => r.name)).toEqual(['Chand Bibi'])
    expect((await api().get(`/api/i/${bilal}`)).status).toBe(200)
  })

  it('resend and "new link" replace the old link; revoke stops it', async () => {
    const { v, host, invitationId, results } = await sentInvitation()
    const oldToken = tokenOf(results['Bilal Raza'].link)
    const guestId = results['Bilal Raza'].guestId
    const fresh = await v.agent
      .post(`/api/invitations/${invitationId}/guests/${guestId}/link`)
      .set(...auth(host))
      .send({})
    const newToken = tokenOf(fresh.body.results[0].link)
    expect((await api().get(`/api/i/${oldToken}`)).status).toBe(404)
    expect((await api().get(`/api/i/${newToken}`)).status).toBe(200)
    expect(
      (
        await v.agent
          .post(`/api/invitations/${invitationId}/guests/${guestId}/revoke`)
          .set(...auth(host))
          .send({})
      ).status,
    ).toBe(204)
    expect((await api().get(`/api/i/${newToken}`)).status).toBe(404)
    const listed = await v.agent.get(`/api/invitations/${invitationId}/guests`).set(...auth(host))
    expect(listed.body.guests.find((g) => g.guestId === guestId).delivery).toBe('revoked')
  })
})

describe('the guest page and RSVP (EUC-26, EUC-27)', () => {
  it('shows the event and only this guest; the reply can be changed; the host sees totals', async () => {
    const { v, host, invitationId, results } = await sentInvitation()
    const token = tokenOf(results['Ayesha Malik'].link)
    const page = await api().get(`/api/i/${token}`)
    expect(page.status).toBe(200)
    expect(page.body).toMatchObject({
      guest: { name: 'Ayesha Malik', reply: null },
      rsvpOpen: true,
      invitation: {
        title: card.title,
        hostNames: card.hostNames,
        dressCode: 'Formal',
        venueName: 'Test Garden Marquee',
        mapsUrl: expect.stringMatching(/^https:\/\/www\.google\.com\/maps/),
      },
    })
    const body = JSON.stringify(page.body)
    expect(body).not.toMatch(/Bilal|0321|ayesha@example\.com|invitationId|bookingId|total|price/i)

    const yes = await api()
      .put(`/api/i/${token}/rsvp`)
      .send({ response: 'yes', partySize: 3, note: 'Coming with family' })
    expect(yes.body.reply).toMatchObject({ response: 'yes', partySize: 3 })
    let totals = (await v.agent.get(`/api/invitations/${invitationId}/guests`).set(...auth(host))).body.totals
    expect(totals).toMatchObject({
      invited: 2,
      attending: 1,
      declined: 0,
      awaiting: 1,
      people: 3,
      hallCapacity: 400,
      bookedGuests: 150,
    })

    const no = await api().put(`/api/i/${token}/rsvp`).send({ response: 'no', partySize: 3 })
    expect(no.body.reply).toMatchObject({ response: 'no', partySize: 0 })
    totals = (await v.agent.get(`/api/invitations/${invitationId}/guests?status=declined`).set(...auth(host))).body
    expect(totals.guests.map((g) => g.name)).toEqual(['Ayesha Malik'])
    expect(totals.totals).toMatchObject({ attending: 0, declined: 1, people: 0 })
    expect(await count('SELECT count(*) FROM rsvps')).toBe(1)
    const summary = await v.agent.get('/api/invitations').set(...auth(host))
    expect(summary.body.data[0]).toMatchObject({ invited: 2, declined: 1, awaiting: 1 })
  })

  it('invalid, expired and revoked links get the same generic 404; bad input is 400', async () => {
    const { results } = await sentInvitation()
    const token = tokenOf(results['Ayesha Malik'].link)
    const unknown = await api().get(`/api/i/${crypto.randomBytes(24).toString('base64url')}`)
    expect(unknown.status).toBe(404)
    expect(unknown.body.error.code).toBe('INVITATION_NOT_FOUND')
    expect((await api().get('/api/i/short')).status).toBe(400)
    expect((await api().put(`/api/i/${token}/rsvp`).send({ response: 'maybe' })).status).toBe(400)
    expect((await api().put(`/api/i/${token}/rsvp`).send({ response: 'yes', partySize: 50 })).status).toBe(400)

    await pool.query(`UPDATE guests SET token_expires_at = now() - interval '1 minute' WHERE invite_token = $1`, [
      sha256(token),
    ])
    const expired = await api().get(`/api/i/${token}`)
    expect(expired.status).toBe(404)
    expect(expired.body.error).toEqual(unknown.body.error)
    expect((await api().put(`/api/i/${token}/rsvp`).send({ response: 'yes' })).status).toBe(404)
  })

  it('replies close after the event day; a cancelled booking’s links stop working', async () => {
    const { slotId, bookingId, results } = await sentInvitation()
    const token = tokenOf(results['Ayesha Malik'].link)
    await pool.query(`UPDATE time_slots SET date = (now() AT TIME ZONE 'Asia/Karachi')::date - 1 WHERE slot_id = $1`, [
      slotId,
    ])
    const closed = await api().put(`/api/i/${token}/rsvp`).send({ response: 'yes' })
    expect(closed.status).toBe(409)
    expect(closed.body.error.code).toBe('RSVP_CLOSED')
    await pool.query(
      `UPDATE bookings SET status = 'cancelled', closed_as = 'cancelled', cancellation_reason = 'test' WHERE booking_id = $1`,
      [bookingId],
    )
    expect((await api().get(`/api/i/${token}`)).status).toBe(404)
  })

  it('nobody else can read or change the guest list', async () => {
    const { v, invitationId, results } = await sentInvitation()
    const stranger = await signedIn(v.agent, 'customer')
    const guestId = results['Bilal Raza'].guestId
    expect((await v.agent.get(`/api/invitations/${invitationId}/guests`).set(...auth(stranger))).status).toBe(404)
    expect(
      (
        await v.agent
          .post(`/api/invitations/${invitationId}/send`)
          .set(...auth(stranger))
          .send({})
      ).status,
    ).toBe(404)
    expect(
      (await v.agent.delete(`/api/invitations/${invitationId}/guests/${guestId}`).set(...auth(stranger))).status,
    ).toBe(404)
    expect((await v.agent.get(`/api/invitations/${invitationId}/guests`).set(...auth(v.owner))).status).toBe(403)
    expect((await api().get(`/api/invitations/${invitationId}/guests`)).status).toBe(401)
    expect((await v.agent.get('/api/invitations').set(...auth(stranger))).body.data).toEqual([])
    expect(await count('SELECT count(*) FROM guests WHERE guest_id = $1', [guestId])).toBe(1)
  })
})
