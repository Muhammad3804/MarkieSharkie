// npm run db:check — connects with DATABASE_URL and proves the extensions the schema needs actually work.
import pg from 'pg'
import { loadDotenv } from '../src/config/dotenv.js'
import { describeDb } from './migrate.js'

loadDotenv()
const url = process.env.DATABASE_URL
if (!url) {
  console.error('[db:check] DATABASE_URL is not set (see .env.example)')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 })
try {
  await client.connect()
  const { rows } = await client.query(
    `SELECT current_user                                             AS current_user,
            current_database()                                       AS current_database,
            (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS pgvector_version,
            postgis_lib_version()                                    AS postgis_lib_version,
            '[1,2,3]'::vector <=> '[1,2,4]'::vector                  AS cosine_distance`,
  )
  console.log(`[db:check] connected to ${describeDb(url)}`)
  for (const [key, value] of Object.entries(rows[0])) console.log(`  ${key.padEnd(20)} ${value}`)
} catch (err) {
  console.error(`[db:check] failed: ${err.message}`)
  console.error('[db:check] Is the database running? Try: docker compose up -d --wait db')
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
