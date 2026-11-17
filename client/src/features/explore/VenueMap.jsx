import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatPKR } from '../../lib/format.js'

// Leaflet + OpenStreetMap tiles: no API key, nothing secret in the client (NFR-4). Lazy-loaded with the map toggle.
// One price pill per venue on the current results page. activeId (a hovered or focused card) highlights its pill;
// clicking a pill opens a small popup linking to the venue.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const PAKISTAN_CENTER = [31.5204, 74.3587]

// The pill's text is set with a text node after the marker is added (see below), not through the html string.
// Styles are in index.css (.venue-pin); Leaflet positions the outer element, the label centres itself on it.
const pillIcon = () => L.divIcon({ className: 'venue-pin', html: '<span class="venue-pin__label"></span>', iconSize: [0, 0] })

// Popup built with DOM nodes and textContent, so venue text is never parsed as HTML.
function popupContent(venue) {
  const link = document.createElement('a')
  link.href = `/venues/${venue.id}`
  link.className = 'venue-popup'
  const img = Object.assign(document.createElement('img'), { src: venue.image, alt: '', width: 240, height: 150, loading: 'lazy' })
  const name = Object.assign(document.createElement('strong'), { textContent: venue.name })
  const meta = Object.assign(document.createElement('span'), { textContent: `${venue.reviewCount ? `★ ${venue.rating.toFixed(2)}` : 'New'} · ${venue.city}` })
  const price = Object.assign(document.createElement('span'), { textContent: `${formatPKR(venue.priceFrom)} per guest` })
  link.append(img, name, meta, price)
  return link
}

export default function VenueMap({ venues, activeId, onNavigate }) {
  const container = useRef(null)
  const map = useRef(null)
  const markers = useRef(new Map())
  const fittedIds = useRef('')
  const navigateRef = useRef(onNavigate)
  useEffect(() => {
    navigateRef.current = onNavigate
  })

  useEffect(() => {
    const instance = L.map(container.current, { scrollWheelZoom: false, zoomControl: true }).setView(PAKISTAN_CENTER, 11)
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(instance)
    // Scroll-wheel zoom only after the map is clicked, so scrolling the page past it doesn't zoom it.
    instance.on('click', () => instance.scrollWheelZoom.enable())
    instance.on('mouseout', () => instance.scrollWheelZoom.disable())
    map.current = instance
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
    }
  }, [])

  // Rebuild the pins when the results change and fit the view to them.
  useEffect(() => {
    const instance = map.current
    const byId = markers.current
    for (const marker of byId.values()) marker.remove()
    byId.clear()

    for (const venue of venues) {
      const marker = L.marker([venue.lat, venue.lng], { icon: pillIcon(), title: venue.name, alt: venue.name, riseOnHover: true })
        .bindPopup(() => popupContent(venue), { closeButton: false, offset: [0, -8], className: 'venue-popup-shell' })
        .addTo(instance)
      marker.getElement()?.querySelector('.venue-pin__label')?.replaceChildren(document.createTextNode(formatPKR(venue.priceFrom)))
      marker.on('popupopen', (event) => {
        // Client-side navigation for the popup link (keeps it a real link for middle-click / new tab).
        event.popup.getElement()?.querySelector('a')?.addEventListener('click', (click) => {
          if (click.metaKey || click.ctrlKey || click.shiftKey || click.button !== 0) return
          click.preventDefault()
          navigateRef.current(`/venues/${venue.id}`)
        })
      })
      byId.set(venue.id, marker)
    }

    // Refit only when the set of venues changes, so a re-sort doesn't undo the user's pan and zoom.
    const ids = venues.map((v) => v.id).sort().join(',')
    if (venues.length > 0 && ids !== fittedIds.current) {
      fittedIds.current = ids
      instance.invalidateSize()
      instance.fitBounds(L.latLngBounds(venues.map((v) => [v.lat, v.lng])), { padding: [48, 48], maxZoom: 14 })
    }
  }, [venues])

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const active = id === activeId
      marker.getElement()?.classList.toggle('is-active', active)
      marker.setZIndexOffset(active ? 1000 : 0)
    }
  }, [activeId, venues])

  return <div ref={container} role="region" aria-label="Map of venues on this page" className="size-full bg-map" />
}
