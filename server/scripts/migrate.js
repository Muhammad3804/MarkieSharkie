// npm run migrate        -> dev DB  (DATABASE_URL)
// npm run migrate:test   -> test DB (TEST_DATABASE_URL), refused if it is the same database as DATABASE_URL
//
// Forward-only (docs/database.md "Migrations and seeds"): there are no down migrations. Each SQL file in
// server/migrations/ runs once, in numeric order, recorded in the `pgmigrations` table.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runner } from 'node-pg-migrate'
import { loadDotenv } from '../src/config/dotenv.js'
import { sameDatabase } from '../src/config/sameDatabase.js'

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

export function describeDb(url) {
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || 5432}${u.pathname}` // never print the password
  } catch {
    return '(unparseable URL)'
  }
}

export async function migrateUp(databaseUrl, { log = console.log } = {}) {
  return runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    checkOrder: true,
    singleTransaction: true,
    log,
  })
}

async function main() {
  loadDotenv()
  const target = process.argv.includes('--test') ? 'test' : 'dev'
  const { DATABASE_URL, TEST_DATABASE_URL } = process.env
  const url = target === 'test' ? TEST_DATABASE_URL : DATABASE_URL

  if (!url) throw new Error(`${target === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} is not set (see .env.example)`)
  if (target === 'test' && DATABASE_URL && sameDatabase(TEST_DATABASE_URL, DATABASE_URL)) {
    throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL; refusing to migrate')
  }

  console.log(`[migrate] ${target} database ${describeDb(url)}`)
  const ran = await migrateUp(url)
  console.log(ran.length ? `[migrate] applied: ${ran.map((m) => m.name).join(', ')}` : '[migrate] already up to date')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[migrate] failed: ${err.message}`)
    process.exit(1)
  })
}
