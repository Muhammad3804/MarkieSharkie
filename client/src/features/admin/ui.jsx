import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminIcon from './icons.jsx'
import { focusRing as focus } from './styles.js'
import { STATUS_LABELS } from './format.js'

// Admin UI primitives: dense SaaS styling on the brand tokens (maroon primary, Inter body, DM Sans headings).
// Targets are 40px on touch screens and 36px from sm up (WCAG 2.2 needs 24px).

const BUTTON_VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary/90',
  secondary: 'border border-outline-strong bg-white text-ink-strong hover:bg-surface',
  danger: 'bg-danger text-white hover:bg-danger/90',
  'danger-outline': 'border border-danger/40 bg-white text-danger hover:bg-danger-bg',
  ghost: 'text-ink-strong hover:bg-surface',
}

// `to` renders a Link. `busy` shows a spinner and blocks clicks (aria-disabled keeps it focusable).
export function Button({ variant = 'primary', size = 'md', to, busy = false, icon, className = '', children, ref, ...props }) {
  const sizes = size === 'sm' ? 'h-9 px-3 text-[13px] sm:h-8' : 'h-10 px-4 text-[14px] sm:h-9'
  const classes = `inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${sizes} ${BUTTON_VARIANTS[variant]} ${focus} ${className}`
  const content = (
    <>
      {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" /> : icon && <AdminIcon name={icon} className="size-4" />}
      {children}
    </>
  )
  if (to) return <Link ref={ref} to={to} className={classes} {...props}>{content}</Link>
  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-disabled={busy || undefined}
      {...props}
      onClick={busy ? (event) => event.preventDefault() : props.onClick}
    >
      {content}
    </button>
  )
}

const BADGE_TONES = {
  pending: 'bg-pending-bg text-pending',
  changes_requested: 'bg-info-bg text-info',
  approved: 'bg-success-bg text-success',
  live: 'bg-success-bg text-success',
  active: 'bg-success-bg text-success',
  resolved: 'bg-success-bg text-success',
  rejected: 'bg-danger-bg text-danger',
  flagged: 'bg-danger-bg text-danger',
  open: 'bg-danger-bg text-danger',
  under_review: 'bg-info-bg text-info',
  suspended: 'bg-surface text-muted-warm ring-1 ring-line',
  removed: 'bg-surface text-muted-warm ring-1 ring-line',
  withdrawn: 'bg-surface text-muted-warm ring-1 ring-line',
}
const BADGE_ICONS = { pending: 'clock', changes_requested: 'message-edit', approved: 'check', live: 'check', active: 'check', resolved: 'check', rejected: 'x', flagged: 'alert', open: 'alert', under_review: 'eye', suspended: 'ban', removed: 'trash', withdrawn: 'x' }

// Status pill with an icon, so the state is never colour alone.
export function StatusBadge({ status, label }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${BADGE_TONES[status] ?? 'bg-surface text-ink'}`}>
      <AdminIcon name={BADGE_ICONS[status] ?? 'info'} className="size-3.5" strokeWidth={2.2} />
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 tabIndex={-1} data-page-heading className="font-heading text-[22px] font-semibold text-ink-strong outline-none sm:text-[24px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted-warm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '', bodyClassName = 'p-4 sm:p-5', as: Tag = 'section', ...props }) {
  const headingId = useId()
  return (
    <Tag aria-labelledby={title ? headingId : undefined} className={`min-w-0 rounded-xl border border-line bg-white ${className}`} {...props}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 id={headingId} className="text-[15px] font-semibold text-ink-strong">{title}</h2>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  )
}

export function EmptyState({ icon = 'inbox', title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface text-muted-warm">
        <AdminIcon name={icon} className="size-6" />
      </span>
      <p className="mt-1 text-[15px] font-semibold text-ink-strong">{title}</p>
      {body && <p className="max-w-sm text-[14px] leading-relaxed text-muted-warm">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ onRetry, title = 'Couldn’t load this page', body = 'Something went wrong while loading. Check your connection and try again.' }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger-bg text-danger">
        <AdminIcon name="alert" className="size-6" />
      </span>
      <p className="mt-1 text-[15px] font-semibold text-ink-strong">{title}</p>
      <p className="max-w-sm text-[14px] leading-relaxed text-muted-warm">{body}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} icon="rotate-ccw" className="mt-2">
          Try again
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-surface motion-reduce:animate-none ${className}`} />
}

export function SkeletonRows({ rows = 6, label = 'Loading' }) {
  return (
    <div aria-busy="true" aria-label={label} className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  )
}

