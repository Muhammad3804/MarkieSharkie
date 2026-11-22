import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

// Email adapter (docs/architecture.md "External services"): SMTP through nodemailer, with timeouts. Without SMTP:
//   - test:        messages go to `testOutbox` (never sent, never logged), so tests can read the code
//   - development: the reset code is logged to the server console, clearly marked as not emailed
//   - production:  sending fails (the caller logs it without the code); a code is never logged in production
// Tests always use the outbox, even if the root .env has SMTP settings.

export const testOutbox = []

let transport = null
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465, // 465 = TLS from the start; 587 / 25 upgrade with STARTTLS
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  return transport
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// The password reset email: subject, the code, the expiry and an "ignore this" line. Plain text plus simple HTML.
export function passwordResetEmail({ name, code, minutes }) {
  const subject = 'Your MarkieSharkie password reset code'
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,'
  const text = [
    greeting,
    '',
    'Use this code to reset your MarkieSharkie password:',
    '',
    `    ${code}`,
    '',
    `It expires in ${minutes} minutes and works once.`,
    '',
    "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    '',
    'MarkieSharkie',
  ].join('\n')
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f3f1;font-family:Arial,Helvetica,sans-serif;color:#2b2326">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 8px;font-size:20px;font-weight:bold;color:#7a1631">MarkieSharkie</p>
      <p style="margin:0 0 16px;font-size:15px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;font-size:15px">Use this code to reset your password:</p>
      <p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#2b2326">${escapeHtml(code)}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b5f63">It expires in ${minutes} minutes and works once.</p>
      <p style="margin:0;font-size:13px;color:#6b5f63">If you didn't ask to reset your password, you can ignore this email. Your password stays the same.</p>
    </td></tr>
  </table>
</body></html>`
  return { subject, text, html }
}

// Sends the reset code. Throws when the email could not be sent (the caller decides what the user sees).
export async function sendPasswordResetCode({ to, name, code, minutes }) {
  const message = passwordResetEmail({ name, code, minutes })
  if (env.isTest) {
    testOutbox.push({ to, code, ...message })
    return { delivered: false }
  }
  if (!env.mail.configured) {
    if (env.nodeEnv === 'development') {
      logger.warn(
        `[mail] SMTP is not configured (development only): NOT emailed. Password reset code for ${to}: ${code} (expires in ${minutes} min)`,
      )
      return { delivered: false }
    }
    throw new Error('SMTP is not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM)')
  }
  await getTransport().sendMail({ from: env.mail.from, to, ...message })
  return { delivered: true }
}
