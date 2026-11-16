import { Link } from 'react-router-dom'
import { useWizard } from '../WizardContext.js'
import { StepHeading } from '../fields.jsx'
import { usePhotoUrls } from '../photoStore.js'
import { deriveVenueType, formatAddress } from '../draft.js'
import { ADD_ON_TYPES, AMENITY_LABELS, CANCELLATION_POLICIES, EVENT_TYPES, HALL_SETTINGS, SLOT_TYPES, VENUE_CATEGORIES, WEEKDAYS } from '../options.js'
import { formatAmount } from '../../../lib/money.js'

// Summary of every answer with an Edit link back to its step (?from=review brings the host straight back here).
const label = (list, value) => list.find((item) => item.value === value)?.label ?? value
const number = (text) => Number(text).toLocaleString('en-US')

// "19:00" -> "7:00 PM"
function time12(value) {
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export default function ReviewStep() {
  const { draft } = useWizard()
  const { venue, halls, venueImages, menuPackages, addOns, customMenu, bookingRules } = draft
  const cover = venueImages.find((image) => image.isCover)
  const photos = usePhotoUrls(cover ? [cover.imageId] : [])
  const facilities = [...venue.facilities.map((key) => AMENITY_LABELS[key]), ...venue.customFacilities]
  const workingDays = bookingRules.days.length === 7 ? 'Every day' : bookingRules.days.map((d) => label(WEEKDAYS, d).slice(0, 3)).join(', ')
  const venueType = label(HALL_SETTINGS, deriveVenueType(halls))

  return (
    <>
      <StepHeading title="Review your listing" subtitle="Check everything once more. When you submit, our team verifies your listing before customers can see it." />

      <article className="mb-8 overflow-hidden rounded-3xl border border-line shadow-card">
        {cover && photos.url(cover.imageId) ? (
          <img src={photos.url(cover.imageId)} alt={`Cover photo of ${venue.name}`} width="800" height="450" className="aspect-[16/9] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-surface text-[15px] text-muted-warm">No cover photo</div>
        )}
        <div className="p-5 sm:p-6">
          <p className="text-[14px] font-medium text-muted-warm">
            {label(VENUE_CATEGORIES, venue.category)} · {venue.area}, {venue.city}
          </p>
          <h2 className="mt-1 font-heading text-[22px] font-semibold text-ink-strong">{venue.headline}</h2>
          <p className="mt-1 text-[15px] text-ink">{venue.name}</p>
        </div>
      </article>

      <div className="grid gap-4">
        <Summary title="Venue type" step="venue-type">
          {label(VENUE_CATEGORIES, venue.category)} · {venueType} (from your halls)
        </Summary>
        <Summary title="Venue name" step="name">
          {venue.name}
        </Summary>
        <Summary title="Address" step="location">
          {formatAddress(venue)}
        </Summary>
        <Summary title="Map pin" step="pin">
          <span className="tabular-nums">
            {venue.lat?.toFixed(5)}, {venue.lng?.toFixed(5)}
          </span>
          {venue.googleMapsUrl && <span className="block break-all text-muted-warm">{venue.googleMapsUrl}</span>}
        </Summary>
        <Summary title={`Halls (${halls.length})`} step="halls">
          <ul className="grid gap-1">
            {halls.map((hall) => (
              <li key={hall.hallId}>
                <span className="font-medium text-ink-strong">{hall.name}</span> · {number(hall.capacity)} seated
                {hall.standingCapacity && ` · ${number(hall.standingCapacity)} standing`} · {label(HALL_SETTINGS, hall.setting)}
                {hall.hasAc ? ' · AC' : ''}
              </li>
            ))}
          </ul>
        </Summary>
        <Summary title="Events" step="events">
          {venue.supportedEvents.map((e) => label(EVENT_TYPES, e)).join(', ')}
        </Summary>
        <Summary title="Amenities" step="amenities">
          {facilities.length ? facilities.join(', ') : 'None selected'}
        </Summary>
        <Summary title="Photos" step="photos">
          {venueImages.length} photos · {halls.length} {halls.length === 1 ? 'hall' : 'halls'} covered · cover chosen
        </Summary>
        <Summary title="Title and description" step="title">
          <span className="block font-medium text-ink-strong">{venue.headline}</span>
          <span className="mt-1 line-clamp-3 block whitespace-pre-line">{venue.description}</span>
        </Summary>
        <Summary title={`Menu packages (${menuPackages.length})`} step="menus">
          <ul className="grid gap-1">
            {menuPackages.map((menu) => (
              <li key={menu.menuId}>
                <span className="font-medium text-ink-strong">{menu.name}</span> · <span className="tabular-nums">{formatAmount(menu.pricePerHead, 'Rs.')}</span> per guest · from{' '}
                {number(menu.minGuests)} guests · {menu.items.length} dishes
              </li>
            ))}
          </ul>
        </Summary>
        <Summary title="Custom menus and add-ons" step="custom">
          <span className="block">
            {customMenu.accepts
              ? `Custom requests accepted for ${menuPackages.filter((m) => m.isCustomizable).map((m) => m.name).join(', ') || 'no packages yet'}`
              : 'No custom menu requests'}
          </span>
          <span className="block">
            {addOns.length
              ? addOns.map((a) => `${a.name} (${label(ADD_ON_TYPES, a.type)}, ${formatAmount(a.price, 'Rs.')})`).join(', ')
              : 'No add-ons'}
          </span>
        </Summary>
        <Summary title="Booking rules" step="rules">
          <span className="block">{workingDays}</span>
          <span className="block">
            {SLOT_TYPES.filter((s) => bookingRules.slots[s.value].enabled)
              .map((s) => `${s.label} ${time12(bookingRules.slots[s.value].start)}–${time12(bookingRules.slots[s.value].end)}`)
              .join(' · ')}
          </span>
          <span className="block">
            {bookingRules.advancePercent}% advance · {label(CANCELLATION_POLICIES, bookingRules.cancellationPolicy)} cancellation
          </span>
        </Summary>
      </div>

      <p className="mt-8 rounded-2xl bg-surface p-5 text-[15px] leading-relaxed text-ink">
        After you submit, your listing is <strong className="text-ink-strong">Pending verification</strong>. Our team checks the details and every photo, then
        approves it or tells you what to fix. Customers can’t see or book it until it’s approved.
      </p>
    </>
  )
}

function Summary({ title, step, children }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line p-5">
      <div className="min-w-0 text-[15px] leading-relaxed text-ink">
        <h3 className="mb-1 text-[16px] font-semibold text-ink-strong">{title}</h3>
        {children}
      </div>
      <Link
        to={`/host/new/${step}?from=review`}
        className="shrink-0 rounded-md px-1 text-[15px] font-medium text-ink-strong underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
      >
        Edit<span className="sr-only"> {title.toLowerCase()}</span>
      </Link>
    </div>
  )
}
