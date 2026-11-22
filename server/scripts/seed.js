// npm run seed                   -> demo data in the dev database (DATABASE_URL)
// npm run seed -- --allow-remote -> also allowed on a database that is not on this machine (be careful)
// npm run seed -- --reset-passwords -> also set the admin / demo passwords to SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD
//
// Runs db/seeds/seed.js in one transaction: accounts (SEED_ADMIN_*, SEED_DEMO_PASSWORD), 25 venues from the mock
// catalogue (20 approved, 3 pending, 1 rejected, 1 suspended) with halls, photos, menus, add-ons, terms, 60 days of
// Lunch / Dinner slots per hall and past reviews. Safe to run again: nothing is duplicated or overwritten.
// Photos are copied into server/uploads/seed/ (git-ignored) and served at /uploads/seed/. Passwords are never printed.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotenv } from '../src/config/dotenv.js'

loadDotenv()

const { pool } = await import('../src/db/pool.js')
const { withTransaction } = await import('../src/db/withTransaction.js')
const { hashPassword } = await import('../src/modules/auth/service.js')
const { normalizePkMobile } = await import('../src/lib/validators.js')
const { seedDatabase } = await import('../../db/seeds/seed.js')
const { describeDb } = await import('./migrate.js')

export const UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLocalDatabase(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example)')
  const allowRemote = process.argv.includes('--allow-remote')
  if (!isLocalDatabase(url) && !allowRemote) {
    throw new Error(
      `refusing to seed ${describeDb(url)}: it is not a local database. Pass --allow-remote if you mean it.`,
    )
  }
  if (process.env.NODE_ENV === 'production' && !allowRemote)
    throw new Error('refusing to seed with NODE_ENV=production')

  console.log(`[seed] ${describeDb(url)}`)
  const started = Date.now()
  const result = await withTransaction((client) =>
    seedDatabase(client, {
      env: process.env,
      helpers: { hashPassword, normalizePhone: normalizePkMobile },
      uploadsDir: UPLOADS_DIR,
      resetPasswords: process.argv.includes('--reset-passwords'),
    }),
  )
  for (const note of result.notes) console.log(`[seed] note: ${note}`)
  console.log(`[seed] done in ${((Date.now() - started) / 1000).toFixed(1)} s (slots from ${result.today}); rows now:`)
  console.table(result.counts)
}

try {
  await main()
} catch (err) {
  console.error(`[seed] failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await pool.end().catch(() => {})
}
