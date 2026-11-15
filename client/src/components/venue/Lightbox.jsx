import { useEffect, useRef } from 'react'
import closeIcon from '../../assets/icons/close.svg'
import chevronLeftIcon from '../../assets/icons/venue/chevron-left.svg'
import chevronRightIcon from '../../assets/icons/venue/chevron-right.svg'

const SWIPE_DISTANCE = 50

// Full-screen photo viewer for the gallery page. A native modal <dialog> gives us the top layer, Esc to close and
// focus containment (everything behind it is inert); page scroll is locked in index.css while it's open.
// Navigate with the arrows, ←/→ keys, swipe, or the thumbnail strip. Neighbouring photos are preloaded.
// `returnFocusTo` is the element that opened the viewer (captured by the caller, so StrictMode's double mount
// can't record the wrong one); focus goes back to it on close.
export default function Lightbox({ images, index, onIndexChange, onClose, returnFocusTo }) {
  const dialogRef = useRef(null)
  const thumbsRef = useRef(null)
  const swipeStart = useRef(null)
  const swiped = useRef(false)
  const preloaded = useRef([])
  const firstThumbScroll = useRef(true)
  const count = images.length
  const image = images[index]
  // Functional update, so fast key repeat between renders never skips or loses a step.
  const go = (step) => onIndexChange((current) => (current + step + count) % count)

  // Open as a modal and give focus back to whatever opened it when the viewer goes away.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      returnFocusTo?.focus({ preventScroll: true })
    }
  }, [returnFocusTo])

  // Preload the previous and next photos so arrowing feels instant.
  useEffect(() => {
    for (const step of [-1, 1]) {
      const neighbour = images[(index + step + count) % count]
      if (!neighbour) continue
      const img = new Image()
      img.src = neighbour.imageUrl
      preloaded.current = [...preloaded.current.slice(-3), img] // keep a reference until it has decoded
    }
  }, [images, index, count])

  // Keep the current thumbnail in view.
  useEffect(() => {
    const thumb = thumbsRef.current?.querySelector('[aria-current="true"]')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    thumb?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce || firstThumbScroll.current ? 'auto' : 'smooth' })
    firstThumbScroll.current = false
  }, [index])

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(1)
    }
  }

  function handlePointerUp(event) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true // the click that follows a swipe must not close the viewer
      go(dx < 0 ? 1 : -1)
    }
  }

  // Clicks on the dark area around the photo (not the photo or controls) close the viewer.
  const closeOnBackdrop = (event) => {
    if (swiped.current) {
      swiped.current = false
      return
    }
    if (event.target === event.currentTarget) onClose()
  }

  const arrow = 'absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-chip hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:size-12'

  return (
    <dialog
      ref={dialogRef}
      aria-label="Photo viewer"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={handleKeyDown}
      onClick={closeOnBackdrop}
      className="fixed inset-0 m-0 flex h-dvh max-h-none w-full max-w-none flex-col bg-ink-strong/95 p-0 text-white backdrop:bg-transparent"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-8 sm:py-4">
        <p aria-live="polite" className="text-[14px] font-semibold tabular-nums">
          {index + 1} / {count}
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-center text-[13px] text-white/75 sm:block">{image.alt}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo viewer"
          autoFocus
          className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          <img src={closeIcon} alt="" width="24" height="24" />
        </button>
      </div>

      <div
        onClick={closeOnBackdrop}
        onPointerDown={(event) => {
          if (event.target.closest('button')) return
          swiped.current = false
          swipeStart.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId) // a drag that ends outside still counts
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStart.current = null
        }}
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 sm:px-20"
      >
        {count > 1 && (
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={`${arrow} left-2 sm:left-6`}>
            <img src={chevronLeftIcon} alt="" width="20" height="20" />
          </button>
        )}
        <img
          key={image.imageId}
          src={image.imageUrl}
          alt={image.alt}
          width="1200"
          height="750"
          decoding="async"
          draggable="false"
          className="h-auto max-h-full w-auto max-w-full select-none rounded-[12px] object-contain"
        />
        {count > 1 && (
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className={`${arrow} right-2 sm:right-6`}>
            <img src={chevronRightIcon} alt="" width="20" height="20" />
          </button>
        )}
      </div>

      <ul ref={thumbsRef} aria-label="All photos" className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 py-3 sm:justify-center-safe sm:px-8 sm:py-4">
        {images.map((thumb, i) => (
          <li key={thumb.imageId} className="shrink-0">
            <button
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`Photo ${i + 1} of ${count}: ${thumb.alt}`}
              aria-current={i === index ? 'true' : undefined}
              className={`block overflow-hidden rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                i === index ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-strong' : 'opacity-55 hover:opacity-90'
              }`}
            >
              <img src={thumb.imageUrl} alt="" width="88" height="58" loading="lazy" decoding="async" className="h-[50px] w-[76px] object-cover sm:h-[58px] sm:w-[88px]" />
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  )
}
