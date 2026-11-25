import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { pool } from './db/pool.js'
import { logger as defaultLogger, serializeError } from './lib/logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './middleware/notFound.js'
import { AUTH_RATE_LIMITS } from './middleware/rateLimit.js'
import { authRouter } from './modules/auth/routes.js'
import { usersRouter } from './modules/users/routes.js'
import { venuesRouter } from './modules/venues/routes.js'
import { ownerRouter } from './modules/owner/routes.js'
import { bookingsRouter } from './modules/bookings/routes.js'
import { invitationsRouter } from './modules/invitations/routes.js'
import { adminReviewsRouter, reviewReportsRouter } from './modules/reviews/routes.js'
import { adminRouter } from './modules/admin/routes.js'
import { settingsRouter } from './modules/settings/routes.js'
import { quarantineFileRouter } from './modules/venues/quarantineFiles.js'
import { adminDisputesRouter, disputesRouter } from './modules/disputes/routes.js'
import { getStorage } from './integrations/storage.js'

// GET /api/health -> { status: 'ok', db: 'up' } after a real SELECT 1; 503 { status: 'error', db: 'down' } otherwise.
function healthRouter() {
  const router = Router()
  router.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1')
      res.json({ status: 'ok', db: 'up' })
    } catch (err) {
      req.log.error({ err }, 'health check: database unreachable')
      res.status(503).json({ status: 'error', db: 'down' })
    }
  })
  return router
}

// Every mounted route as { method, path }; tests/openapi.test.js checks each one is in server/openapi.yaml (NFR-6).
function listRoutes(mounts) {
  const routes = []
  for (const [prefix, router] of mounts) {
    for (const layer of router.stack) {
      if (!layer.route) continue
      for (const method of Object.keys(layer.route.methods)) {
        // A router mounted at a prefix answers its '/' route at the prefix itself (GET /api/admin/reviews).
        const path = layer.route.path === '/' ? prefix : `${prefix}${layer.route.path}`
        routes.push({ method: method.toUpperCase(), path })
      }
    }
  }
  return routes
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/

// The Express app without listen(), so tests can drive it with Supertest (docs/architecture.md).
// Options exist for tests: a logger writing to a buffer, and rate limits that don't trip during a test file.
export function createApp({ logger = defaultLogger, rateLimits: overrides = AUTH_RATE_LIMITS } = {}) {
  const rateLimits = { ...AUTH_RATE_LIMITS, ...overrides }
  const app = express()

  app.set('trust proxy', env.trustProxy) // TRUST_PROXY; needed for correct client IPs behind a proxy (rate limits)
  app.disable('x-powered-by')

  // Request log: method, path (no query string), status, time. No headers, cookies or bodies (no tokens/passwords).
  app.use(
    pinoHttp({
      logger,
      wrapSerializers: false,
      genReqId: (req) => {
        const incoming = req.headers['x-request-id']
        return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID()
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, path: (req.originalUrl ?? req.url).split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
        err: serializeError,
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
    }),
  )

  // docs/api-and-security.md "Hardening checklist"
  app.use(helmet())
  app.use(cors({ origin: env.clientOrigin, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  // Uploaded and seed files (photos, floor plans, walkthroughs). Random names, no directory listing, no dotfiles,
  // nosniff (helmet) so a file is never run as something else. CORP cross-origin so the PWA on another origin can
  // show the images; files are served as downloads unless they are images.
  // Dispute evidence (REQ-48) is private: only GET /api/disputes/:id/files/:fileId serves it, to the parties and admins.
  app.use('/uploads/disputes', notFound)
  // AI-rejected photos (#42) are private too: only signed links from GET /api/files/quarantine serve them.
  app.use('/uploads/quarantine', notFound)
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin')
      next()
    },
    express.static(getStorage().root, {
      index: false,
      dotfiles: 'deny',
      fallthrough: true,
      maxAge: '7d',
      immutable: true,
      setHeaders: (res, file) => {
        // REQ-11 walkthroughs: the browser's 3D viewer fetches these; the right type instead of octet-stream.
        if (/\.glb$/i.test(file)) res.set('Content-Type', 'model/gltf-binary')
        if (!/\.(jpe?g|png|webp)$/i.test(file)) res.set('Content-Disposition', 'attachment')
      },
    }),
  )

  const mounts = [
    ['/api', healthRouter()],
    ['/api/auth', authRouter({ rateLimits })],
    ['/api', usersRouter()],
    ['/api', venuesRouter({ rateLimits })],
    ['/api', bookingsRouter({ rateLimits })],
    ['/api', invitationsRouter({ rateLimits })],
    ['/api/owner', ownerRouter({ rateLimits })],
    ['/api', reviewReportsRouter({ rateLimits })],
    ['/api', disputesRouter({ rateLimits })],
    ['/api/admin', adminDisputesRouter({ rateLimits })],
    ['/api/admin', settingsRouter({ rateLimits })],
    ['/api', quarantineFileRouter()],
    ['/api/admin/reviews', adminReviewsRouter({ rateLimits })],
    ['/api/admin', adminRouter({ rateLimits })],
  ]
  for (const [prefix, router] of mounts) app.use(prefix, router)
  app.locals.routes = listRoutes(mounts)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
