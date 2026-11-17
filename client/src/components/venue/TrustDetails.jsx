import badgeCheckIcon from '../../assets/icons/venue/badge-check-lg.svg'
import calendarCheckIcon from '../../assets/icons/venue/calendar-check.svg'
import messagesIcon from '../../assets/icons/venue/messages-square.svg'
import { SLOT_HOLD_MINUTES } from '../../lib/booking.js'

// Trust details (Figma 44:1083). Copy adjusted where the design disagrees with the SRS: the hold is
// SLOT_HOLD_MINUTES (REQ-18), not 48 hours, and the brand is MarkieSharkie (the frame says "Maraasim").
export default function TrustDetails({ venue }) {
  const items = [
    [badgeCheckIcon, 'Verified venue and management', 'MarkieSharkie has reviewed ownership, event spaces and venue photos before listing.'],
    [calendarCheckIcon, `Your slot is held for ${SLOT_HOLD_MINUTES} minutes`, 'Nobody else can book your chosen slot while you confirm your event details.'],
    venue.ratingCategories.length > 3
      ? [messagesIcon, 'Exceptional planning support', `Recent hosts rated the team ${venue.ratingCategories[3].score}/5 for communication and coordination.`]
      : [messagesIcon, 'Talk to the venue team', 'Send an inquiry with your date and guest count; the team replies through MarkieSharkie.'],
  ]
  return (
    <ul className="flex flex-col gap-[22px]">
      {items.map(([icon, title, body]) => (
        <li key={title} className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-blush">
            <img src={icon} alt="" width="21" height="21" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold text-ink-strong">{title}</p>
            <p className="text-[13px] leading-[1.45] text-muted-warm">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
