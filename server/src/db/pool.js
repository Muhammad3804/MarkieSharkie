import pg from 'pg'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

// `date` columns (e.g. time_slots.date) stay 'YYYY-MM-DD' strings. pg's default turns them into a JS Date at local
// midnight, which shifts the day across time zones. numeric (money) already comes back as a string, as JSON needs.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

// One pool for the whole process (Part A). Repositories receive either this pool or a transaction client.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  // An idle client died (e.g. the DB restarted). The pool replaces it; log without connection details.
  logger.error({ err: { message: err.message, code: err.code } }, 'pg pool idle client error')
})
