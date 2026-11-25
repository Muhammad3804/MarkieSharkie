import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { decideByThreshold, detectAiImage, scorePercent } from '../../integrations/imageDetection.js'
import { getStorage, keyFromUrl } from '../../integrations/storage.js'
import { logger } from '../../lib/logger.js'
import { isQuarantineKey } from '../../lib/quarantineUrl.js'
import { currentThreshold } from '../settings/service.js'
import { deliverQuietly, queueVenueEmail } from './venueEmails.js'

// REQ-9 / EUC-05 / SYS-02 with the admin's threshold gate (srs-alignment #42, a deviation the team chose).
//   - Every photo is scored by the existing detector (integrations/imageDetection.js) and compared with the
//     threshold in force at that moment, which is stored on the photo (threshold_applied).
//       score % >= threshold -> rejected_ai: never published, file moved to uploads/quarantine/ (never deleted)
//       score % <  threshold -> accepted
//   - Detector down or slow: NOT rejected. detection_status = 'error', retried by the job and on demand; the venue
//     stays in review (NFR-2, REQ-9 "service down -> image stays pending").
//   - Venue rule: a pending venue with AI-rejected photos and fewer than MIN_VENUE_PHOTOS accepted-or-unchecked
//     photos is rejected with "AI-generated images" and the owner is emailed (once per review round).
//   - Admin approval needs MIN_VENUE_PHOTOS accepted photos and no rejected, flagged or unchecked ones.

export const MIN_VENUE_PHOTOS = 5
export const MAX_DETECTION_ATTEMPTS = 5
export const AI_REJECTION_REASON = 'AI-generated images'

const VERIFICATION_FOR = { accepted: 'genuine', rejected_ai: 'rejected' }

// ---------------------------------------------------------------- files

const quarantined = (key) => `quarantine/${key}`
const released = (key) => key.slice('quarantine/'.length)

// Moves the file so /uploads stops serving it (rejected) or serves it again (accepted after a rescore or an admin
// keep). -> the key it now lives at.
export async function moveForDecision(key, decision) {
  const wantQuarantine = decision !== 'accepted'
  if (wantQuarantine === isQuarantineKey(key)) return key
  const next = wantQuarantine ? quarantined(key) : released(key)
  await getStorage().move(key, next)
  return next
}

// A venue photo's file moved: the wizard upload row follows, so a later resubmission finds it.
export async function recordMove(db, fromKey, toKey) {
  if (fromKey !== toKey)
    await db.query('UPDATE media_uploads SET storage_key = $2 WHERE storage_key = $1', [fromKey, toKey])
}

// -> { ok: true, score } | { ok: false }. Never throws: a detector failure is an 'error', not a rejection.
async function score({ buffer, key, mimeType, logContext }) {
  try {
    const bytes = buffer ?? (await getStorage().read(key))
    const { score: value } = await detectAiImage({ buffer: bytes, mimeType, fileName: key.split('/').pop() })
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('detector returned no usable score')
    return { ok: true, score: value }
  } catch (err) {
    logger.warn({ err: { message: err.message }, ...logContext }, 'image detection unavailable; photo stays pending')
    return { ok: false }
  }
}

// ---------------------------------------------------------------- wizard uploads (before the venue exists)

// The view the owner gets for one photo: the decision and its score (the team chose to show the score), no threshold.
export function checkView(row) {
  const pending = row.detection_status !== 'scored' || !row.decision
  return {
    status: pending ? 'pending' : row.decision,
    aiScore: pending || row.ai_score === null ? null : scorePercent(Number(row.ai_score)),
    canRetry: pending,
  }
}

// Scores one media_uploads photo and stores the result. buffer is passed at upload time (already in memory).
export async function checkUpload(uploadId, { buffer = null } = {}) {
  const { rows } = await pool.query(
    `SELECT upload_id, storage_key, mime_type, kind, detection_status, decision, ai_score
       FROM media_uploads WHERE upload_id = $1`,
    [uploadId],
  )
  const upload = rows[0]
  if (!upload || upload.kind !== 'photo' || upload.detection_status === 'scored') return upload
  const threshold = await currentThreshold()
  const result = await score({ buffer, key: upload.storage_key, mimeType: upload.mime_type, logContext: { uploadId } })
  if (!result.ok) {
    const { rows: updated } = await pool.query(
      `UPDATE media_uploads SET detection_status = 'error', detection_attempts = detection_attempts + 1,
              checked_at = now()
        WHERE upload_id = $1 AND detection_status <> 'scored' RETURNING *`,
      [uploadId],
    )
    return updated[0] ?? upload
  }
  const decision = decideByThreshold(result.score, threshold)
  const key = await moveForDecision(upload.storage_key, decision)
  const { rows: updated } = await pool.query(
    `UPDATE media_uploads
        SET ai_score = $2, detection_status = 'scored', decision = $3, threshold_applied = $4, checked_at = now(),
            detection_attempts = detection_attempts + 1, storage_key = $5,
            quarantined_at = CASE WHEN $3 = 'rejected_ai' THEN now() END
      WHERE upload_id = $1 RETURNING *`,
    [uploadId, result.score, decision, threshold, key],
  )
  return updated[0]
}

// ---------------------------------------------------------------- venue photos

