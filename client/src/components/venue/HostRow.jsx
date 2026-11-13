import awardIcon from '../../assets/icons/venue/award.svg'
import Avatar from './Avatar.jsx'

// Host line (Figma 44:1073). Not in the ERD: reply time / top host are mock (see mockVenues.js).
export default function HostRow({ venue }) {
  const { host } = venue
  return (
    <div className="flex items-center gap-4">
      <Avatar name={venue.name} size={52} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[17px] font-semibold text-ink-strong">Hosted by the {host.name}</p>
        <p className="text-[13px] text-muted-warm">Typically replies within {host.replyMinutes} minutes · Identity and venue verified</p>
      </div>
      {host.isTopHost && (
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-blush px-3 py-[7px] text-[12px] font-semibold text-primary sm:flex">
          <img src={awardIcon} alt="" width="15" height="15" />
          Top host
        </span>
      )}
    </div>
  )
}
