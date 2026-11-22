import { isGoogleMapsUrl } from '../../lib/googleMaps.js'

// REQ-43 / EUC-30 (srs-alignment #37): Google reviews stay on Google. A plain link to the venue's Google Maps page,
// opened in a new tab; nothing is fetched from Google. No link (or one that isn't a Google Maps https link) renders
// nothing, not a disabled button.
export default function GoogleReviewsLink({ url, venueName }) {
  if (!isGoogleMapsUrl(url)) return null
  return (
    <div className="flex flex-col items-start gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-outline-strong px-4 text-[13px] font-semibold text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
        Read reviews on Google
        <span className="sr-only">
          {' '}
          for {venueName} (opens Google Maps in a new tab)
        </span>
      </a>
      <p aria-hidden="true" className="text-[12px] text-muted-warm">
        Opens Google Maps in a new tab.
      </p>
    </div>
  )
}