async function checkVenueImage(image, threshold) {
  const key = keyFromUrl(image.image_url)
  if (!key) return 'skipped'
  const result = await score({
    key,
    mimeType: image.mime_type ?? 'image/jpeg',
    logContext: { imageId: image.image_id },
  })
  if (!result.ok) {
    await pool.query(
      `UPDATE venue_images SET detection_status = 'error', detection_attempts = detection_attempts + 1,
              checked_at = now()
        WHERE image_id = $1 AND detection_status <> 'scored'`,
      [image.image_id],
    )
    return 'error'
  }
  const decision = decideByThreshold(result.score, threshold)
  const nextKey = await moveForDecision(key, decision)
  // Only a still-unchecked photo is updated, so an admin decision made meanwhile is never overwritten. An accepted
  // photo of an already approved venue (a live edit) is published right away.
  const { rowCount } = await pool.query(
    `UPDATE venue_images i
        SET ai_score = $2, detection_status = 'scored', decision = $3, threshold_applied = $4, checked_at = now(),
            detection_attempts = detection_attempts + 1, image_url = $5,
            verification_status = $6::verification_status,
            quarantined_at = CASE WHEN $3 = 'rejected_ai' THEN now() END,
            is_published = ($3 = 'accepted' AND EXISTS (
              SELECT 1 FROM venues v WHERE v.venue_id = i.venue_id AND v.approval_status = 'approved'))
      WHERE i.image_id = $1 AND i.detection_status <> 'scored'`,
    [image.image_id, result.score, decision, threshold, getStorage().urlFor(nextKey), VERIFICATION_FOR[decision]],
  )
  if (rowCount) {
    await recordMove(pool, key, nextKey)
    await pool.query(
      `INSERT INTO image_verifications (image_id, ai_score, result) VALUES ($1, $2, $3::verification_status)`,
      [image.image_id, result.score, VERIFICATION_FOR[decision]],
    )
  } else if (nextKey !== key) {
    await getStorage()
      .move(nextKey, key)
      .catch(() => {})
  }
  return decision
}

// Photo counts of a venue by outcome. unchecked = no decision yet (detection pending or failed).
export async function photoCounts(db, venueId) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE decision = 'accepted')::int AS accepted,
            count(*) FILTER (WHERE decision = 'rejected_ai')::int AS rejected_ai,
            count(*) FILTER (WHERE decision = 'flagged_for_review')::int AS flagged,
            count(*) FILTER (WHERE decision = 'rejected_admin')::int AS removed,
            count(*) FILTER (WHERE decision IS NULL)::int AS unchecked
       FROM venue_images WHERE venue_id = $1`,
    [venueId],
  )
  return rows[0]
}

// Why the admin can't approve yet (empty = can). Any rejected, flagged or unchecked photo blocks (team decision).
export function approvalBlockers(c) {
  const out = []
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`
  if (c.unchecked) out.push(`${n(c.unchecked, 'photo is', 'photos are')} still waiting for the AI check.`)
  if (c.rejected_ai) out.push(`${n(c.rejected_ai, 'photo was', 'photos were')} rejected as AI-generated.`)
  if (c.flagged) out.push(`${n(c.flagged, 'photo is', 'photos are')} flagged for review.`)
  if (c.removed) out.push(`${n(c.removed, 'photo was', 'photos were')} removed by an admin.`)
  if (c.accepted < MIN_VENUE_PHOTOS)
    out.push(`Only ${n(c.accepted, 'photo is', 'photos are')} accepted; at least ${MIN_VENUE_PHOTOS} are needed.`)
  return out
}

// The venue rule. Runs when its checks settle and after an admin's photo decision. -> 'rejected' | 'pending' | null
export async function evaluateVenue(venueId) {
  let emailId = null
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT approval_status FROM venues WHERE venue_id = $1 FOR UPDATE', [venueId])
    if (rows[0]?.approval_status !== 'pending') return null
    const c = await photoCounts(client, venueId)
    if (c.rejected_ai > 0 && c.accepted + c.unchecked < MIN_VENUE_PHOTOS) {
      await client.query(
        `UPDATE venues SET approval_status = 'rejected', rejection_reason = $2, reviewed_at = now() WHERE venue_id = $1`,
        [venueId, AI_REJECTION_REASON],
      )
      emailId = await queueVenueEmail(client, { venueId, kind: 'ai_rejected' })
      return 'rejected'
    }
    return 'pending'
  })
  await deliverQuietly(emailId)
  return outcome
}

async function verifyVenue(venueId) {
  const threshold = await currentThreshold()
  const { rows } = await pool.query(
    `SELECT image_id, image_url, mime_type FROM venue_images
      WHERE venue_id = $1 AND detection_status <> 'scored' AND decision IS NULL ORDER BY sort_order`,
    [venueId],
  )
  const results = { accepted: 0, rejected_ai: 0, error: 0, skipped: 0 }
  for (const image of rows) results[await checkVenueImage(image, threshold)] += 1
  await evaluateVenue(venueId)
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
  (await pool.query(`SELECT count(*)::int AS n FROM venue_images WHERE venue_id = $1 AND decision IS NULL`, [venueId]))
    .rows[0].n

// The retry job: venues with photos whose check failed, with a growing pause, up to MAX_DETECTION_ATTEMPTS.
export async function retryPendingDetections() {
  const { rows } = await pool.query(
    `SELECT DISTINCT i.venue_id FROM venue_images i JOIN venues v ON v.venue_id = i.venue_id
      WHERE i.decision IS NULL AND i.detection_status = 'error' AND i.detection_attempts < $1
        AND v.approval_status IN ('pending', 'approved')
        AND i.checked_at < now() - make_interval(mins => 2 * i.detection_attempts)
      LIMIT 10`,
    [MAX_DETECTION_ATTEMPTS],
  )
  for (const row of rows) await queueVerification(row.venue_id)
  return rows.length
}
