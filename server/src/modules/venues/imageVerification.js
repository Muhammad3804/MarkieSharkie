import { pool } from '../../db/pool.js'
import { classifyScore, detectAiImage } from '../../integrations/imageDetection.js'
import { getStorage, keyFromUrl } from '../../integrations/storage.js'
import { logger } from '../../lib/logger.js'

// REQ-9: every uploaded venue photo goes through AI detection.
//   genuine -> can be published (once the venue is approved)
//   flagged -> never published automatically; the admin decides (REQ-10). Never deleted (Scope 2.4).
//   detector down -> the photo stays 'pending' and the owner can ask to retry (POST /owner/venues/:id/images/verify)
// Runs after the submission is committed and never blocks it (NFR-2). Each check is recorded in image_verifications.

async function checkOne(image) {
  const key = keyFromUrl(image.image_url)
  if (!key) return 'skipped'
  let score
  try {
    const buffer = await getStorage().read(key)
    ;({ score } = await detectAiImage({
      buffer,
      mimeType: image.mime_type ?? 'image/jpeg',
      fileName: key.split('/').pop(),
    }))
  } catch (err) {
    logger.warn(
      { err: { message: err.message }, imageId: image.image_id },
      'image detection unavailable; photo stays pending',
    )
    return 'pending'
  }
  const result = classifyScore(score)
  // Only a still-pending photo is updated, so an admin decision made meanwhile is never overwritten. A genuine
  // photo of an already approved venue is published right away.
  const { rowCount } = await pool.query(
    `UPDATE venue_images i
        SET verification_status = $2::verification_status,
            is_published = ($2 = 'genuine' AND EXISTS (
              SELECT 1 FROM venues v WHERE v.venue_id = i.venue_id AND v.approval_status = 'approved'))
      WHERE i.image_id = $1 AND i.verification_status = 'pending'`,
    [image.image_id, result],
  )
  if (rowCount) {
    await pool.query(
      `INSERT INTO image_verifications (image_id, ai_score, result) VALUES ($1, $2, $3::verification_status)`,
      [image.image_id, score, result],
    )
  }
  return result
}

async function verifyVenue(venueId) {
  const { rows } = await pool.query(
    `SELECT image_id, image_url, mime_type FROM venue_images WHERE venue_id = $1 AND verification_status = 'pending'
      ORDER BY sort_order`,
    [venueId],
  )
  const results = { genuine: 0, flagged: 0, pending: 0, skipped: 0 }
  for (const image of rows) results[await checkOne(image)] += 1
  return results
}

// Background queue (in-process). `settleVerifications` lets tests wait for the running checks.
const running = new Set()
export function queueVerification(venueId) {
  const job = verifyVenue(venueId)
    .catch((err) => {
      logger.error({ err: { message: err.message }, venueId }, 'image verification failed')
      return null
    })
    .finally(() => running.delete(job))
  running.add(job)
  return job
}

export const settleVerifications = () => Promise.all([...running])

export const countPendingImages = async (venueId) =>
  (
    await pool.query(
      `SELECT count(*)::int AS n FROM venue_images WHERE venue_id = $1 AND verification_status = 'pending'`,
      [venueId],
    )
  ).rows[0].n
