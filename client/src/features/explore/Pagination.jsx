import { Link } from 'react-router-dom'
import chevronLeftIcon from '../../assets/icons/venue/chevron-left.svg'
import chevronRightIcon from '../../assets/icons/venue/chevron-right.svg'

// Page numbers to show: always first, last and the current page's neighbours, with gaps as null ("…").
function pageItems(page, pageCount) {
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? [null, p] : [p]))
}

const itemClass = 'grid size-11 place-items-center rounded-full text-[15px] tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// Links (not buttons) so every page has a URL; a new page scrolls to the top like any navigation.
export default function Pagination({ page, pageCount, hrefFor }) {
  if (pageCount <= 1) return null

  const arrow = (target, label, icon) =>
    target < 1 || target > pageCount ? (
      <span aria-hidden="true" className={`${itemClass} opacity-30`}><img src={icon} alt="" width="18" height="18" /></span>
    ) : (
      <Link to={hrefFor(target)} aria-label={label} className={`${itemClass} hover:bg-surface`}>
        <img src={icon} alt="" width="18" height="18" />
      </Link>
    )

  return (
    <nav aria-label="Results pages" className="flex items-center justify-center gap-1">
      {arrow(page - 1, 'Previous page', chevronLeftIcon)}
      {pageItems(page, pageCount).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden="true" className="w-6 text-center text-muted">…</span>
        ) : (
          <Link
            key={p}
            to={hrefFor(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className={`${itemClass} ${p === page ? 'bg-ink-strong font-semibold text-white' : 'text-ink-strong hover:bg-surface'}`}
          >
            {p}
          </Link>
        ),
      )}
      {arrow(page + 1, 'Next page', chevronRightIcon)}
    </nav>
  )
}
