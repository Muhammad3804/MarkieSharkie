import { useState } from 'react'
import { CURRENT_ADMIN, resetDemoData } from '../../api/admin.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import { Button, Card, Initials, PageHeader } from '../../features/admin/ui.jsx'
import { SLOT_HOLD_MINUTES, MIN_GUESTS } from '../../lib/booking.js'
import { MAX_PHOTOS, MIN_PHOTOS, PHOTO_MAX_BYTES } from '../../features/host/options.js'

// Platform facts (read-only; they come from the SRS and docs, not from settings an admin can change) plus a reset
// for the browser demo data.
const PLATFORM = [
  ['Platform', 'MarkieSharkie, marquee and event-venue booking'],
  ['Country', 'Pakistan only'],
  ['Currency', 'PKR (payments are tracked, never processed)'],
  ['Time zone', 'Asia/Karachi (PKT, UTC+5)'],
  ['Language', 'English'],
]
const RULES = [
  ['Slot hold', `${SLOT_HOLD_MINUTES} minutes (REQ-18)`],
  ['Double booking', 'Never: one active booking per slot (REQ-20)'],
  ['Minimum guests', `${MIN_GUESTS} per booking`],
  ['Venue photos', `JPEG or PNG, up to ${PHOTO_MAX_BYTES / 1024 / 1024} MB each, ${MIN_PHOTOS} to ${MAX_PHOTOS} per listing (REQ-8)`],
  ['Photo check', 'Every photo goes through the AI check; flagged photos wait for an admin (REQ-9, REQ-10)'],
  ['Venue approval', 'Approve, reject with a reason, or request changes (REQ-7)'],
]

function Facts({ items }) {
  return (
    <dl className="divide-y divide-line text-[14px]">
      {items.map(([term, value]) => (
        <div key={term} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
          <dt className="text-muted-warm">{term}</dt>
          <dd className="text-ink-strong">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function Settings() {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <title>Settings | Admin | MarkieSharkie</title>
      <PageHeader title="Settings" description="Platform information and your admin account." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Platform">
          <Facts items={PLATFORM} />
        </Card>
        <Card title="Booking and listing rules">
          <Facts items={RULES} />
        </Card>
        <Card title="Your account">
          <div className="flex items-center gap-3">
            <Initials name={CURRENT_ADMIN.name} className="size-12 text-[15px]" />
            <div>
              <p className="text-[15px] font-semibold text-ink-strong">{CURRENT_ADMIN.name}</p>
              <p className="text-[14px] text-muted-warm">{CURRENT_ADMIN.email} · Admin</p>
            </div>
          </div>
          <p className="mt-3 text-[13px] text-muted-warm">Demo account. Sign-in, password changes and creating other admins arrive with accounts (REQ-1 to REQ-3).</p>
        </Card>
        <Card title="Demo data">
          <p className="text-[14px] leading-relaxed text-ink">Disputes and listing reports are still a demo stored in this browser only. Resetting brings back their seeded examples. Users, venues, bookings, invitations and the audit log are on the server and aren’t affected.</p>
          <Button variant="danger-outline" icon="rotate-ccw" className="mt-4" onClick={() => setConfirm(true)}>Reset demo data</Button>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title="Reset the demo disputes and reports?"
        body="The demo disputes and listing reports in this browser go back to the seeded examples. Nothing on the server changes."
        confirmLabel="Reset demo data"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          resetDemoData()
          return 'Demo data reset'
        }}
      />
    </>
  )
}
