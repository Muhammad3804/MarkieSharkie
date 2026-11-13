import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useVenue } from '../features/venues/useVenue.js'
import Button from '../components/ui/Button.jsx'
import Gallery from '../components/venue/Gallery.jsx'
import { VENUE_TABS } from '../features/venues/constants.js'
import SectionTabs from '../components/venue/SectionTabs.jsx'
import ListingSummary from '../components/venue/ListingSummary.jsx'
import HostRow from '../components/venue/HostRow.jsx'
import TrustDetails from '../components/venue/TrustDetails.jsx'
import AboutSection from '../components/venue/AboutSection.jsx'
import AmenityList from '../components/venue/AmenityList.jsx'
import AvailabilityCalendar from '../components/venue/AvailabilityCalendar.jsx'
import ReviewsSection from '../components/venue/ReviewsSection.jsx'
import LocationSection from '../components/venue/LocationSection.jsx'
import EventNotes from '../components/venue/EventNotes.jsx'
import HallCard from '../components/venue/HallCard.jsx'
import MenuCard from '../components/venue/MenuCard.jsx'
import BookingSidebar from '../components/venue/BookingSidebar.jsx'
import VenueDetailSkeleton from '../components/venue/VenueDetailSkeleton.jsx'
import { defaultGuests } from '../lib/booking.js'
import { formatAmount } from '../lib/money.js'

// Venue detail page (Figma frames 44:992 Overview, 65:692 Halls, 71:2 Menu, 73:2 Availability, 69:63 Reviews).
// One generic page for every venue: the id comes from the URL and the data from the api/ layer.
export default function VenueDetail() {
  const { id } = useParams()
  const { status, venue, reload } = useVenue(id)

  if (status === 'loading') return <VenueDetailSkeleton />
  if (status === 'not-found') return <VenueMessage title="Venue not found" body="This venue doesn’t exist or is no longer listed. It may have been removed by its owner." />
  if (status === 'error') return <VenueMessage title="Couldn’t load this venue" body="Something went wrong while loading the venue. Check your connection and try again." onRetry={reload} />
  return <VenueDetailView key={venue.id} venue={venue} />
}

function VenueMessage({ title, body, onRetry }) {
  return (
    <div className="page-container flex flex-col items-start gap-4 py-24">
      <title>{`${title} · MarkieSharkie`}</title>
      <h1 className="font-heading text-[28px] font-bold text-ink-strong">{title}</h1>
      <p className="max-w-[560px] text-[15px] text-muted-warm">{body}</p>
      <div className="flex gap-3">
        {onRetry && <Button onClick={onRetry} className="px-5 py-2.5">Try again</Button>}
        <Button to="/" variant={onRetry ? 'outline' : 'primary'} className="px-5 py-2.5">Back to home</Button>
        {!onRetry && <Button to="/search" variant="outline" className="px-5 py-2.5">Browse venues</Button>}
      </div>
    </div>
  )
}

const Divider = () => <hr className="border-line" />

