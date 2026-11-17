import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')

const itemClass =
  'flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 text-left text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'

// Header avatar with a small disclosure menu (button + links, Tab order, Esc / outside click closes).
export default function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const button = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event) => !root.current?.contains(event.target) && setOpen(false)
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    // Tabbing past the last item closes the menu.
    const onFocus = (event) => !root.current?.contains(event.target) && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        id="account-button"
        type="button"
        aria-label={`Account menu for ${user.name}`}
        aria-expanded={open}
        aria-controls="user-menu"
        onClick={() => setOpen((value) => !value)}
        className="grid size-[50px] shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-[17px] font-semibold text-white shadow-chip ring-2 ring-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true">{initials(user.name)}</span>
      </button>
      {open && (
        <div id="user-menu" className="absolute right-0 top-[calc(100%+12px)] z-30 w-64 rounded-2xl border border-line bg-white p-2 shadow-modal motion-safe:animate-[toast-in_160ms_ease-out]">
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate text-[15px] font-semibold text-ink-strong">{user.name}</p>
            <p className="truncate text-[13px] text-muted-warm">{user.email}</p>
          </div>
          <div className="my-1 border-t border-line" />
          <Link to="/bookings" onClick={() => setOpen(false)} className={itemClass}>
            My bookings
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className={itemClass}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
