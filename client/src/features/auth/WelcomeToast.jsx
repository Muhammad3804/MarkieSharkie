import { useEffect, useRef, useState } from 'react'

const DISMISS_MS = 4000

// "Welcome to MarkieSharkie, <name>" after the account's first login, "Welcome back, <name>" after later ones, with
// an "Admin" tag for admins. Polite live region (always mounted, so screen readers announce the change); never takes
// focus; auto-dismisses after ~4 s, paused while hovered or focused; the slide-in only runs without reduced motion.
export default function WelcomeToast({ welcome, onDismiss }) {
  const [paused, setPaused] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (!welcome || paused) return undefined
    timer.current = setTimeout(onDismiss, DISMISS_MS)
    return () => clearTimeout(timer.current)
  }, [welcome, paused, onDismiss])

  const firstName = welcome?.name?.split(/\s+/)[0] ?? ''
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex justify-center sm:inset-x-auto sm:right-6 sm:top-6">
      {welcome && (
        <div
          key={welcome.id}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-ink-strong shadow-modal motion-safe:animate-[toast-in_180ms_ease-out]"
        >
          <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[15px] font-semibold text-white">
            {firstName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug">
              {welcome.first ? `Welcome to MarkieSharkie, ${firstName}` : `Welcome back, ${firstName}`}
            </p>
            {welcome.role === 'admin' ? (
              <p className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-warm">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold text-primary">Admin</span>
                You’re signed in to the admin dashboard.
              </p>
            ) : (
              <p className="mt-0.5 text-[13px] text-muted-warm">You’re logged in.</p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-m-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-warm hover:bg-surface hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-primary"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m3 3 10 10M13 3 3 13" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
