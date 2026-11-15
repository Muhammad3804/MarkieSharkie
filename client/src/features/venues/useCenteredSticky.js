import { useEffect, useRef } from 'react'

const FALLBACK_HEADER = 116 // sticky site header height, read from the page when possible
const GAP = 16
const DESKTOP = '(min-width: 64rem)' // Tailwind lg, where the panel is sticky

// Keeps a `lg:sticky` panel pinned while the page scrolls, by setting its `top`:
// - fits below the header: vertically centred in that space;
// - taller than that space: pinned just under the header (the panel is sized to fit 720px-tall screens, and it
//   never gets its own scrollbar).
// It releases at the end of its column (just above the footer). Below lg it's normal flow, so styles are cleared.
export function useCenteredSticky() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const desktop = window.matchMedia(DESKTOP)
    function update() {
      if (!desktop.matches) {
        el.style.top = ''
        return
      }
      const header = document.querySelector('header')?.offsetHeight || FALLBACK_HEADER
      const space = window.innerHeight - header
      const height = el.offsetHeight
      const top = height + GAP * 2 <= space ? header + (space - height) / 2 : header + GAP
      el.style.top = `${Math.round(top)}px`
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    desktop.addEventListener('change', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      desktop.removeEventListener('change', update)
    }
  }, [])

  return ref
}
