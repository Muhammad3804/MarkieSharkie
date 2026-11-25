import { useId, useState } from 'react'
import { CURRENT_ADMIN, getAiThreshold, setAiThreshold } from '../../api/admin.js'
import ConfirmDialog from '../../features/admin/ConfirmDialog.jsx'
import { useAdminData } from '../../features/admin/hooks.js'
import { formatDateTime } from '../../features/admin/format.js'
import { Button, Card, ErrorState, Initials, PageHeader, Skeleton } from '../../features/admin/ui.jsx'
import { SLOT_HOLD_MINUTES, MIN_GUESTS } from '../../lib/booking.js'
import { MAX_PHOTOS, MIN_PHOTOS, PHOTO_MAX_BYTES } from '../../features/host/options.js'

// Platform facts (read-only; they come from the SRS and docs) and the one setting an admin can change: the AI-image
// threshold (srs-alignment #42).
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
  ['Photo check', 'Every photo goes through the AI check; at or above the threshold it is rejected as AI-generated (REQ-9, #42)'],
  ['Venue approval', `Needs ${MIN_PHOTOS}+ accepted photos and none rejected or unchecked; the owner is emailed (REQ-7)`],
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
  return (
    <>
      <title>Settings | Admin | MarkieSharkie</title>
      <PageHeader title="Settings" description="Platform information and your admin account." />
      <div className="grid gap-5 lg:grid-cols-2">
        <AiThresholdCard />
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
          <p className="mt-3 text-[13px] text-muted-warm">New admins are created from the server command line (REQ-1). Change your password with “Forgot password” on the login screen.</p>
        </Card>
      </div>
    </>
  )
}

// The AI-likelihood threshold: a slider and a number field kept in step, saved after a confirm (audited).
function AiThresholdCard() {
  const id = useId()
  const { status, data, reload } = useAdminData(getAiThreshold, 'ai-threshold')
  const [value, setValue] = useState(null) // null = not edited, show the saved value
  const [confirming, setConfirming] = useState(false)
  const saved = data?.threshold
  const shown = value ?? (saved === undefined ? '' : String(saved))
  const number = Number(shown)
  const valid = shown.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 100 && /^\d{1,3}(\.\d{1,2})?$/.test(shown.trim())
  const changed = valid && number !== saved

  return (
    <Card title="AI image threshold" className="lg:col-span-2">
      {status === 'loading' ? (
        <div aria-busy="true" aria-label="Loading the threshold" className="flex flex-col gap-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : status === 'error' ? (
        <ErrorState title="Couldn’t load the threshold" onRetry={reload} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (changed) setConfirming(true)
          }}
          className="flex flex-col gap-4"
        >
          <p id={`${id}-help`} className="max-w-[70ch] text-[14px] leading-relaxed text-ink">
            Images with an AI score at or above this value are rejected. They are never published, and a listing left with fewer than {MIN_PHOTOS} accepted photos is rejected for AI-generated images and the owner is emailed. Changes apply to photos checked from now on.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor={`${id}-range`} className="sr-only">Threshold slider</label>
            <input id={`${id}-range`} type="range" min="0" max="100" step="1" value={valid ? number : saved} onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-help`} className="h-10 w-full flex-1 cursor-pointer accent-primary" />
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-number`} className="text-[14px] font-medium text-ink-strong">Threshold</label>
              <input id={`${id}-number`} inputMode="decimal" value={shown} onChange={(e) => setValue(e.target.value)} aria-invalid={!valid} aria-describedby={`${id}-help${valid ? '' : ` ${id}-error`}`} className="h-10 w-20 rounded-lg border border-outline-strong px-2 text-right text-[15px] tabular-nums text-ink-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary/30 aria-invalid:border-danger" />
              <span className="text-[14px] text-ink">%</span>
            </div>
          </div>
          {!valid && <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">Enter a number from 0 to 100 (up to 2 decimals).</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" aria-disabled={!changed || undefined}>Save threshold</Button>
            {value !== null && <Button variant="ghost" onClick={() => setValue(null)}>Undo</Button>}
            <p className="text-[13px] text-muted-warm">
              Now {saved}%{data.updatedAt ? ` · changed ${formatDateTime(data.updatedAt)}${data.updatedBy ? ` by ${data.updatedBy}` : ''}` : ' · default'}
            </p>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Change the threshold to ${shown}%?`}
        body={`New photos scoring ${shown}% or more will be rejected as AI-generated (now ${saved}%). Photos already checked keep their result. The change is saved in the audit log.`}
        confirmLabel="Change threshold"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await setAiThreshold(number)
          setValue(null)
          return `AI threshold set to ${number}%`
        }}
      />
    </Card>
  )
}
