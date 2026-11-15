import { SectionTitle } from './AboutSection.jsx'

// "Where you'll be" (Figma 46:246): a static Google Maps embed of the venue's coordinates (no API key needed).
// The iframe ignores pointer events so it can't be dragged; a link over it opens the full map in a new tab.
export default function LocationSection({ venue }) {
  const { lat, lng } = venue
  const embedUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  return (
    <section aria-labelledby="location-title" className="flex flex-col gap-[18px]">
      <SectionTitle id="location-title">Where you’ll be</SectionTitle>
      <p className="text-[15px] text-muted-warm">{venue.address}</p>
      <div className="relative h-[260px] overflow-hidden rounded-[18px] bg-map sm:h-[360px]">
        <iframe
          title={`Map of ${venue.name}`}
          src={embedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none size-full border-0"
        />
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open in Google Maps: ${venue.name} (opens in a new tab)`}
          className="group absolute inset-0 rounded-[18px] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary"
        >
          <span className="absolute bottom-4 left-4 rounded-[12px] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink-strong shadow-chip group-hover:bg-surface">
            Open in Google Maps
          </span>
        </a>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold text-ink-strong">Easily accessible from major roads</p>
        <p className="text-[13px] leading-[1.5] text-muted-warm">{venue.locationDescription}</p>
      </div>
    </section>
  )
}
