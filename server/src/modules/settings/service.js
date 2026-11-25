import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { env } from '../../config/env.js'
import { insertAudit } from '../admin/repository.js'
import * as repo from './repository.js'

// srs-alignment #42: the AI-likelihood threshold (percent). A photo scoring at or above it is rejected as
// AI-generated. Changing it affects only checks made afterwards; each photo keeps the threshold it was checked with.

// admin_audit_log.target_id is a uuid; the settings row has none, so changes are filed under this fixed id.
export const SETTINGS_TARGET_ID = '00000000-0000-4000-8000-000000000042'
const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null))

// The threshold in force now (the env fallback only if the row is missing).
export async function currentThreshold(db = pool) {
  const row = await repo.readSettings(db)
  return row ? Number(row.ai_image_reject_threshold) : env.imageDetection.fallbackThreshold
}

export async function getAiThreshold() {
  const row = await repo.readSettings(pool)
  return {
    threshold: row ? Number(row.ai_image_reject_threshold) : env.imageDetection.fallbackThreshold,
    updatedAt: iso(row?.updated_at),
    updatedBy: row?.updated_by_name ?? null,
  }
}

export async function updateAiThreshold(adminId, { threshold }) {
  await withTransaction(async (client) => {
    const before = await repo.lockSettings(client)
    const from = before ? Number(before.ai_image_reject_threshold) : env.imageDetection.fallbackThreshold
    await repo.setThreshold(client, { threshold, adminId })
    await insertAudit(client, {
      adminId,
      action: 'settings.ai_threshold',
      targetTable: 'platform_settings',
      targetId: SETTINGS_TARGET_ID,
      details: { from, to: threshold },
    })
  })
  return getAiThreshold()
}
