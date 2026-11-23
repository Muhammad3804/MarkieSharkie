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

// ---------------------------------------------------------------- invitations (EUC-25, srs-alignment #39)

// The guest's invitation email: who invites them, when, where, and their personal link. The link is a secret (it
// lets the guest reply), so it is never logged.
export function invitationEmail({ guestName, title, hostNames, eventDay, venueName, link, message }) {
  const subject = `You’re invited: ${title}`
  const greeting = guestName ? `Dear ${guestName},` : 'Hello,'
  const text = [
    greeting,
    '',
    `${hostNames || 'Your hosts'} invite you to ${title}.`,
    `${eventDay} at ${venueName}.`,
    ...(message ? ['', message] : []),
    '',
    'See the details and reply here (this link is just for you):',
    link,
    '',
    'MarkieSharkie',
  ].join('\n')
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f3f1;font-family:Arial,Helvetica,sans-serif;color:#2b2326">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 8px;font-size:20px;font-weight:bold;color:#7a1631">${escapeHtml(title)}</p>
      <p style="margin:0 0 16px;font-size:15px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 8px;font-size:15px">${escapeHtml(hostNames || 'Your hosts')} invite you.</p>
      <p style="margin:0 0 16px;font-size:15px;font-weight:bold">${escapeHtml(eventDay)} at ${escapeHtml(venueName)}</p>
      ${message ? `<p style="margin:0 0 16px;font-size:15px;white-space:pre-line">${escapeHtml(message)}</p>` : ''}
      <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#7a1631;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">See the invitation and reply</a></p>
      <p style="margin:0;font-size:13px;color:#6b5f63">This link is just for you. Please don’t share it.</p>
    </td></tr>
  </table>
</body></html>`
  return { subject, text, html }
}

let invitationSender = null
// Tests can swap the sender (e.g. to make delivery fail); null restores the default.
export function setInvitationSender(fn) {
  invitationSender = fn
}

// Sends one invitation. Throws when it could not be sent; the caller marks the guest "not delivered".
export async function sendInvitationEmail({ to, ...fields }) {
  const message = invitationEmail(fields)
  if (invitationSender) return invitationSender({ to, ...message, link: fields.link })
  if (env.isTest) {
    testOutbox.push({ to, kind: 'invitation', link: fields.link, ...message })
    return { delivered: false }
  }
  if (!env.mail.configured) throw new Error('Email isn’t set up on this server. Copy the link and share it yourself.')
  await getTransport().sendMail({ from: env.mail.from, to, ...message })
  return { delivered: true }
}

// ---------------------------------------------------------------- bookings (EUC-14: the customer's receipt)

// "Your booking request was sent": what was booked, the price snapshot and what happens next.
export function bookingRequestEmail({
  name,
  reference,
  eventName,
  venueName,
  hallName,
  eventDay,
  timeRange,
  guests,
  total,
  advance,
  link,
}) {
  const subject = `Booking request sent: ${eventName || venueName} (${reference})`
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,'
  const rows = [
    ['Reference', reference],
    ['Venue', `${venueName}${hallName ? `, ${hallName}` : ''}`],
    ['When', `${eventDay}, ${timeRange}`],
    ['Guests', String(guests)],
    ['Total', total],
    ['Advance', advance],
  ]
  const text = [
    greeting,
    '',
    `Your booking request${eventName ? ` for ${eventName}` : ''} has been sent to ${venueName}.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'The venue reviews it, usually within a day. Your slot stays reserved meanwhile. You can follow it in My bookings:',
    link,
    '',
    'MarkieSharkie never takes payments: pay the advance to the venue directly once they confirm.',
    '',
    'MarkieSharkie',
  ].join('\n')
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f3f1;font-family:Arial,Helvetica,sans-serif;color:#2b2326">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 8px;font-size:20px;font-weight:bold;color:#7a1631">Booking request sent</p>
      <p style="margin:0 0 16px;font-size:15px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;font-size:15px">Your request${eventName ? ` for <strong>${escapeHtml(eventName)}</strong>` : ''} has been sent to ${escapeHtml(venueName)}.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 16px;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:4px 0;color:#6b5f63;width:90px">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(v)}</td></tr>`).join('')}
      </table>
      <p style="margin:0 0 16px;font-size:14px">The venue reviews it, usually within a day. Your slot stays reserved meanwhile.</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#7a1631;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">See my bookings</a></p>
      <p style="margin:0;font-size:13px;color:#6b5f63">MarkieSharkie never takes payments. Pay the advance to the venue directly once they confirm.</p>
    </td></tr>
  </table>
</body></html>`
  return { subject, text, html }
}

let bookingSender = null
// Tests can swap the sender (e.g. to make it fail); null restores the default.
export function setBookingEmailSender(fn) {
  bookingSender = fn
}

// Throws when it could not be sent; the booking service logs it and carries on (the booking is already saved).
export async function sendBookingRequestEmail({ to, ...fields }) {
  const message = bookingRequestEmail(fields)
  if (bookingSender) return bookingSender({ to, ...message })
  if (env.isTest) {
    testOutbox.push({ to, kind: 'booking_request', reference: fields.reference, ...message })
    return { delivered: false }
  }
  if (!env.mail.configured) {
    if (env.nodeEnv === 'development') {
      logger.info(
        `[mail] SMTP is not configured (development only): booking request email ${fields.reference} not sent`,
      )
      return { delivered: false }
    }
    throw new Error('SMTP is not configured')
  }
  await getTransport().sendMail({ from: env.mail.from, to, ...message })
  return { delivered: true }
}
