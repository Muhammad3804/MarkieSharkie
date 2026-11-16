import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Draggable venue pin on Leaflet + OpenStreetMap (no API key, NFR-4). Three ways to move it: drag, click the map,
// or focus the pin and use the arrow keys (WCAG 2.5.7 needs a non-drag alternative).
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const HOME_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'

const pinIcon = L.divIcon({ className: 'host-pin', html: `<span class="host-pin__dot">${HOME_SVG}</span>`, iconSize: [52, 60], iconAnchor: [26, 60] })

export default function PinMap({ lat, lng, onMove }) {
  const container = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const onMoveRef = useRef(onMove)
  const start = useRef([lat, lng]) // the map is created once at the first position; later moves use the effect below
  useEffect(() => {
    onMoveRef.current = onMove
  })

  useEffect(() => {
    const instance = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView(start.current, 16)
    L.control.zoom({ position: 'bottomright' }).addTo(instance)
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(instance)
    const pin = L.marker(start.current, { icon: pinIcon, draggable: true, keyboard: true, autoPan: true }).addTo(instance)
    const element = pin.getElement()
    element.setAttribute('aria-label', 'Venue pin. Use the arrow keys to move it.')
    element.setAttribute('role', 'application')
    element.setAttribute('aria-roledescription', 'draggable map pin')

    pin.on('dragend', () => {
      const { lat: newLat, lng: newLng } = pin.getLatLng()
      onMoveRef.current(newLat, newLng)
    })
    instance.on('click', (event) => {
      instance.scrollWheelZoom.enable()
      onMoveRef.current(event.latlng.lat, event.latlng.lng)
    })
    instance.on('mouseout', () => instance.scrollWheelZoom.disable())

    // Arrow keys nudge the pin by ~10 px at the current zoom (Shift: ~50 px).
    element.addEventListener('keydown', (event) => {
      const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
      const move = moves[event.key]
      if (!move) return
      event.preventDefault()
      event.stopPropagation() // don't let Leaflet's map keyboard handler pan the map as well
      const step = event.shiftKey ? 50 : 10
      const point = instance.latLngToContainerPoint(pin.getLatLng()).add([move[0] * step, move[1] * step])
      const next = instance.containerPointToLatLng(point)
      pin.setLatLng(next)
      onMoveRef.current(next.lat, next.lng)
    })

    map.current = instance
    marker.current = pin
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      marker.current = null
    }
  }, [])

  // Pin moved from outside (Use my location, city change): follow it.
  useEffect(() => {
    const pin = marker.current
    if (!pin) return
    const current = pin.getLatLng()
    if (Math.abs(current.lat - lat) < 1e-6 && Math.abs(current.lng - lng) < 1e-6) return
    pin.setLatLng([lat, lng])
    // Only follow when the pin left the view (e.g. Use my location); small nudges keep the map still.
    if (!map.current.getBounds().contains([lat, lng])) map.current.panTo([lat, lng])
  }, [lat, lng])

  return <div ref={container} className="h-[360px] w-full bg-map sm:h-[440px]" />
}
