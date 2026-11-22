import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { api, bearer } from './helpers/app.js'
import { pool, resetDb } from './helpers/db.js'
import { register, signedIn } from './helpers/factories.js'
import { glb, insertVenue, jpeg, submission, upload, uploadIds, useTempStorage } from './helpers/venues.js'
import { setImageDetector } from '../src/integrations/imageDetection.js'
import { settleVerifications } from '../src/modules/venues/imageVerification.js'

// REQ-11 / EUC-06: the public venue page gets each hall's uploaded walkthrough (type + URL) so the browser can show
// the .glb viewer or the 360° viewer, and /uploads serves those files safely.

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

// An owner's listing with a .glb on hall 1 and a 360° JPEG on hall 2, made public directly in SQL.
async function liveVenueWithWalkthroughs() {
  const agent = api()
  const s = await signedIn(agent, 'venue_owner')
  const photos = await uploadIds(agent, s.accessToken, 5)
  const model = (await upload(agent, s.accessToken, 'walkthrough', glb(), 'hall.glb')).body.uploadId
  const pano = (await upload(agent, s.accessToken, 'walkthrough', jpeg(4096), 'pano.jpg')).body.uploadId
  const body = submission(photos)
  body.halls[0].walkthrough = { mode: 'upload', uploadId: model }
  body.halls[1].walkthrough = { mode: 'upload', uploadId: pano }
  const res = await agent.post('/api/owner/venues').set('Authorization', bearer(s.accessToken)).send(body)
  expect(res.status).toBe(201)
  const id = res.body.venue.id
  await pool.query(`UPDATE venues SET approval_status = 'approved' WHERE venue_id = $1`, [id])
  return id
}

describe('GET /api/venues/:id hall walkthroughs (REQ-11)', () => {
  it('returns the uploaded model and panorama per hall with their type and URL', async () => {
    const id = await liveVenueWithWalkthroughs()
    const res = await api().get(`/api/venues/${id}`)
    expect(res.status).toBe(200)
    const [first, second] = res.body.venue.halls
    expect(first.walkthrough).toMatchObject({ mode: 'upload', file: { assetType: 'model_3d' } })
    expect(first.walkthrough.file.url).toMatch(/^https?:\/\/[^/]+\/uploads\/.+\.glb$/)
    expect(second.walkthrough).toMatchObject({ mode: 'upload', file: { assetType: 'panorama_360' } })
    expect(second.walkthrough.file.url).toMatch(/\.jpg$/)
  })

  it('has no file for a hall without an upload (the dimension-based model is used instead)', async () => {
    const { user } = await register(api(), 'venue_owner')
    const { id } = await insertVenue({ ownerId: user.id, name: 'Generated Hall', city: 'Lahore' })
    const res = await api().get(`/api/venues/${id}`)
    expect(res.status).toBe(200)
    for (const hall of res.body.venue.halls) expect(hall.walkthrough.file).toBeNull()
  })
})

describe('/uploads serving walkthrough files', () => {
  it('serves a .glb as model/gltf-binary with nosniff', async () => {
    const id = await liveVenueWithWalkthroughs()
    const { body } = await api().get(`/api/venues/${id}`)
    const path = new URL(body.venue.halls[0].walkthrough.file.url).pathname
    const res = await api().get(path)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('model/gltf-binary')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['access-control-allow-origin'] ?? res.headers['cross-origin-resource-policy']).toBeTruthy()
  })

  it('serves the 360° JPEG as an image', async () => {
    const id = await liveVenueWithWalkthroughs()
    const { body } = await api().get(`/api/venues/${id}`)
    const res = await api().get(new URL(body.venue.halls[1].walkthrough.file.url).pathname)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^image\/jpeg/)
  })

  it('never serves files outside the uploads folder', async () => {
    for (const path of ['/uploads/../package.json', '/uploads/..%2f..%2fpackage.json', '/uploads/%2e%2e/.env']) {
      const res = await api().get(path)
      expect([400, 403, 404]).toContain(res.status)
      expect(res.text ?? '').not.toMatch(/"name":\s*"markiesharkie-server"|JWT_ACCESS_SECRET/)
    }
  })
})
