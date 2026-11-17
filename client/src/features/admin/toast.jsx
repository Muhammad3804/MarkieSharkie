import { useCallback, useEffect, useRef, useState } from 'react'
import AdminIcon from './icons.jsx'
import { ToastContext } from './toastContext.js'

// Toasts for finished actions. They never take focus; the region is aria-live="polite" so screen readers hear
// them. Auto-dismiss after 5 s, paused while hovered or focused.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const show = useCallback((message, { tone = 'success', action } = {}) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((list) => [...list.slice(-2), { id, message, tone, action }])
  }, [])
  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function Toast({ toast, dismiss }) {
  const [paused, setPaused] = useState(false)
  const timer = useRef(null)
  const { id } = toast
  const onDismiss = () => dismiss(id)
  // `dismiss` is stable (useCallback), so a new toast doesn't restart this one's timer.
  useEffect(() => {
    if (paused) return undefined
    timer.current = setTimeout(() => dismiss(id), 5000)
    return () => clearTimeout(timer.current)
  }, [paused, dismiss, id])

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-ink-strong px-4 py-3 text-[14px] text-white shadow-launcher motion-safe:animate-[toast-in_180ms_ease-out]"
    >
      <AdminIcon name={toast.tone === 'error' ? 'alert' : 'check-circle'} className={`mt-0.5 size-[18px] ${toast.tone === 'error' ? 'text-[#fda29b]' : 'text-[#75e0a7]'}`} />
      <p className="min-w-0 flex-1 leading-snug">{toast.message}</p>
      {toast.action}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 grid size-7 shrink-0 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
        <AdminIcon name="x" className="size-4" />
      </button>
    </div>
  )
}
