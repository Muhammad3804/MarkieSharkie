import { Router } from 'express'
import { getStorage } from '../../integrations/storage.js'
import { AppError } from '../../lib/AppError.js'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { verifyQuarantineLink } from '../../lib/quarantineUrl.js'

// GET /api/files/quarantine?key&exp&sig (srs-alignment #42): an AI-rejected photo for its owner or an admin, by the
// short-lived signed link their API responses carry (lib/quarantineUrl.js). No link, a wrong or expired one: 404.
const TYPES = { jpg: 'image/jpeg', png: 'image/png' }

export function quarantineFileRouter() {
  const router = Router()
  router.get(
    '/files/quarantine',
    asyncHandler(async (req, res) => {
      const { key, exp, sig } = req.query
      const type = typeof key === 'string' ? TYPES[key.split('.').pop()] : null
      if (!type || !verifyQuarantineLink({ key, exp, sig }))
        throw new AppError(404, 'NOT_FOUND', 'This link has expired.')
      let buffer
      try {
        buffer = await getStorage().read(key)
      } catch {
        throw new AppError(404, 'NOT_FOUND', 'This photo is no longer available.')
      }
      res.set({
        'Content-Type': type,
        'Cache-Control': 'private, max-age=600',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Disposition': 'inline',
      })
      res.send(buffer)
    }),
  )
  return router
}