function VenueDetailView({ venue }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = VENUE_TABS.some((t) => t.id === requested) ? requested : 'overview'

  const [booking, setBooking] = useState(() => ({
    date: '',
    slot: 'evening',
    guests: defaultGuests(venue.minGuests, venue.capacity),
    hallId: '',
    menuId: '',
  }))
  const updateBooking = useCallback((changes) => setBooking((current) => ({ ...current, ...changes })), [])
  const selectDate = useCallback((date) => updateBooking({ date }), [updateBooking])

  // Switch tab without dropping other query params; optionally scroll back up to the tab bar.
  const tabsRef = useRef(null)
  const showTab = useCallback(
    (next, { scrollToTabs = false } = {}) => {
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params)
          if (next === 'overview') updated.delete('tab')
          else updated.set('tab', next)
          return updated
        },
        { preventScrollReset: true },
      )
      if (scrollToTabs) tabsRef.current?.scrollIntoView({ block: 'start' })
    },
    [setSearchParams],
  )

  // "Select a date" in the sidebar jumps to the calendar, switching to the Availability tab when needed.
  const calendarRef = useRef(null)
  const scrollAfterTabChange = useRef(false)
  function scrollToCalendar() {
    const calendarEl = calendarRef.current
    if (!calendarEl) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    calendarEl.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    calendarEl.querySelector('td button:not([disabled])')?.focus({ preventScroll: true })
  }
  function pickDate() {
    if (tab === 'overview' || tab === 'availability') return scrollToCalendar()
    scrollAfterTabChange.current = true
    showTab('availability')
  }
  useEffect(() => {
    if (!scrollAfterTabChange.current) return
    scrollAfterTabChange.current = false
    scrollToCalendar()
  }, [tab])

  const calendar = (title) => (
    <AvailabilityCalendar ref={calendarRef} title={title} bookedDates={venue.bookedDates} selectedDate={booking.date} onSelect={selectDate} />
  )
  const tabLabel = VENUE_TABS.find((t) => t.id === tab).label

  return (
    <div className="page-container pb-14">
      <title>{`${venue.name} in ${venue.city} · MarkieSharkie`}</title>
      <meta
        name="description"
        content={`${venue.name}, ${venue.area}, ${venue.city}. ${venue.highlights}. Up to ${venue.capacity} guests, menus from ${formatAmount(venue.priceFrom, 'Rs')} per guest. Rated ${venue.avgRating.toFixed(2)} from ${venue.reviewCount} reviews.`}
      />

      <Gallery venue={venue} />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,808px)_416px] lg:justify-between">
        <div ref={tabsRef} className="min-w-0">
          <SectionTabs active={tab} />
          <p role="status" className="sr-only">{`${tabLabel} section`}</p>
          <div className="flex flex-col gap-8 pt-4">
            {tab === 'overview' && (
              <>
                <ListingSummary venue={venue} />
                <Divider />
                <HostRow venue={venue} />
                <Divider />
                <TrustDetails venue={venue} />
                <Divider />
                <AboutSection venue={venue} />
                <Divider />
                <AmenityList facilities={venue.facilities} />
                <Divider />
                {calendar()}
                <Divider />
                <ReviewsSection venue={venue} limit={4} onShowAll={() => showTab('reviews', { scrollToTabs: true })} />
                <Divider />
                <LocationSection venue={venue} />
                <Divider />
                <EventNotes notes={venue.eventNotes} />
              </>
            )}

            {tab === 'halls' && (
              <>
                <TabIntro title="Halls" body={`${venue.name} offers ${venue.halls.length} event spaces with dedicated arrival paths, flexible layouts and clear circulation for guests.`} />
                <Divider />
                <div className="flex flex-col gap-4">
                  {venue.halls.map((hall) => (
                    <HallCard key={hall.hallId} hall={hall} />
                  ))}
                </div>
              </>
            )}

            {tab === 'menu' && (
              <>
                <TabIntro title="Menu" body={`${venue.name} offers ${venue.menuPackages.length} catering packages with flexible service options, live stations and drinks for every event style. Prices are per guest.`} />
                <Divider />
                <div className="flex flex-col gap-4">
                  {venue.menuPackages.map((menu) => (
                    <MenuCard key={menu.menuId} menu={menu} />
                  ))}
                </div>
              </>
            )}

            {tab === 'availability' && (
              <>
                <ListingSummary venue={venue} title="Availability" subtitle="Check dates, review pricing, and see when the venue is open for your event." showStats={false} />
                {calendar()}
              </>
            )}

            {tab === 'reviews' && (
              <>
                <div className="flex flex-col gap-2">
                  <h2 className="font-heading text-[28px] font-bold text-ink-strong">Reviews</h2>
                  <p className="text-[15px] leading-[1.5] text-muted-warm">
                    See how couples and event planners rate the venue, service, and overall experience after hosting their celebration at {venue.name}.
                  </p>
                </div>
                <ReviewsSection venue={venue} />
              </>
            )}
          </div>
        </div>

        <aside aria-label="Book this venue" className="lg:sticky lg:top-[140px] lg:self-start lg:pt-[55px]">
          <BookingSidebar venue={venue} booking={booking} onChange={updateBooking} onPickDate={pickDate} />
        </aside>
      </div>
    </div>
  )
}

function TabIntro({ title, body }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-[20px] font-semibold text-ink-strong">{title}</h2>
      <p className="text-[15px] leading-[1.55] text-muted-warm">{body}</p>
    </div>
  )
}
