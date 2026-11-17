import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Logo from '../ui/Logo.jsx'
import Button from '../ui/Button.jsx'
import UserMenu from '../../features/auth/UserMenu.jsx'
import { useAuth, useRequireAuth } from '../../features/auth/authContext.js'
import menuIcon from '../../assets/icons/menu.svg'
import langIcon from '../../assets/icons/lang.svg'

const links = [
  { to: '/', label: 'Home' },
  { to: '/explore', label: 'Explore' },
  { to: '/host', label: 'Become a host' },
  { to: '/bookings', label: 'My bookings' },
  { to: '/about', label: 'About' },
]

const linkClass = ({ isActive }) =>
  `text-[16px] font-medium uppercase text-ink hover:text-primary ${isActive ? 'text-primary' : ''}`

// The icon SVGs include their own white circle and shadow, so they overflow the 50px button box.
function IconButton({ icon, label, className = '', ...props }) {
  return (
    <button type="button" aria-label={label} className={`relative size-[50px] shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-primary ${className}`} {...props}>
      <img src={icon} alt="" className="absolute inset-[-21.8%_-29.8%_-37.8%_-29.8%] block size-auto max-w-none" />
    </button>
  )
}

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, openLogin, logout } = useAuth()
  const requireAuth = useRequireAuth()
  const navigate = useNavigate()
  const loginButton = useRef(null)
  const focusLogin = useRef(false)

  // After logging out the avatar menu is gone, so put focus on the Log in button that replaces it.
  useEffect(() => {
    if (user || !focusLogin.current) return
    focusLogin.current = false
    loginButton.current?.focus()
  }, [user])

  // "My bookings" while signed out: stay on this page, ask to log in, then go to /bookings.
  function onNavClick(event, link) {
    setMenuOpen(false)
    // New-tab clicks go through untouched; the /bookings guard asks to log in there.
    if (link.to !== '/bookings' || user || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    requireAuth('bookings', () => navigate('/bookings'))
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="page-container relative grid h-[116px] grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 xl:grid-cols-[minmax(241px,1fr)_minmax(0,850px)_minmax(241px,1fr)] xl:gap-10">
        <Logo className="-mr-[60px] origin-left scale-75 max-[359px]:-mr-[92px] max-[359px]:scale-[0.62] sm:mr-0 sm:scale-100" />

        <nav aria-label="Main" className="hidden h-[50px] w-full max-w-[850px] items-center justify-center gap-[clamp(32px,4vw,82px)] justify-self-center rounded-[30px] bg-white drop-shadow-pill xl:flex">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={linkClass} onClick={(event) => onNavClick(event, link)}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="col-start-3 flex items-center gap-3 justify-self-end sm:gap-[25px]">
          <IconButton icon={menuIcon} label="Menu" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen((open) => !open)} />
          <IconButton icon={langIcon} label="Language" className="hidden sm:block" />
          {user ? (
            <UserMenu
              user={user}
              onLogout={() => {
                focusLogin.current = true
                logout()
              }}
            />
          ) : (
            <Button ref={loginButton} onClick={() => openLogin()} className="h-11 shrink-0 px-5 text-[15px] shadow-chip max-[359px]:px-3.5 max-[359px]:text-[14px]">
              Log in
            </Button>
          )}
        </div>

        {menuOpen && (
          <nav id="mobile-menu" aria-label="Main" className="absolute right-[var(--page-gutter)] top-[104px] z-20 flex w-56 flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={linkClass} onClick={(event) => onNavClick(event, link)}>
              {link.label}
            </NavLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}
