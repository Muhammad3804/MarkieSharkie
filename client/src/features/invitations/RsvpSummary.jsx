import { useId } from 'react'
import { formatPkMobile } from '../../lib/phone.js'
import { timeAgo } from '../../lib/format.js'

// The host's RSVP view on a booking (REQ-38 "customer sees RSVP summary", SSD4 steps 7-8): counts, a warning when
// the guests coming outnumber the hall, and every reply. Names and phones are for the inviting customer only (NFR-8).
// No "no reply" count: guests register themselves on the open link, so there's no list to count against until
// the host-added guest list (REQ-37) exists.
export default function RsvpSummary({ summary, booking }) {
  const id = useId()
  const { invitation, attendingReplies, attendingGuests, declined, responses } = summary
  const capacity = invitation.hallCapacity
  const overCapacity = capacity && attendingGuests > capacity
  const overBooked = !overCapacity && attendingGuests > booking.guestCount

  return (
    <section aria-labelledby={id} className="mt-4 rounded-2xl bg-blush/70 p-4 sm:p-5">
      <h4 id={id} className="text-[15px] font-semibold text-ink-strong">
        Invitation replies
      </h4>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <Stat label="Attending" value={attendingReplies} hint={attendingReplies === 1 ? 'reply' : 'replies'} />
        <Stat label="Guests coming" value={attendingGuests} hint={capacity ? `of ${capacity.toLocaleString('en-US')} capacity` : 'in total'} />
        <Stat label="Can’t make it" value={declined} hint={declined === 1 ? 'reply' : 'replies'} />
      </dl>

      {overCapacity && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg p-3 text-[14px] text-danger">
          <WarningIcon />
          <span>
            <strong>{attendingGuests.toLocaleString('en-US')} guests are coming, but {booking.hallName} holds {capacity.toLocaleString('en-US')}.</strong> Talk to the venue about a bigger hall or trim the guest list.
          </span>
        </p>
      )}
      {overBooked && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-pending/30 bg-pending-bg p-3 text-[14px] text-pending">
          <WarningIcon />
          <span>More guests are coming than the {booking.guestCount.toLocaleString('en-US')} you booked for. Ask the venue to update the count; the menu is charged per guest.</span>
        </p>
      )}

      {responses.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted-warm">No replies yet. Share your QR code or link, and replies show up here.</p>
      ) : (
        <details className="group mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-[14px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 24 24" className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
            See all replies ({responses.length})
          </summary>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {responses.map((r) => (
              <li key={r.guestId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[14px]">
                <span className="min-w-0">
                  <span dir="auto" className="block font-semibold text-ink-strong [overflow-wrap:anywhere]">
                    {r.name}
                  </span>
                  <span className="block tabular-nums text-muted-warm">
                    {formatPkMobile(r.phone)} · {timeAgo(r.respondedAt)}
                  </span>
                </span>
                <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[13px] font-semibold ${r.response === 'yes' ? 'bg-success-bg text-success' : 'bg-surface text-ink'}`}>
                  {r.response === 'yes' ? `Attending · ${r.partySize}` : 'Can’t make it'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-white px-2 py-3">
      <dt className="text-[12px] font-medium text-muted-warm sm:text-[13px]">{label}</dt>
      <dd className="font-heading text-[24px] font-semibold tabular-nums text-ink-strong">{value.toLocaleString('en-US')}</dd>
      <dd className="text-[12px] text-muted-warm">{hint}</dd>
    </div>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3 2 20h20L12 3Z" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
    </svg>
  )
}