// Tabs as links, so each tab has a URL (and Back works). items: [{ value, label, count }]
export function UrlTabs({ label, items, value, hrefFor }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map((item) => {
          const active = item.value === value
          return (
            <li key={item.value}>
              <Link
                to={hrefFor(item.value)}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-[14px] font-medium ${focus} focus-visible:-outline-offset-2 ${active ? 'border-primary text-ink-strong' : 'border-transparent text-muted-warm hover:text-ink-strong'}`}
              >
                {item.label}
                {item.count !== undefined && (
                  <span className={`rounded-full px-1.5 py-px text-[12px] tabular-nums ${active ? 'bg-rose text-primary' : 'bg-surface text-muted-warm'}`}>{item.count}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const inputBase = `h-10 w-full rounded-lg border border-outline-strong bg-white text-[14px] text-ink-strong placeholder:text-placeholder sm:h-9 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30`

// Search box that writes to the URL 300 ms after typing stops (and on Enter).
export function SearchField({ label, value, onChange, placeholder, className = '' }) {
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  const [emitted, setEmitted] = useState(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  // The URL changed from outside (Back/forward, "Clear"): show its value. Our own echo is ignored, so typing
  // during the round trip isn't overwritten.
  if (value !== synced) {
    setSynced(value)
    if (value !== emitted) {
      setText(value)
      setEmitted(value)
    }
  }
  const emit = (next) => {
    setEmitted(next)
    onChangeRef.current(next)
  }
  useEffect(() => {
    if (text === emitted) return undefined
    const timer = setTimeout(() => {
      setEmitted(text)
      onChangeRef.current(text)
    }, 300)
    return () => clearTimeout(timer)
  }, [text, emitted])
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <AdminIcon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-warm" />
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') emit(text)
        }}
        placeholder={placeholder}
        className={`${inputBase} pr-3 pl-9`}
      />
    </label>
  )
}

export function SelectField({ label, value, onChange, options, className = '', hideLabel = true }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-[12px] font-semibold text-muted-warm'}>{label}</label>
      <div className="relative">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={`${inputBase} cursor-pointer appearance-none pr-8 pl-3`}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <AdminIcon name="chevron-down" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-warm" />
      </div>
    </div>
  )
}

export function DateField({ label, value, onChange, min, max, className = '' }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-muted-warm">{label}</label>
      <input id={id} type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} className={`${inputBase} px-3`} />
    </div>
  )
}

export function Checkbox({ checked, onChange, label, indeterminate = false, className = '' }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(node) => {
        if (node) node.indeterminate = indeterminate
      }}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      className={`size-4 cursor-pointer rounded accent-primary ${focus} ${className}`}
    />
  )
}

// "Showing 11–20 of 43" + previous/next links. Links (not buttons) so every page has a URL.
export function Pager({ page, pageCount, total, pageSize, hrefFor, noun = 'results' }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const arrow = (target, label, icon) =>
    target < 1 || target > pageCount ? (
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg border border-line text-placeholder">
        <AdminIcon name={icon} className="size-4" />
      </span>
    ) : (
      <Link to={hrefFor(target)} aria-label={label} className={`grid size-9 place-items-center rounded-lg border border-outline-strong bg-white text-ink-strong hover:bg-surface ${focus}`}>
        <AdminIcon name={icon} className="size-4" />
      </Link>
    )
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-muted-warm">
      <p className="tabular-nums">
        {from}–{to} of {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        {arrow(page - 1, 'Previous page', 'chevron-left')}
        <span className="tabular-nums">
          Page {page} of {pageCount}
        </span>
        {arrow(page + 1, 'Next page', 'chevron-right')}
      </div>
    </nav>
  )
}

// Sortable column header (aria-sort). sort: current key, onSort(key); `direction` is how that key sorts.
export function SortHeader({ label, sortKey, sort, onSort, direction = 'ascending', className = '' }) {
  const active = sort === sortKey
  return (
    <th scope="col" aria-sort={active ? direction : 'none'} className={`px-3 py-2.5 text-left text-[12px] font-semibold text-muted-warm ${className}`}>
      <button type="button" onClick={() => onSort(sortKey)} className={`-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-ink-strong ${focus} ${active ? 'text-ink-strong' : ''}`}>
        {label}
        <AdminIcon name={active ? (direction === 'ascending' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'} className="size-3.5" />
      </button>
    </th>
  )
}

export function Th({ children, className = '' }) {
  return (
    <th scope="col" className={`px-3 py-2.5 text-left text-[12px] font-semibold text-muted-warm ${className}`}>
      {children}
    </th>
  )
}

// Owner/user avatar: initials on the rose tint.
export function Initials({ name, className = 'size-8 text-[12px]' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-rose font-semibold text-primary ${className}`}>
      {initials}
    </span>
  )
}

