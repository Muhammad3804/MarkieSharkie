import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useVenue } from '../features/venues/useVenue.js'
import { GALLERY_SECTIONS } from '../features/venues/constants.js'
import Button from '../components/ui/Button.jsx'
import Lightbox from '../components/venue/Lightbox.jsx'
import arrowLeftIcon from '../assets/icons/venue/arrow-left.svg'

// Venue photo gallery (Figma frame 90:1063): one set of eight sections per hall, chosen with the hall tabs.
// One generic page for every venue; data comes from the api/ layer. Opening /venues/:id/photos#<imageId>
// switches to that photo's hall and scrolls to it. Clicking a photo opens it in the full-screen Lightbox.
export default function VenuePhotos() {
  const { id } = useParams()
  const { status, venue, reload } = useVenue(id)

  if (status === 'loading') return <PhotosSkeleton />
  if (status !== 'ready') {
    const failed = status === 'error'
    return (
      <div className="page-container flex flex-col items-start gap-4 py-24">
        <title>{failed ? 'Couldn’t load photos · MarkieSharkie' : 'Venue not found · MarkieSharkie'}</title>
        <h1 className="font-heading text-[28px] font-bold text-ink-strong">{failed ? 'Couldn’t load these photos' : 'Venue not found'}</h1>
        <p className="text-[15px] text-muted-warm">
          {failed ? 'Something went wrong while loading the gallery. Check your connection and try again.' : 'These photos belong to a venue that doesn’t exist or is no longer listed.'}
        </p>
        <div className="flex gap-3">
          {failed && <Button onClick={reload} className="px-5 py-2.5">Try again</Button>}
          <Button to="/" variant={failed ? 'outline' : 'primary'} className="px-5 py-2.5">Back to home</Button>
        </div>
      </div>
    )
  }
  return <PhotosView key={venue.id} venue={venue} />
}

// The hash is user-controlled; a malformed escape must not crash the page.
function photoIdFromHash(hash) {
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return hash.slice(1)
  }
}

