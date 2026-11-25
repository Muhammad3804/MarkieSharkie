// Platform settings (srs-alignment #42): one row in platform_settings. Raw pg, $n parameters only.

export async function readSettings(db) {
  const { rows } = await db.query(
    `SELECT s.ai_image_reject_threshold, s.updated_at, u.name AS updated_by_name
       FROM platform_settings s LEFT JOIN users u ON u.user_id = s.updated_by
      WHERE s.id`,
  )
  return rows[0] ?? null
}

export async function lockSettings(db) {
  const { rows } = await db.query('SELECT ai_image_reject_threshold FROM platform_settings WHERE id FOR UPDATE')
  return rows[0] ?? null
}

export async function setThreshold(db, { threshold, adminId }) {
  await db.query(
    `INSERT INTO platform_settings (id, ai_image_reject_threshold, updated_by, updated_at) VALUES (true, $1, $2, now())
     ON CONFLICT (id) DO UPDATE
       SET ai_image_reject_threshold = EXCLUDED.ai_image_reject_threshold, updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [threshold, adminId],
  )
}
