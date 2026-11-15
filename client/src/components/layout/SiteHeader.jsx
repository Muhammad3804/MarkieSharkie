import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Logo from '../ui/Logo.jsx'
import menuIcon from '../../assets/icons/menu.svg'
import langIcon from '../../assets/icons/lang.svg'
import accountIcon from '../../assets/icons/account.svg'

const links = [
  { to: '/', label: 'Home' },
  { to: '/explore', label: 'Explore' },
  { to: '/owner', label: 'Become a host' },
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

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="page-container relative grid h-[116px] grid-cols-[1fr_auto_1fr] items-center gap-6 xl:grid-cols-[minmax(241px,1fr)_minmax(0,850px)_minmax(241px,1fr)] xl:gap-10">
        <Logo className="-mr-[60px] origin-left scale-75 sm:mr-0 sm:scale-100" />

        <nav aria-label="Main" className="hidden h-[50px] w-full max-w-[850px] items-center justify-center gap-[clamp(32px,4vw,82px)] justify-self-center rounded-[30px] bg-white drop-shadow-pill xl:flex">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="col-start-3 flex items-center gap-[25px] justify-self-end">
          <IconButton icon={menuIcon} label="Menu" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen((open) => !open)} />
          <IconButton icon={langIcon} label="Language" className="hidden sm:block" />
          <IconButton icon={accountIcon} label="Account" className="hidden sm:block" />
        </div>

        {menuOpen && (
          <nav id="mobile-menu" aria-label="Main" className="absolute right-[var(--page-gutter)] top-[104px] z-20 flex w-56 flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={linkClass} onClick={() => setMenuOpen(false)}>
              {link.label}
            </NavLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}
