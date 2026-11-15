import { toggleWishlist, useIsWishlisted } from './wishlist.js'

// Heart toggle on venue cards. Sits beside the card link (not inside it): a button can't be nested in a link.
export default function WishlistButton({ venueId, venueName, className = '' }) {
  const saved = useIsWishlisted(venueId)

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={`Save ${venueName} to wishlist`}
      onClick={() => toggleWishlist(venueId)}
      className={`grid size-11 place-items-center rounded-full bg-white/90 shadow-chip backdrop-blur-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true" className={saved ? 'fill-primary stroke-primary' : 'fill-transparent stroke-ink-strong'}>
        <path
          d="M1.5 7.13a4.13 4.13 0 0 1 7.19-2.76.42.42 0 0 0 .62 0 4.13 4.13 0 0 1 7.19 2.76c0 1.71-1.12 3-2.25 4.12l-4.12 3.99a1.5 1.5 0 0 1-2.25.01L3.75 11.25C2.62 10.13 1.5 8.85 1.5 7.13Z"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
