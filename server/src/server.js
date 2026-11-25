import http from 'node:http'
import { env } from './config/env.js' // validates env first; exits with a clear message if something is wrong
import { createApp } from './app.js'
import { startBookingJobs } from './modules/bookings/jobs.js'
import { startVenueJobs } from './modules/venues/jobs.js'
import { pool } from './db/pool.js'
import { logger } from './lib/logger.js'

const app = createApp()
const server = http.createServer(app)
// Socket.io (live availability, docs/architecture.md "Real-time") and node-cron jobs attach here in Phase 4.

server.listen(env.port, async () => {
  logger.info({ port: env.port, nodeEnv: env.nodeEnv }, `MarkieSharkie API listening on http://localhost:${env.port}`)
  try {
    await pool.query('SELECT 1')
  } catch (err) {
    logger.warn({ err }, 'database is not reachable yet; is `docker compose up -d --wait db` running?')
  }
  startBookingJobs() // REQ-18 hold release + expiring stale requests
  startVenueJobs() // #42 retry failed AI checks and undelivered owner emails
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down')
  setTimeout(() => process.exit(1), 10_000).unref()
  server.close(async () => {
    await pool.end().catch(() => {})
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
