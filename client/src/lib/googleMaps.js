// The venue's Google Maps link (REQ-43 / EUC-30, srs-alignment #37): the only Google feature, a plain link-out. Same
// rules as the server (server/src/modules/owner/schemas.js googleMapsUrlSchema): https only, one of Google's Maps
// hosts, at most 500 characters. Also checked before rendering a link, so a bad value can never become an href.
export const GOOGLE_MAPS_HOSTS = ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl', 'g.page']
export const MAPS_LINK_MESSAGE = 'Paste a Google Maps link that starts with https://maps.app.goo.gl/ or https://www.google.com/maps.'

export function isGoogleMapsUrl(text) {
  if (typeof text !== 'string' || !text || text.length > 500) return false
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && !url.username && !url.password && GOOGLE_MAPS_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}
