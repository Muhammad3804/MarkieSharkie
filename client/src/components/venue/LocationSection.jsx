import { SectionTitle } from './AboutSection.jsx'
import mapPinWhiteIcon from '../../assets/icons/venue/map-pin-white.svg'

// "Where you'll be" (Figma 46:246). The design's satellite image only shows one real place, so the map area is a
// neutral placeholder with the pin, plus a link to Google Maps at the venue's own coordinates (venues.location).
// An embedded interactive map is not built yet.
export default function LocationSection({ venue }) {
  const { lat, lng } = venue.location
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  return (
    <section aria-labelledby="location-title" className="flex flex-col gap-[18px]">
      <SectionTitle id="location-title">Where you’ll be</SectionTitle>
      <p className="text-[15px] text-muted-warm">{venue.address}</p>
      <div
        role="img"
        aria-label={`Map placeholder for ${venue.name}`}
        className="relative h-[260px] overflow-hidden rounded-[18px] bg-map sm:h-[360px]"
        style={{
          backgroundImage:
            'linear-gradient(28deg, transparent 47%, #d5dde6 47%, #d5dde6 49%, transparent 49%), linear-gradient(118deg, transparent 58%, #f4e7b8 58%, #f4e7b8 60.5%, transparent 60.5%), linear-gradient(0deg, rgba(255,255,255,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 100% 100%, 46px 46px, 46px 46px',
        }}
      >
        <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary shadow-pin">
          <img src={mapPinWhiteIcon} alt="" width="20" height="20" />
        </span>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 left-4 rounded-[12px] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink-strong shadow-chip hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold text-ink-strong">Easily accessible from major roads</p>
        <p className="text-[13px] leading-[1.5] text-muted-warm">{venue.locationDescription}</p>
      </div>
    </section>
  )
}
