import { bookingReference, bookingStatusView } from '../../lib/booking.js'

// "Add to calendar": a one-event .ics file (RFC 5545) for a booking. Slot times are Pakistan time (UTC+5, no DST),
// written in UTC so every calendar app places them correctly.
// Line breaks (CR, LF or both) become a literal \n, so text can never start a new property.
const escape = (text) => String(text).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r\n?|\n/g, '\\n')
const pad = (n) => String(n).padStart(2, '0')

function utcStamp(date, time) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d, hh - 5, mm))
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}00Z`
}

// One VEVENT calendar. date is a yyyy-mm-dd day key, start / end are "HH:MM" Pakistan time.
export function eventIcs({ uid, date, start, end, summary, location, description }) {
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MarkieSharkie//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escape(uid)}@markiesharkie`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(date, start)}`,
    `DTEND:${utcStamp(date, end)}`,
    `SUMMARY:${escape(summary)}`,
    `LOCATION:${escape(location)}`,
    `DESCRIPTION:${escape(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}

export function bookingIcs(booking) {
  return eventIcs({
    uid: booking.bookingId,
    date: booking.date,
    start: booking.startTime,
    end: booking.endTime,
    summary: `${booking.eventName} at ${booking.venueName}`,
    location: `${booking.hallName}, ${booking.venueName}, ${booking.venueCity}`,
    description: `Booking ${bookingReference(booking.bookingId)} (${bookingStatusView(booking).label}). ${booking.guestCount} guests.`,
  })
}

export function downloadIcs(booking) {
  downloadIcsFile(bookingIcs(booking), `markiesharkie-${bookingReference(booking.bookingId).toLowerCase()}.ics`)
}

export function downloadIcsFile(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
