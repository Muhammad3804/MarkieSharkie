import { useRef } from 'react'
import Button from '../../components/ui/Button.jsx'
import VenueCard from './VenueCard.jsx'
import arrowRightIcon from '../../assets/icons/arrow-right.svg'

// Cards a 1536px-wide row shows before scrolling sideways; these load straight away in every row.
const VISIBLE_CARDS = 4

// Header sits in the page container; the cards start at the same left edge, scroll sideways and bleed to the right.
export default function VenueRow({ section }) {
  const scroller = useRef(null)
  const headingId = `${section.id}-heading`

  function scrollRight() {
    scroller.current?.scrollBy({ left: 420, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="page-container flex items-center justify-between gap-4">
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
        className="scrollbar-none flex snap-x gap-5 overflow-x-auto page-inset-left pb-12 pr-[var(--page-gutter)] pt-4"
      >
        {section.venues.map((venue, index) => (
          <VenueCard key={venue.id} venue={venue} eager={index < VISIBLE_CARDS} />
        ))}
      </div>
    </section>
  )
}
