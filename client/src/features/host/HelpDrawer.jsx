import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import HostIcon from './icons.jsx'

// "Questions?" side drawer with tips for the current step. Native <dialog> + showModal(): focus trap, Esc and
// focus return come from the browser. Slides in from the right (no motion with reduced motion).
export default function HelpDrawer({ open, onClose, help }) {
  const dialog = useRef(null)

  useEffect(() => {
    const element = dialog.current
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="help-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-[420px] translate-x-0 bg-white p-0 shadow-card transition-[translate,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-ink-strong/40 starting:open:translate-x-full motion-reduce:transition-none"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="help-title" className="font-heading text-[20px] font-semibold text-ink-strong">
            {help.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            <HostIcon name="x" className="size-5" strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <ul className="grid gap-5">
            {help.tips.map((tip) => (
              <li key={tip} className="flex gap-3 text-[16px] leading-relaxed text-ink">
                <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-rose text-primary">
                  <HostIcon name="check" className="size-3.5" strokeWidth={2.5} />
                </span>
                {tip}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-2xl bg-surface p-5">
            <p className="text-[16px] font-semibold text-ink-strong">Still have questions?</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">Your progress is saved, so you can read our FAQ and come back.</p>
            <Link
              to="/about#faq"
              target="_blank"
              rel="noopener"
              className="mt-3 inline-block text-[15px] font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
            >
              Read the FAQ<span className="sr-only"> (opens in a new tab)</span>
            </Link>
          </div>
        </div>
      </div>
    </dialog>
  )
}
