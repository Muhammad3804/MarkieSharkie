import { pool } from './pool.js'

// Runs fn(client) inside BEGIN/COMMIT on one dedicated client. Any throw rolls back and is rethrown.
// The client is always released; if ROLLBACK itself fails the client is destroyed instead of going back to the pool.
export async function withTransaction(fn, { db = pool } = {}) {
  const client = await db.connect()
  let broken = null
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      broken = rollbackErr
    }
    throw err
  } finally {
    client.release(broken ?? undefined)
  }
}
