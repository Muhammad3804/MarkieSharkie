// Admin labels and date formats. Timestamps are stored UTC and shown in Pakistan time (CLAUDE.md).
const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })
const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })

export const formatDateTime = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? dateTime.format(new Date(iso)) : '—')
export const formatShortDate = (time) => shortDate.format(new Date(time))
export const formatDate = (iso) => (iso ? longDate.format(new Date(iso)) : '—')

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
// "5 min ago", "3 hours ago", "yesterday", "2 weeks ago".
export function ago(iso, now = Date.now()) {
  if (!iso || Number.isNaN(Date.parse(iso))) return 'never'
  const minutes = Math.round((now - Date.parse(iso)) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 7) return relative.format(-days, 'day')
  if (days < 60) return relative.format(-Math.round(days / 7), 'week')
  return relative.format(-Math.round(days / 30), 'month')
}

export const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
  flagged: 'Flagged',
  live: 'Live',
  suspended: 'Suspended',
  active: 'Active',
  removed: 'Removed',
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
}

export const ROLE_LABELS = { customer: 'Customer', venue_owner: 'Venue owner', decorator: 'Decorator', admin: 'Admin' }
export const VENUE_TYPE_LABELS = { indoor: 'Indoor', outdoor: 'Outdoor', semi_outdoor: 'Semi-outdoor' }

// admin_audit_log.action -> sentence fragment ("approved", "suspended").
export const ACTION_LABELS = {
  'venue.approve': 'Approved listing',
  'venue.reject': 'Rejected listing',
  'venue.request_changes': 'Requested changes',
  'venue.suspend': 'Suspended venue',
  'venue.unsuspend': 'Unsuspended venue',
  'venue.submit': 'Submitted listing',
  'image.keep': 'Kept flagged image',
  'image.remove': 'Removed flagged image',
  'user.suspend': 'Suspended user',
  'user.unblock': 'Unblocked user',
  'user.remove': 'Removed user',
  'dispute.take': 'Took dispute',
  'dispute.resolve': 'Resolved dispute',
  'report.take': 'Took report',
  'report.resolve': 'Resolved report',
  'report.create': 'Reported listing',
  'demo.reset': 'Reset demo data',
}
export const actionLabel = (action) => ACTION_LABELS[action] ?? action

// "Report this listing" reasons (venue page form and the admin Reports page).
export const REPORT_REASONS = [
  { value: 'inaccurate', label: 'Details are wrong' },
  { value: 'fake_photos', label: 'Photos look fake or stolen' },
  { value: 'not_real', label: 'Venue doesn’t exist' },
  { value: 'pricing', label: 'Prices are misleading' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'other', label: 'Something else' },
]