function PhotosView({ venue }) {
  const { hash } = useLocation()
  const [searchParams] = useSearchParams()
  const targetId = photoIdFromHash(hash)

  // Hall from ?hall=, or the hall that contains the photo in the hash, or Hall 1.
  const hallIndex = useMemo(() => {
    const fromHash = venue.gallery.findIndex((g) => g.sections.some((s) => s.images.some((image) => image.imageId === targetId)))
    if (fromHash >= 0) return fromHash
    const fromQuery = Number(searchParams.get('hall')) - 1
    return fromQuery >= 0 && fromQuery < venue.gallery.length ? fromQuery : 0
  }, [venue.gallery, targetId, searchParams])
  const hallGallery = venue.gallery[hallIndex]
  const hall = venue.halls.find((h) => h.hallId === hallGallery?.hallId) ?? { name: 'Venue', capacity: venue.capacity }

  // The lightbox shows the current hall's photos in page order.
  const hallImages = useMemo(() => hallGallery?.sections.flatMap((section) => section.images) ?? [], [hallGallery])
  const [viewer, setViewer] = useState(null) // { hallIndex, index, opener } while open
  const viewerIndex = viewer?.hallIndex === hallIndex ? viewer.index : null
  const openPhoto = (imageId, opener) =>
    setViewer({ hallIndex, index: Math.max(0, hallImages.findIndex((image) => image.imageId === imageId)), opener })
  const changeViewerIndex = (next) =>
    setViewer((current) => current && { ...current, index: typeof next === 'function' ? next(current.index) : next })

  // Jump straight to the clicked photo (one instant scroll, so it doesn't fight ScrollRestoration's hash jump).
  useEffect(() => {
    if (!targetId) return
    const photo = document.getElementById(targetId)
    if (!photo) return
    photo.scrollIntoView({ block: 'center' })
    photo.querySelector('button')?.focus({ preventScroll: true })
  }, [targetId, hallIndex])

  const venuePath = `/venues/${venue.id}`

  return (
    <div className="pb-16">
      <title>{`${venue.name} photos · MarkieSharkie`}</title>
      <meta name="description" content={`${venue.images.length} photos of ${venue.name}, ${venue.area}, ${venue.city}: halls, stage, bridal room, parking and entrance.`} />

      <header className="page-container flex flex-col gap-[42px] pb-[62px] pt-10 lg:pt-14">
        <div className="grid grid-cols-[1fr_auto] items-center gap-y-6 md:grid-cols-[1fr_auto_1fr]">
          <Link to={venuePath} className="flex items-center gap-2.5 justify-self-start text-[13px] font-medium text-ink-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <img src={arrowLeftIcon} alt="" width="18" height="18" />
            <span>
              <span className="sr-only">Back to </span>
              {venue.name}
            </span>
          </Link>
          <div className="col-span-2 row-start-2 flex flex-col items-center gap-2 text-center md:col-span-1 md:row-start-1 md:col-start-2">
            <p className="text-[12px] font-semibold uppercase text-muted-warm">Venue gallery</p>
            <h1 className="font-heading text-[32px] font-semibold text-ink-strong sm:text-[42px]">{venue.name}</h1>
            <p className="text-[13px] text-muted-warm">
              {venue.tagline} · {venue.area}, {venue.city}
            </p>
          </div>
          <p className="justify-self-end rounded-full bg-surface px-3.5 py-[9px] text-[13px] font-medium text-ink-strong md:col-start-3 md:row-start-1">
            {venue.images.length} photos
          </p>
        </div>

        {venue.gallery.length > 1 && (
          <nav aria-label="Halls">
            <ul className="flex flex-wrap justify-center gap-x-[58px] gap-y-3">
              {venue.gallery.map((g, index) => {
                const active = index === hallIndex
                return (
                  <li key={g.hallId}>
                    <Link
                      to={`?hall=${index + 1}`}
                      replace
                      aria-current={active ? 'true' : undefined}
                      title={venue.halls.find((h) => h.hallId === g.hallId)?.name}
                      className={`font-heading flex flex-col items-center gap-2 text-[18px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${
                        active ? 'font-semibold text-ink-strong' : 'text-muted-warm hover:text-ink-strong'
                      }`}
                    >
                      Hall {index + 1}
                      <span aria-hidden className={`h-0.5 w-full ${active ? 'bg-ink-strong' : 'bg-transparent'}`} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        )}
      </header>

      <hr className="border-line" />

      <div className="page-container flex flex-col gap-8 pt-14">
        {hallGallery ? (
          <>
            <p className="sr-only" role="status">{`Showing Hall ${hallIndex + 1}: ${hall.name}`}</p>
            {hallGallery.sections.map((section, index) => {
              const copy = GALLERY_SECTIONS.find((s) => s.key === section.key)
              if (!copy || section.images.length === 0) return null
              return (
                <GallerySection
                  key={section.key}
                  number={index + 1}
                  total={hallGallery.sections.length}
                  section={section}
                  copy={copy}
                  detail={copy.detail(venue, hall)}
                  photoNumber={(image) => hallImages.indexOf(image) + 1}
                  photoCount={hallImages.length}
                  onOpen={openPhoto}
                />
              )
            })}
          </>
        ) : (
          <p className="py-16 text-center text-[15px] text-muted-warm">This venue hasn’t added photos yet.</p>
        )}
      </div>

      {viewerIndex !== null && (
        <Lightbox images={hallImages} index={viewerIndex} onIndexChange={changeViewerIndex} onClose={() => setViewer(null)} returnFocusTo={viewer.opener} />
      )}
    </div>
  )
}

const pad = (n) => String(n).padStart(2, '0')

// One editorial row (Figma 94:4 / 90:1101): copy on the left, photos on the right. Four-photo grids alternate
// which side the wide photo is on, like the frame.
function GallerySection({ number, total, section, copy, detail, photoNumber, photoCount, onOpen }) {
  const wideFirst = number % 2 === 0
  const headingId = `section-${section.key}`
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 lg:h-[516px] lg:flex-row lg:gap-[58px]">
        <div className="flex shrink-0 flex-col justify-between gap-4 lg:w-[270px]">
          <div className="flex flex-col gap-3.5">
            <p className="text-[12px] font-semibold text-primary">
              {pad(number)} / {pad(total)}
            </p>
            <h2 id={headingId} className="font-heading text-[28px] font-semibold text-ink-strong">{copy.title}</h2>
            <p className="text-[15px] leading-[1.55] text-muted-warm">{copy.description}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span aria-hidden className="h-px w-8 bg-outline-strong" />
            <p className="text-[13px] font-medium text-ink-strong">{detail}</p>
          </div>
        </div>

        {section.images.length === 1 ? (
          <Photo image={section.images[0]} label={`Open photo ${photoNumber(section.images[0])} of ${photoCount}`} onOpen={onOpen} width={992} height={516} className="h-[240px] sm:h-[360px] lg:h-full lg:flex-1" />
        ) : (
          <div className="grid min-w-0 flex-1 grid-rows-2 gap-3 sm:h-[440px] lg:h-full">
            {[0, 2].map((start, row) => {
              const wideLeft = wideFirst ? row === 0 : row === 1
              return (
                <div key={start} className={`grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-[600fr_380fr] ${wideLeft ? '' : 'sm:grid-cols-[380fr_600fr]'}`}>
                  {section.images.slice(start, start + 2).map((image, i) => (
                    <Photo key={image.imageId} image={image} label={`Open photo ${photoNumber(image)} of ${photoCount}`} onOpen={onOpen} width={(i === 0) === wideLeft ? 600 : 380} height={252} className="h-[200px] sm:h-auto" />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <hr className="border-line" />
    </section>
  )
}

// Each photo is a button that opens the lightbox, and the scroll/focus target for /photos#<imageId>.
function Photo({ image, label, onOpen, width, height, className = '' }) {
  return (
    <div id={image.imageId} className={`relative min-h-0 overflow-hidden rounded-[12px] bg-surface ${className}`}>
      <button
        type="button"
        onClick={(event) => onOpen(image.imageId, event.currentTarget)}
        aria-label={`${label}: ${image.alt}`}
        className="group block size-full cursor-zoom-in rounded-[12px] outline-none focus:ring-4 focus:ring-inset focus:ring-primary"
      >
        <img src={image.imageUrl} alt={image.alt} width={width} height={height} loading="lazy" decoding="async" className="size-full object-cover transition-opacity duration-200 group-hover:opacity-90 motion-reduce:transition-none" />
      </button>
    </div>
  )
}

function PhotosSkeleton() {
  const block = 'rounded-[12px] bg-surface motion-safe:animate-pulse'
  return (
    <div aria-busy="true" aria-label="Loading photos" className="page-container flex flex-col gap-10 py-14">
      <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-3">
        <div className={`${block} h-3 w-24`} />
        <div className={`${block} h-10 w-full`} />
        <div className={`${block} h-3 w-3/4`} />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-6 lg:h-[516px] lg:flex-row lg:gap-[58px]">
          <div className={`${block} h-32 lg:h-full lg:w-[270px]`} />
          <div className={`${block} h-[240px] flex-1 lg:h-full`} />
        </div>
      ))}
    </div>
  )
}
