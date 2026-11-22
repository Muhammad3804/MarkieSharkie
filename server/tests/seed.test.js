import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { one, pool, resetDb } from './helpers/db.js'
import { withTransaction } from '../src/db/withTransaction.js'
import { hashPassword } from '../src/modules/auth/service.js'
import { normalizePkMobile } from '../src/lib/validators.js'
import { countRows, seedDatabase, seedId } from '../../db/seeds/seed.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const ENV = {
  SEED_ADMIN_NAME: 'Seed Test Admin',
  SEED_ADMIN_EMAIL: 'seed.test.admin@example.pk',
  SEED_ADMIN_PASSWORD: 'SeedAdmin2026',
  SEED_ADMIN_PHONE: '0300-0000777',
  SEED_DEMO_PASSWORD: 'SeedDemo2026',
}
const helpers = { hashPassword, normalizePhone: normalizePkMobile }
const NOW = new Date('2026-11-22T06:00:00Z')

let uploadsDir
let first
let second

// One seeded database for every test in this file (seeding takes a few seconds).
beforeAll(async () => {
  await resetDb()
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markie-seed-test-'))
  first = await withTransaction((db) => seedDatabase(db, { env: ENV, helpers, uploadsDir, now: NOW }))
  second = await withTransaction((db) => seedDatabase(db, { env: ENV, helpers, uploadsDir, now: NOW }))
}, 120_000)

afterAll(async () => {
  fs.rmSync(uploadsDir, { recursive: true, force: true })
  await resetDb()
})

