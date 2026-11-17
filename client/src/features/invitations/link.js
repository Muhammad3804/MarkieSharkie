import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { INVITE_EVENT_TYPES, INVITE_TEMPLATES, LIMITS } from './options.js'

// The guest link: /invite/:invitationId#c=<card>. There's no server yet, so the card itself rides in the URL hash
// (lz-string compressed) and the link opens on any phone, even one that has never seen our localStorage.
// The hash never reaches a server. When the invitation is in the local mock store, the stored copy wins.
// TODO(server): switch to the short server link (invitations.share_link, GET /i/:token) and drop the hash.

// Short keys keep the URL (and so the QR) small. Order matters only for readability.
const KEYS = {
  invitationId: 'i',
  template: 't',
  title: 'n',
  eventType: 'y',
  hostNames: 'h',
  message: 'm',
  eventDate: 'd',
  startTime: 's',
  endTime: 'e',
  venueName: 'v',
  hallName: 'l',
  venueAddress: 'a',
  lat: 'la',
  lng: 'lo',
  rsvpBy: 'r',
  contactPhone: 'p',
}

export function encodeCard(card) {
  const compact = {}
  for (const [key, short] of Object.entries(KEYS)) if (card[key] !== undefined && card[key] !== null && card[key] !== '') compact[short] = card[key]
  return compressToEncodedURIComponent(JSON.stringify(compact))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
// A real calendar day (2026-13-45 is rejected, not rolled over).
function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
// Control characters (CR/LF included) become spaces, so nothing from the hash can break the .ics file.
// eslint-disable-next-line no-control-regex
const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '')
const coord = (value, limit) => (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null)

// Anyone can edit a hash, so treat it as untrusted: known keys only, typed, length-capped. Links are never taken
// from it (the maps link is rebuilt from numbers), so a tampered hash can't inject a javascript: URL.
export function decodeCard(hash, invitationId) {
  if (!UUID.test(invitationId ?? '')) return null
  const raw = /(?:^#?|&)c=([^&]+)/.exec(hash ?? '')?.[1]
  // A real card is ~500 characters; refuse huge hashes before decompressing (they could freeze the tab).
  if (!raw || raw.length > 4000) return null
  let compact
  try {
    compact = JSON.parse(decompressFromEncodedURIComponent(raw) ?? 'null')
  } catch {
    return null
  }
  if (!compact || typeof compact !== 'object' || compact.i !== invitationId) return null
  const card = {
    invitationId,
    template: INVITE_TEMPLATES.some((t) => t.value === compact.t) ? compact.t : 'classic',
    title: text(compact.n, LIMITS.title),
    eventType: INVITE_EVENT_TYPES.some((t) => t.value === compact.y) ? compact.y : 'other',
    hostNames: text(compact.h, LIMITS.hostNames),
    message: text(compact.m, LIMITS.message),
    eventDate: isDay(compact.d) ? compact.d : '',
    startTime: CLOCK.test(compact.s) ? compact.s : '',
    endTime: CLOCK.test(compact.e) ? compact.e : '',
    venueName: text(compact.v, 120),
    hallName: text(compact.l, 80),
    venueAddress: text(compact.a, 200),
    lat: coord(compact.la, 90),
    lng: coord(compact.lo, 180),
    rsvpBy: isDay(compact.r) ? compact.r : '',
    contactPhone: /^\+923\d{9}$/.test(compact.p) ? compact.p : '',
  }
  return card.title && card.eventDate && card.startTime && card.endTime && card.venueName ? card : null
}

// Full guest URL for the QR, copy and share buttons.
// TODO(lan): this uses window.location.origin, so a QR made on http://localhost won't open on a phone. To test on
// a phone, run `npm run dev -- --host` and open the app through the LAN address Vite prints (http://192.168.x.x:5173).
export function inviteUrl(card) {
  return `${window.location.origin}/invite/${card.invitationId}#c=${encodeCard(card)}`
}

// Directions (REQ-39). Built from coordinates or the address, never from user-supplied URLs.
export function mapsUrl(card) {
  if (card.lat !== null && card.lat !== undefined && card.lng !== null && card.lng !== undefined) return `https://www.google.com/maps/search/?api=1&query=${card.lat},${card.lng}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([card.venueName, card.venueAddress].filter(Boolean).join(', '))}`
}
