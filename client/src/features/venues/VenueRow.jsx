import { useRef } from 'react'
import Button from '../../components/ui/Button.jsx'
import VenueCard from './VenueCard.jsx'
import arrowRightIcon from '../../assets/icons/arrow-right.svg'

// Header is capped at the 1240px content width; the cards scroll sideways and bleed to the right edge.
export default function VenueRow({ section }) {
  const scroller = useRef(null)
  const headingId = `${section.id}-heading`

  function scrollRight() {
    scroller.current?.scrollBy({ left: 420, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="mx-auto flex w-full max-w-[1272px] items-center justify-between gap-4 px-4">
        <h2 id={headingId} className="text-[22px] font-bold text-ink sm:text-[28px]">{section.title}</h2>
        <div className="flex shrink-0 items-center gap-4">
          <Button variant="outline" to={`/search?section=${section.id}`} className="px-5 py-2">See All</Button>
          <Button aria-label={`Scroll ${section.title}`} onClick={scrollRight} className="px-3 py-2">
            <img src={arrowRightIcon} alt="" width="18" height="18" />
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        className="scrollbar-none flex snap-x gap-5 overflow-x-auto px-4 pb-12 pt-4 [scroll-padding-inline:1rem] xl:px-[calc((100vw-1240px)/2)] xl:[scroll-padding-inline:calc((100vw-1240px)/2)]"
      >
        {section.venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
      </div>
    </section>
  )
}
