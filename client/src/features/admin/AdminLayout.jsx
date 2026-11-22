import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom'
import AdminIcon from './icons.jsx'
import { ToastProvider } from './toast.jsx'
import { CrumbContext } from './crumbs.js'
import { Initials } from './ui.jsx'
import { focusRing } from './styles.js'
import { useAdminData, useStoreVersion } from './hooks.js'
import { CURRENT_ADMIN, getNotifications, markNotificationsRead, navCounts, searchAdmin } from '../../api/admin.js'
import { ago } from './format.js'

// Admin shell: collapsible sidebar (drawer below lg), top bar with search, notifications and the admin menu,
// breadcrumb, then the page. Every section, tab and filter lives in the URL.
// The route is wrapped in RequireRole('admin') (app/router.jsx): only admins get here.
const NAV = [
  { to: '/admin', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/admin/approvals', label: 'Venue approvals', icon: 'file-check', badge: 'approvals' },
  { to: '/admin/edits', label: 'Live venue edits', icon: 'message-edit', badge: 'edits' },
  { to: '/admin/reviews', label: 'Reviews', icon: 'message-edit', badge: 'reviews' },
  { to: '/admin/images', label: 'Flagged images', icon: 'image-alert', badge: 'images' },
  { to: '/admin/venues', label: 'All venues', icon: 'building' },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/reports', label: 'Disputes & reports', icon: 'flag', badge: 'reports' },
  { to: '/admin/audit', label: 'Audit log', icon: 'history' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
]

const COLLAPSE_KEY = 'markiesharkie:admin-sidebar'
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [crumb, setCrumb] = useState(null)
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const { pathname } = useLocation()
  const mainRef = useRef(null)
  const firstPath = useRef(pathname)

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1')
      } catch {
        // a per-viewer convenience; fine to forget
      }
      return !value
    })
  }

  // A list refresh after an action can remove the focused button (the row left the filtered list). Browsers then
  // drop focus to <body>; send it to the page heading instead so keyboard users keep their place.
  useEffect(() => {
    const main = mainRef.current
    let focusedInMain = false
    const onFocusIn = (event) => {
      focusedInMain = main.contains(event.target)
    }
    const observer = new MutationObserver(() => {
      if (focusedInMain && (document.activeElement === document.body || !document.activeElement)) {
        main.querySelector('[data-page-heading]')?.focus({ preventScroll: true })
      }
    })
    document.addEventListener('focusin', onFocusIn)
    observer.observe(main, { childList: true, subtree: true })
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      observer.disconnect()
    }
  }, [])

  // New section: move focus to the page heading (screen readers hear the new page). The drawer closes itself
  // from its links.
  useEffect(() => {
    if (firstPath.current === pathname) return undefined
    firstPath.current = null
    // A lazy page may still be downloading: retry for up to ~2 s until its heading exists.
    let frame
    let tries = 0
    const focusHeading = () => {
      const heading = mainRef.current?.querySelector('[data-page-heading]')
      if (heading) heading.focus({ preventScroll: true })
      else if (tries++ < 120) frame = requestAnimationFrame(focusHeading)
    }
    frame = requestAnimationFrame(focusHeading)
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  return (
    <ToastProvider>
      <CrumbContext.Provider value={setCrumb}>
        <div className={`min-h-dvh bg-app text-ink ${collapsed ? 'lg:[--admin-sidebar:68px]' : 'lg:[--admin-sidebar:15rem]'}`}>
          <title>Admin | MarkieSharkie</title>
          <a href="#admin-main" className={`sr-only z-[70] rounded-lg bg-white px-4 py-2 text-[14px] font-semibold text-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3 ${focusRing}`}>
            Skip to content
          </a>

          <aside aria-label="Admin" className={`fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-white transition-[width] duration-200 motion-reduce:transition-none lg:flex lg:flex-col ${collapsed ? 'w-[68px]' : 'w-60'}`}>
            <SidebarContent collapsed={collapsed} onToggle={toggleCollapsed} />
          </aside>
          <MobileDrawer open={drawerOpen} onClose={closeDrawer} />

          <div className={`flex min-h-dvh flex-col transition-[padding] duration-200 motion-reduce:transition-none ${collapsed ? 'lg:pl-[68px]' : 'lg:pl-60'}`}>
            <TopBar onMenu={() => setDrawerOpen(true)} />
            <main id="admin-main" ref={mainRef} tabIndex={-1} className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 pt-4 pb-16 outline-none sm:px-6 lg:px-8">
              <Breadcrumb pathname={pathname} crumb={crumb} />
              <Outlet />
            </main>
          </div>
          <ScrollRestoration />
        </div>
      </CrumbContext.Provider>
    </ToastProvider>
  )
}

function SidebarContent({ collapsed = false, onToggle, onNavigate }) {
  useStoreVersion()
  const counts = navCounts()
  return (
    <>
      <div className={`flex h-14 shrink-0 items-center border-b border-line ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {!collapsed && (
          <Link to="/admin" className={`flex items-center gap-2 rounded-md ${focusRing}`} onClick={onNavigate}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-primary font-heading text-[14px] font-bold text-white">M</span>
            <span className="font-heading text-[16px] font-semibold text-ink-strong">MarkieSharkie</span>
            <span className="rounded bg-rose px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-primary uppercase">Admin</span>
          </Link>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={`grid size-9 place-items-center rounded-lg text-muted-warm hover:bg-surface hover:text-ink-strong ${focusRing}`}
          >
            <AdminIcon name="panel-left" className="size-[18px]" />
          </button>
        )}
      </div>
      <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const count = item.badge ? counts[item.badge] : 0
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={collapsed ? `${item.label}${count ? ` (${count})` : ''}` : undefined}
                  className={({ isActive }) =>
                    `relative flex h-10 items-center gap-3 rounded-lg text-[14px] font-medium ${collapsed ? 'justify-center px-0' : 'px-3'} ${focusRing} focus-visible:-outline-offset-2 ${
                      isActive ? 'bg-rose text-primary' : 'text-ink hover:bg-surface hover:text-ink-strong'
                    }`
                  }
                >
                  <AdminIcon name={item.icon} className="size-[18px]" />
                  <span className={collapsed ? 'sr-only' : 'flex-1 truncate'}>{item.label}</span>
                  {count > 0 &&
                    (collapsed ? (
                      <span className="absolute top-1.5 right-2.5 size-2 rounded-full bg-primary" aria-hidden="true" />
                    ) : (
                      <span className="rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">{count}</span>
                    ))}
                  {count > 0 && collapsed && <span className="sr-only">({count})</span>}
                  {count > 0 && !collapsed && <span className="sr-only"> waiting</span>}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className={`border-t border-line p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        <Link to="/" title={collapsed ? 'View the public site' : undefined} className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] text-muted-warm hover:bg-surface hover:text-ink-strong ${focusRing}`}>
          <AdminIcon name="globe" className="size-[18px]" />
          <span className={collapsed ? 'sr-only' : ''}>View public site</span>
        </Link>
      </div>
    </>
  )
}

function MobileDrawer({ open, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  // Resized to desktop while open: the drawer is hidden at lg, so close it (a hidden modal would leave the page inert).
  useEffect(() => {
    if (!open) return undefined
    const desktop = window.matchMedia('(min-width: 64rem)')
    const onChange = () => desktop.matches && onClose()
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [open, onClose])
  return (
    <dialog
      ref={ref}
      aria-label="Admin menu"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="m-0 h-dvh max-h-none w-[min(300px,85vw)] max-w-none bg-white p-0 backdrop:bg-ink-strong/40 open:flex open:flex-col lg:hidden"
    >
      <div className="absolute top-2.5 right-2.5">
        <button type="button" onClick={onClose} aria-label="Close menu" className={`grid size-10 place-items-center rounded-lg text-muted-warm hover:bg-surface ${focusRing}`}>
          <AdminIcon name="x" />
        </button>
      </div>
      <SidebarContent onNavigate={onClose} />
    </dialog>
  )
}

// Closes on Esc, outside click or focus leaving it.
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        ref.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  // Only when focus moves somewhere else on the page; a click on non-focusable panel text (or Safari, where
  // buttons don't take focus) has no relatedTarget and is handled by the pointerdown listener instead.
  const onBlur = (event) => {
    if (event.relatedTarget && !ref.current?.contains(event.relatedTarget)) setOpen(false)
  }
  return { open, setOpen, ref, onBlur }
}

function TopBar({ onMenu }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white/95 px-3 backdrop-blur sm:gap-3 sm:px-6 lg:px-8">
      <button type="button" onClick={onMenu} aria-label="Open menu" className={`grid size-10 place-items-center rounded-lg text-ink-strong hover:bg-surface lg:hidden ${focusRing}`}>
        <AdminIcon name="menu" />
      </button>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <NotificationsMenu />
        <AccountMenu />
      </div>
    </header>
  )
}

// Combobox-style search over listings, venues and users. ↑/↓ move, Enter opens, Esc closes.
function GlobalSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const navigate = useNavigate()
  const boxRef = useRef(null)

  const [searched, setSearched] = useState('')
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      searchAdmin(q)
        .then((found) => {
          if (!cancelled) {
            setResults(found)
            setSearched(q)
            setActive(-1)
          }
        })
        .catch((error) => console.error('[admin] search failed', error))
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q])

  const go = useCallback(
    (item) => {
      setOpen(false)
      setQ('')
      navigate(item.to)
    },
    [navigate],
  )

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.max(-1, i - 1))
    } else if (event.key === 'Enter' && settled && results[active]) {
      event.preventDefault()
      go(results[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && q.trim().length > 0
  const settled = searched === q
  // Keep the highlighted option visible in the scrolling list.
  useEffect(() => {
    if (active >= 0) document.getElementById(`admin-search-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 sm:max-w-md" onBlur={(event) => event.relatedTarget && !boxRef.current.contains(event.relatedTarget) && setOpen(false)}
      onPointerDownCapture={() => setOpen(true)}>
      <label htmlFor="admin-search" className="sr-only">Search listings, venues and users</label>
      <AdminIcon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-warm" />
      <input
        id="admin-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? 'admin-search-results' : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `admin-search-${active}` : undefined}
        autoComplete="off"
        value={q}
        onChange={(event) => {
          setQ(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[14px] text-ink-strong placeholder:text-muted-warm focus-visible:border-primary focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-primary/30 sm:h-9"
      />
      {showList && (
        <ul id="admin-search-results" role="listbox" aria-label="Search results" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-panel sm:right-auto sm:w-[28rem]">
          {!settled ? (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-3 text-[14px] text-muted-warm">
              Searching…
            </li>
          ) : results.length === 0 ? (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-3 text-[14px] text-muted-warm">
              No matches for “{q.trim()}”
            </li>
          ) : (
            results.map((item, index) => (
              <li
                key={`${item.kind}-${item.id}`}
                id={`admin-search-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${index === active ? 'bg-surface' : ''}`}
              >
                <span className="w-14 shrink-0 text-[11px] font-semibold tracking-wide text-muted-warm uppercase">{item.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink-strong">{item.label}</span>
                  <span className="block truncate text-[12px] text-muted-warm">{item.detail}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

function NotificationsMenu() {
  const { open, setOpen, ref, onBlur } = usePopover()
  const { status, data } = useAdminData(getNotifications, 'notifications')
  const unread = data?.unread ?? 0
  return (
    <div ref={ref} className="relative" onBlur={onBlur}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="admin-notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className={`relative grid size-10 place-items-center rounded-lg text-ink-strong hover:bg-surface sm:size-9 ${focusRing}`}
      >
        <AdminIcon name="bell" className="size-[19px]" />
        {unread > 0 && <span aria-hidden="true" className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div id="admin-notifications" className="fixed inset-x-3 top-14 z-40 mt-1 rounded-xl border border-line bg-white shadow-panel sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold text-ink-strong">Notifications</h2>
            <button type="button" onClick={markNotificationsRead} disabled={!unread} className={`rounded px-1 text-[13px] font-medium text-primary hover:underline disabled:text-muted-warm disabled:no-underline ${focusRing}`}>
              Mark all as read
            </button>
          </div>
          {status === 'loading' ? (
            <p className="px-4 py-6 text-center text-[14px] text-muted-warm">Loading…</p>
          ) : status === 'error' ? (
            <p className="px-4 py-6 text-center text-[14px] text-danger">Couldn’t load notifications.</p>
          ) : data.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[14px] text-muted-warm">You’re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {data.items.map((item) => (
                <li key={item.id}>
                  <Link to={item.to} onClick={() => setOpen(false)} className={`flex gap-3 px-4 py-3 hover:bg-surface ${focusRing} focus-visible:-outline-offset-2`}>
                    <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.unread ? 'bg-primary' : 'bg-transparent'}`} />
                    <span className="min-w-0">
                      <span className="block text-[14px] text-ink-strong">
                        {item.unread && <span className="sr-only">Unread: </span>}
                        {item.text}
                      </span>
                      <span className="block text-[12px] text-muted-warm">{ago(item.at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function AccountMenu() {
  const { open, setOpen, ref, onBlur } = usePopover()
  return (
    <div ref={ref} className="relative" onBlur={onBlur}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="admin-account"
        aria-label={`Account: ${CURRENT_ADMIN.name}`}
        className={`flex h-10 items-center gap-2 rounded-lg pr-1 pl-1 hover:bg-surface sm:h-9 sm:pr-2 ${focusRing}`}
      >
        <Initials name={CURRENT_ADMIN.name} />
        <span className="hidden text-[14px] font-medium text-ink-strong md:block">{CURRENT_ADMIN.name}</span>
        <AdminIcon name="chevron-down" className="hidden size-4 text-muted-warm md:block" />
      </button>
      {open && (
        <div id="admin-account" className="absolute top-full right-0 z-40 mt-1 w-64 rounded-xl border border-line bg-white p-1 shadow-panel">
          <div className="px-3 py-2.5">
            <p className="text-[14px] font-semibold text-ink-strong">{CURRENT_ADMIN.name}</p>
            <p className="truncate text-[13px] text-muted-warm">{CURRENT_ADMIN.email}</p>
            <p className="mt-1 text-[12px] text-muted-warm">Admin · demo account</p>
          </div>
          <hr className="my-1 border-line" />
          <Link to="/admin/settings" onClick={() => setOpen(false)} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] text-ink-strong hover:bg-surface ${focusRing}`}>
            <AdminIcon name="settings" className="size-4" /> Settings
          </Link>
          <Link to="/" className={`flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] text-ink-strong hover:bg-surface ${focusRing}`}>
            <AdminIcon name="globe" className="size-4" /> View public site
          </Link>
          {/* TODO(auth): sign out clears the session and refresh token. */}
          <button type="button" disabled title="Sign-in isn’t built yet" className="flex h-10 w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 text-[14px] text-muted-warm">
            <AdminIcon name="log-out" className="size-4" /> Sign out (no accounts yet)
          </button>
        </div>
      )}
    </div>
  )
}

const SECTION_LABELS = Object.fromEntries(NAV.map((item) => [item.to.split('/')[2] ?? '', item.label]))

function Breadcrumb({ pathname, crumb }) {
  const [, , section, detail] = pathname.split('/')
  const items = [{ label: 'Admin', to: '/admin' }]
  if (section) items.push({ label: SECTION_LABELS[section] ?? section, to: `/admin/${section}` })
  if (detail) items.push({ label: crumb ?? '…' })
  if (items.length === 1) items[0] = { label: 'Admin' }
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-muted-warm">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={item.label + index} className="flex min-w-0 items-center gap-1">
              {index > 0 && <AdminIcon name="chevron-right" className="size-3.5" />}
              {last || !item.to ? (
                <span aria-current={last ? 'page' : undefined} className={`truncate ${last ? 'font-medium text-ink-strong' : ''}`}>{item.label}</span>
              ) : (
                <Link to={item.to} className={`rounded hover:text-ink-strong hover:underline ${focusRing}`}>{item.label}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
