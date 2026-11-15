import { useEffect, useRef } from 'react'

// Mobile filters as a bottom sheet: native modal <dialog> like the photo lightbox (focus trap, Esc, page scroll lock
// from index.css). Filters apply live behind it; the footer shows the live count and closes the sheet.
export default function FilterSheet({ open, closeQuery, onClose, onClear, total, isFetching, children }) {
  const dialog = useRef(null)

  useEffect(() => {
    const node = dialog.current
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  // The sheet is for small screens; if the window grows to the sidebar layout (closeQuery), close it.
  useEffect(() => {
    if (!open) return
    const wide = window.matchMedia(closeQuery)
    const onWide = () => wide.matches && onClose()
    wide.addEventListener('change', onWide)
    return () => wide.removeEventListener('change', onWide)
  }, [open, closeQuery, onClose])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="filter-sheet-title"
      onClose={onClose}
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="fixed inset-x-0 bottom-0 top-auto m-0 flex max-h-[88dvh] w-full max-w-none flex-col rounded-t-[28px] bg-white p-0 text-ink shadow-panel backdrop:bg-ink-strong/50 not-open:hidden motion-safe:transition-transform motion-safe:duration-300 motion-safe:starting:open:translate-y-full"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <h2 id="filter-sheet-title" className="font-heading text-[18px] font-semibold text-ink-strong">Filters</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="grid size-11 place-items-center rounded-full text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="m3 3 10 10M13 3 3 13" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 px-1 text-[15px] font-semibold text-ink-strong underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-[14px] bg-primary px-6 text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {isFetching ? 'Updating…' : total === 1 ? 'Show 1 venue' : `Show ${total} venues`}
        </button>
      </div>
    </dialog>
  )
}
