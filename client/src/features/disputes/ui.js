// Shared styles and labels for the customer / owner dispute pages.
export const primaryButton =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-primary px-4 text-[14px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(122,23,49,0.6)] transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:opacity-60'
export const secondaryButton =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line px-4 text-[14px] font-semibold text-ink-strong transition-colors hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export const STATUS_TONES = {
  open: 'bg-pending-bg text-pending',
  under_review: 'bg-rose text-primary',
  resolved: 'bg-success-bg text-success',
  rejected: 'bg-surface text-muted-warm',
}

// Booking statuses a problem can be reported on (server: NOT_DISPUTABLE otherwise).
export const canReportProblem = (booking) => ['confirmed', 'completed', 'cancelled'].includes(booking.status)
