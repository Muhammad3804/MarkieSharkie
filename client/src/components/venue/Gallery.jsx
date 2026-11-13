import { useRef, useState } from 'react'
import badgeCheckIcon from '../../assets/icons/venue/badge-check.svg'
import mapPinIcon from '../../assets/icons/venue/map-pin.svg'
import shareIcon from '../../assets/icons/venue/share.svg'
import heartIcon from '../../assets/icons/venue/heart.svg'
import layoutGridIcon from '../../assets/icons/venue/layout-grid.svg'
import closeIcon from '../../assets/icons/close.svg'

const pillButton =
  'flex h-[42px] items-center justify-center gap-2 rounded-full border border-line bg-white px-3.5 text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// Title, actions and photo mosaic (Figma 44:1015). The first image is the hero: eager + high fetch priority.
export default function Gallery({ venue }) {
  const [saved, setSaved] = useState(false)
  const [shareNote, setShareNote] = useState('')
  const dialogRef = useRef(null)
  const [hero, ...rest] = venue.images
  const columns = [rest.slice(0, 2), rest.slice(2, 4)]

  async function share() {
    setShareNote('')
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: venue.name, url })
      else {
        await navigator.clipboard.writeText(url)
        setShareNote('Link copied')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setShareNote('Couldn’t share. Copy the link from the address bar instead.')
    }
  }

  return (
    <section aria-labelledby="venue-title" className="flex flex-col gap-6 pb-[38px] pt-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="venue-title" className="font-heading text-[26px] font-semibold text-ink-strong md:text-[36px]">
              {venue.name} — {venue.tagline}
            </h1>
            {venue.approvalStatus === 'approved' && (
              <span className="flex items-center gap-[5px] rounded-full bg-blush px-2.5 py-1.5 text-[12px] font-semibold text-primary">
                <img src={badgeCheckIcon} alt="" width="15" height="15" />
                Verified venue
              </span>
            )}
          </div>
          <p className="flex items-center gap-2 text-[15px] text-muted-warm">
            <img src={mapPinIcon} alt="" width="16" height="16" />
            {venue.area}, {venue.city} · {venue.nearby}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button type="button" onClick={share} className={pillButton}>
            <img src={shareIcon} alt="" width="18" height="18" />
            Share
          </button>
          <button type="button" aria-pressed={saved} onClick={() => setSaved((value) => !value)} className={`${pillButton} aria-pressed:border-primary aria-pressed:text-primary`}>
            <img src={heartIcon} alt="" width="18" height="18" />
            Save
          </button>
          <span role="status" className="text-[13px] text-muted-warm">{shareNote}</span>
        </div>
      </div>

      {hero ? (
        <div className="relative grid h-[260px] grid-cols-1 gap-2 overflow-hidden rounded-[18px] sm:h-[438px] md:grid-cols-[650fr_327fr_327fr]">
          <img src={hero.imageUrl} alt={hero.alt} width="650" height="438" fetchPriority="high" loading="eager" decoding="async" className="size-full bg-surface object-cover" />
          {columns.map((column, index) =>
            column.length > 0 ? (
              <div key={index} className="hidden flex-col gap-2 md:flex">
                {column.map((image) => (
                  <img key={image.imageId} src={image.imageUrl} alt={image.alt} width="327" height="215" loading="lazy" decoding="async" className="min-h-0 w-full flex-1 bg-surface object-cover" />
                ))}
              </div>
            ) : null,
          )}
          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            className="absolute bottom-4 right-4 flex items-center gap-2 rounded-[12px] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink-strong shadow-chip hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <img src={layoutGridIcon} alt="" width="17" height="17" />
            Show all {venue.images.length} photos
          </button>
        </div>
      ) : (
        <div className="flex h-[260px] items-center justify-center rounded-[18px] bg-surface text-[15px] text-muted-warm sm:h-[438px]">No photos yet</div>
      )}

      {/* Clicking the backdrop (the dialog element itself, outside the content) closes it; Esc is native. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="all-photos-title"
        onClick={(event) => event.target === dialogRef.current && dialogRef.current.close()}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(1100px,calc(100vw-2rem))] overscroll-contain rounded-[18px] p-0 backdrop:bg-ink-strong/60"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <h2 id="all-photos-title" className="font-heading text-[20px] font-semibold text-ink-strong">{venue.name} photos</h2>
          <button type="button" aria-label="Close photos" onClick={() => dialogRef.current?.close()} className="rounded-full bg-ink-strong p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <img src={closeIcon} alt="" width="20" height="20" />
          </button>
        </div>
        <ul className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          {venue.images.map((image) => (
            <li key={image.imageId}>
              <img src={image.imageUrl} alt={image.alt} width="520" height="325" loading="lazy" decoding="async" className="aspect-[8/5] w-full rounded-[12px] bg-surface object-cover" />
            </li>
          ))}
        </ul>
      </dialog>
    </section>
  )
}
