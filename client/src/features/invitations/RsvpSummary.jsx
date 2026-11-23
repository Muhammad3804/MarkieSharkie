import { useId } from 'react'
import { Link } from 'react-router-dom'

// The host's RSVP numbers on a booking card (REQ-38 "customer sees RSVP summary"), from GET /api/invitations.
// The full list, with names, contacts and the hall-capacity check, is on /bookings/:id/guests (NFR-8: only the
// inviting customer sees guests).
export default function RsvpSummary({ summary, booking }) {
  const id = useId()
  const { invited, attending, declined, awaiting, people } = summary
  const over = people > booking.guestCount
  return (
    <section aria-labelledby={id} className="mt-4 rounded-2xl bg-blush/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={id} className="text-[15px] font-semibold text-ink-strong">
          Invitation replies
        </h4>
        <Link to={`/bookings/${booking.bookingId}/guests`} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary">
          Guest list<span className="sr-only"> for {booking.eventName}</span>
        </Link>
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        <Stat label="Invited" value={invited} />
        <Stat label="Attending" value={attending} />
        <Stat label="Can’t make it" value={declined} />
        <Stat label="No reply" value={awaiting} />
      </dl>
      <p className={`mt-2 text-[14px] ${over ? 'font-medium text-pending' : 'text-muted-warm'}`}>
        {people.toLocaleString('en-US')} {people === 1 ? 'person' : 'people'} coming of the {booking.guestCount.toLocaleString('en-US')} you booked for.
        {over && ' Ask the venue to update the guest count; the menu is charged per guest.'}
      </p>
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-warm">{label}</dt>
      <dd className="font-heading text-[20px] font-semibold tabular-nums text-ink-strong">{value}</dd>
    </div>
  )
}
