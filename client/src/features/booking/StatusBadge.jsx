import { bookingStatusView } from '../../lib/booking.js'

const TONES = {
  pending: 'bg-pending-bg text-pending',
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-surface text-ink',
}

// Booking status pill. The text carries the meaning; colour only reinforces it.
export default function StatusBadge({ booking, className = '' }) {
  const view = bookingStatusView(booking)
  return (
    <span data-status={view.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${TONES[view.tone]} ${className}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {view.label}
    </span>
  )
}
