import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/withTransaction.js'
import { env } from '../../config/env.js'
import { sendVenueEmail } from '../../integrations/mailer.js'
import { logger } from '../../lib/logger.js'

// REQ-7 "owner notified" (srs-alignment #42): the onboarded and AI-rejected emails to the venue owner.
//   - queueVenueEmail runs INSIDE the decision's transaction: one row per venue, kind and review round
//     (venue_emails_once), so a retry or a double click can never queue a second email.
//   - deliverVenueEmail runs AFTER the commit. It locks the row (SKIP LOCKED) while sending, so two deliveries of the
//     same email can't overlap; a sent email is never sent again. A failure is recorded (no secrets: only an error
//     code) and never undoes the decision; the retry job and the admin's Resend try again.
export const MAX_EMAIL_ATTEMPTS = 5

// -> email_id, or null when this round's email of that kind already exists.
export async function queueVenueEmail(client, { venueId, kind }) {
  const { rows } = await client.query(
    `INSERT INTO venue_emails (venue_id, kind, submission, recipient)
     SELECT v.venue_id, $2, coalesce(v.submitted_at, v.created_at), u.email
       FROM venues v JOIN users u ON u.user_id = v.owner_id
      WHERE v.venue_id = $1
     ON CONFLICT (venue_id, kind, submission) DO NOTHING
     RETURNING email_id`,
    [venueId, kind],
  )
  return rows[0]?.email_id ?? null
}

const errorCode = (err) => String(err?.code ?? err?.responseCode ?? 'SEND_FAILED').slice(0, 60)

// -> 'sent' | 'failed' | 'skipped' (already sent, or being sent by someone else right now).
export async function deliverVenueEmail(emailId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT e.email_id, e.kind, e.recipient, v.name AS venue_name, u.name AS owner_name
         FROM venue_emails e JOIN venues v ON v.venue_id = e.venue_id JOIN users u ON u.user_id = v.owner_id
        WHERE e.email_id = $1 AND e.status <> 'sent'
        FOR UPDATE OF e SKIP LOCKED`,
      [emailId],
    )
    const email = rows[0]
    if (!email) return 'skipped'
    try {
      await sendVenueEmail({
        to: email.recipient,
        kind: email.kind,
        name: email.owner_name,
        venueName: email.venue_name,
        link: `${env.clientOrigin}/owner/listings`,
      })
      await client.query(
        `UPDATE venue_emails SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL
          WHERE email_id = $1`,
        [emailId],
      )
      return 'sent'
    } catch (err) {
      // Only an error code is kept and logged, never the message body, the address or SMTP details.
      logger.warn({ emailId, code: errorCode(err) }, '[venue email] not sent; will retry')
      await client.query(
        `UPDATE venue_emails SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE email_id = $1`,
        [emailId, errorCode(err)],
      )
      return 'failed'
    }
  })
}

// Best effort after a commit: never throws into the caller (the decision is already saved).
export async function deliverQuietly(emailId) {
  if (!emailId) return null
  try {
    return await deliverVenueEmail(emailId)
  } catch (err) {
    logger.warn({ emailId, err: { message: err.message } }, '[venue email] delivery crashed; the retry job will try')
    return 'failed'
  }
}

// The retry job: unsent emails, with a growing pause (2 min x attempts), up to MAX_EMAIL_ATTEMPTS.
export async function retryVenueEmails({ backoffMinutes = 2 } = {}) {
  const { rows } = await pool.query(
    `SELECT email_id FROM venue_emails
      WHERE status <> 'sent' AND attempts < $1
        AND updated_at <= now() - make_interval(mins => $2 * attempts)
      ORDER BY created_at LIMIT 20`,
    [MAX_EMAIL_ATTEMPTS, backoffMinutes],
  )
  for (const row of rows) await deliverQuietly(row.email_id)
  return rows.length
}

export async function venueEmailsFor(db, venueId) {
  const { rows } = await db.query(
    `SELECT email_id, kind, status, attempts, last_error, sent_at, created_at, updated_at
       FROM venue_emails WHERE venue_id = $1 ORDER BY created_at DESC`,
    [venueId],
  )
  return rows.map((r) => ({
    id: r.email_id,
    kind: r.kind,
    status: r.status,
    attempts: r.attempts,
    error: r.last_error,
    sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  }))
}