describe('npm run seed (db/seeds/seed.js)', () => {
  it('is idempotent: a second run changes no row count and creates no account', async () => {
    expect(first.created).toBe(4) // admin + 3 demo accounts
    expect(second.created).toBe(0)
    expect(second.counts).toEqual(first.counts)
    expect(await countRows(pool)).toEqual(first.counts)
  })

  it('creates 20 approved venues plus 3 pending, 1 rejected and 1 suspended', async () => {
    const { rows } = await pool.query(
      'SELECT approval_status::text AS s, count(*)::int AS n FROM venues GROUP BY 1 ORDER BY 1',
    )
    expect(Object.fromEntries(rows.map((r) => [r.s, r.n]))).toEqual({
      approved: 20,
      pending: 3,
      rejected: 1,
      suspended: 1,
    })
    expect(await one("SELECT rejection_reason FROM venues WHERE approval_status = 'rejected'")).toMatchObject({
      rejection_reason: expect.any(String),
    })
    expect(await one("SELECT suspension_reason FROM venues WHERE approval_status = 'suspended'")).toMatchObject({
      suspension_reason: expect.any(String),
    })
  })

  it('gives every venue halls, a cover photo, menus with dishes, a location and slot templates', async () => {
    const bad = await one(
      `SELECT count(*)::int AS n FROM venues v
        WHERE location IS NULL
           OR NOT EXISTS (SELECT 1 FROM halls h WHERE h.venue_id = v.venue_id)
           OR NOT EXISTS (SELECT 1 FROM venue_images i WHERE i.venue_id = v.venue_id AND i.is_cover)
           OR NOT EXISTS (SELECT 1 FROM menu_packages m JOIN menu_items mi USING (menu_id) WHERE m.venue_id = v.venue_id)
           OR (SELECT count(*) FROM venue_slot_templates t WHERE t.venue_id = v.venue_id) <> 2`,
    )
    expect(bad.n).toBe(0)
  })

  it('publishes photos only for live venues and copies them into uploads/seed', async () => {
    const hidden = await one(
      `SELECT count(*)::int AS n FROM venue_images i JOIN venues v USING (venue_id)
        WHERE i.is_published AND v.approval_status NOT IN ('approved', 'suspended')`,
    )
    expect(hidden.n).toBe(0)
    const { image_url: url } = await one('SELECT image_url FROM venue_images LIMIT 1')
    expect(url).toMatch(/^\/uploads\/seed\/[a-z0-9-]+\.webp$/)
    expect(fs.existsSync(path.join(uploadsDir, url.replace('/uploads/', '')))).toBe(true)
  })

  it('creates 60 days of Lunch and Dinner per hall for live venues, a few already booked, none for others', async () => {
    const perHall = await one(
      `SELECT min(n)::int AS min, max(n)::int AS max FROM (
         SELECT h.hall_id, count(t.slot_id) AS n FROM halls h JOIN venues v USING (venue_id)
           LEFT JOIN time_slots t ON t.hall_id = h.hall_id AND t.date >= '2026-11-22'
          WHERE v.approval_status IN ('approved', 'suspended') GROUP BY h.hall_id) x`,
    )
    expect(perHall).toEqual({ min: 120, max: 120 })
    const notLive = await one(
      `SELECT count(*)::int AS n FROM time_slots t JOIN venues v USING (venue_id)
        WHERE v.approval_status NOT IN ('approved', 'suspended')`,
    )
    expect(notLive.n).toBe(0)
    const booked = await one(
      `SELECT count(*) FILTER (WHERE status = 'booked')::float / count(*) AS share FROM time_slots WHERE date >= '2026-11-22'`,
    )
    expect(booked.share).toBeGreaterThan(0.02)
    expect(booked.share).toBeLessThan(0.4)
    const orphan = await one(
      `SELECT count(*)::int AS n FROM time_slots t WHERE t.status = 'booked'
          AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = t.slot_id AND b.status <> 'cancelled')`,
    )
    expect(orphan.n).toBe(0)
  })

  it('every review belongs to a completed booking by its reviewer, and avg_rating matches the reviews', async () => {
    const bad = await one(
      `SELECT count(*)::int AS n FROM reviews r JOIN bookings b USING (booking_id)
        WHERE b.status <> 'completed' OR b.customer_id <> r.customer_id OR b.venue_id <> r.venue_id`,
    )
    expect(bad.n).toBe(0)
    const off = await one(
      `SELECT count(*)::int AS n FROM venues v
        WHERE abs(v.avg_rating - coalesce((SELECT avg(rating) FROM reviews r WHERE r.venue_id = v.venue_id), 0)) > 0.01`,
    )
    expect(off.n).toBe(0)
  })

  it('hashes every password with argon2id and uses fixed ids', async () => {
    const plain = await one(`SELECT count(*)::int AS n FROM users WHERE password_hash NOT LIKE '$argon2id$%'`)
    expect(plain.n).toBe(0)
    const admin = await one('SELECT user_id, role FROM users WHERE email = $1', [ENV.SEED_ADMIN_EMAIL])
    expect(admin).toEqual({ user_id: seedId(`user:${ENV.SEED_ADMIN_EMAIL}`), role: 'admin' })
    expect(await one("SELECT venue_id FROM venues WHERE name = 'Qasar-e-Noor'")).toEqual({
      venue_id: seedId('venue:qasar-e-noor'),
    })
  })

  it('skips the admin and demo accounts with a note when their env values are missing', async () => {
    const result = await withTransaction(async (db) => {
      const out = await seedDatabase(db, { env: {}, helpers, uploadsDir, now: NOW })
      throw Object.assign(new Error('rollback'), { out }) // look, but don't keep
    }).catch((err) => err.out)
    expect(result.notes.join(' ')).toMatch(/admin skipped.*SEED_ADMIN/)
    expect(result.notes.join(' ')).toMatch(/SEED_DEMO_PASSWORD/)
    expect(result.created).toBe(0)
  })
})

describe('server/scripts/seed.js guard', () => {
  it('refuses a database that is not local unless --allow-remote is passed', () => {
    const run = spawnSync(process.execPath, [path.resolve(here, '../scripts/seed.js')], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://someone:secret@db.example.com:5432/prod',
      },
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/refusing to seed db\.example\.com:5432\/prod: it is not a local database/)
    expect(run.stderr + run.stdout).not.toMatch(/secret/)
  })
})
