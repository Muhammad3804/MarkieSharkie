import { bookingReference, bookingStatusView } from '../../lib/booking.js'

// "Add to calendar": a one-event .ics file (RFC 5545) for a booking. Slot times are Pakistan time (UTC+5, no DST),
// written in UTC so every calendar app places them correctly.
const escape = (text) => String(text).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
const pad = (n) => String(n).padStart(2, '0')

function utcStamp(date, time) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d, hh - 5, mm))
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}00Z`
}

export function bookingIcs(booking) {
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MarkieSharkie//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${booking.bookingId}@markiesharkie`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(booking.date, booking.startTime)}`,
    `DTEND:${utcStamp(booking.date, booking.endTime)}`,
    `SUMMARY:${escape(`${booking.eventName} at ${booking.venueName}`)}`,
    `LOCATION:${escape(`${booking.hallName}, ${booking.venueName}, ${booking.venueCity}`)}`,
    `DESCRIPTION:${escape(`Booking ${bookingReference(booking.bookingId)} (${bookingStatusView(booking).label}). ${booking.guestCount} guests.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}

export function downloadIcs(booking) {
  const url = URL.createObjectURL(new Blob([bookingIcs(booking)], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `markiesharkie-${bookingReference(booking.bookingId).toLowerCase()}.ics`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
