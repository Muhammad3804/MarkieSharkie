import { lazy, Suspense, useEffect, useState } from 'react'
import { useWizard } from '../WizardContext.js'
import { ChoiceCard, Counter, ErrorText, SelectField, StepHeading, Switch, TextArea, TextField } from '../fields.jsx'
import { fieldId } from '../fieldStyles.js'
import { CITIES, EVENT_TYPES, HALL_SETTINGS, PAKISTAN_BOUNDS, VENUE_CATEGORIES } from '../options.js'
import { cityCenter, ensureCover, formatAddress, hallArea, newHall } from '../draft.js'
import { deletePhotos } from '../photoStore.js'
import HostIcon from '../icons.jsx'

// Phase 1 questions: venue type, name, address, map pin, halls, events.
const PinMap = lazy(() => import('./PinMap.jsx'))

const setVenue = (patch) => (draft) => ({ ...draft, venue: { ...draft.venue, ...patch } })

export function VenueTypeStep() {
  const { draft, update, errorFor } = useWizard()
  return (
    <>
      <StepHeading title="Which of these best describes your venue?" />
      <fieldset aria-describedby={errorFor('venue.category') ? 'field-venue-category-error' : undefined}>
        <legend className="sr-only">Venue type</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {VENUE_CATEGORIES.map((option) => (
            <ChoiceCard
              key={option.value}
              name="venue-category"
              value={option.value}
              icon={option.icon}
              label={option.label}
              checked={draft.venue.category === option.value}
              onChange={() => update(setVenue({ category: option.value }))}
              className="min-h-[120px]"
            />
          ))}
        </div>
      </fieldset>
      <ErrorText id="field-venue-category-error">{errorFor('venue.category')}</ErrorText>
    </>
  )
}

export function NameStep() {
  const { draft, update } = useWizard()
  return (
    <>
      <StepHeading title="What’s your venue called?" subtitle="Use the name on your signboard, so guests recognise it when they arrive." />
      <TextField
        path="venue.name"
        label="Venue name"
        value={draft.venue.name}
        onChange={(name) => update(setVenue({ name }))}
        placeholder="e.g. Chenab Palace Marquee…"
        autoComplete="organization"
        maxLength={80}
        inputClassName="h-16 text-[20px]"
      />
      <TextField
        path="venue.hostingSince"
        label="Hosting events since"
        optional
        hint="The year you started hosting events. Your listing shows how many years that is."
        value={draft.venue.hostingSince}
        onChange={(hostingSince) => update(setVenue({ hostingSince: hostingSince.replace(/\D/g, '').slice(0, 4) }))}
        placeholder="e.g. 2012…"
        inputMode="numeric"
        className="mt-8 max-w-xs"
      />
    </>
  )
}

export function DirectionsStep() {
  const { draft, update } = useWizard()
  const { venue } = draft
  return (
    <>
      <StepHeading title="Help guests find you" subtitle="Optional. Your listing shows how far you are from a landmark, and how to get in on the day." />
      <div className="grid gap-6">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TextField
            path="venue.landmark"
            label="Nearest landmark"
            optional
            value={venue.landmark}
            onChange={(landmark) => update(setVenue({ landmark }))}
            maxLength={80}
            placeholder="e.g. Clock Tower…"
          />
          <TextField
            path="venue.landmarkMinutes"
            label="Minutes by car"
            optional
            value={venue.landmarkMinutes}
            onChange={(landmarkMinutes) => update(setVenue({ landmarkMinutes: landmarkMinutes.replace(/\D/g, '').slice(0, 3) }))}
            inputMode="numeric"
            placeholder="e.g. 15…"
          />
        </div>
        {venue.landmark.trim() && /^\d+$/.test(venue.landmarkMinutes) && (
          <p className="-mt-2 text-[14px] text-muted-warm">
            Shows as “{venue.landmarkMinutes} min from {venue.landmark.trim()}”.
          </p>
        )}
        <TextArea
          path="venue.directions"
          label="Getting there"
          value={venue.directions}
          onChange={(directions) => update(setVenue({ directions }))}
          maxLength={500}
          rows={4}
          hint="Optional. Which gate to use, where drivers drop guests, and where to park."
          placeholder="e.g. Use Gate 2 on Canal Road. Drivers can drop guests at the porch; parking is behind the hall…"
        />
      </div>
    </>
  )
}

export function BridalSuiteStep() {
  const { draft, update } = useWizard()
  const suite = draft.bridalSuite
  const setSuite = (patch) => update((current) => ({ ...current, bridalSuite: { ...current.bridalSuite, ...patch } }))
  const area = hallArea(suite)
  return (
    <>
      <StepHeading title="Do you have a bridal suite?" subtitle="A private room where the bride and family get ready. It’s shown with your halls but isn’t booked on its own." />
      <div className="rounded-3xl border border-line p-5 sm:p-7">
        <Switch id="bridal-suite-enabled" label="We have a bridal suite" checked={suite.enabled} onChange={(enabled) => setSuite({ enabled })} />
        {suite.enabled && (
          <div className="mt-6 grid gap-6 border-t border-line pt-6">
            <TextField path="bridalSuite.name" label="Name" value={suite.name} onChange={(name) => setSuite({ name })} maxLength={60} />
            <TextField
              path="bridalSuite.capacity"
              label="People it fits"
              value={suite.capacity}
              onChange={(capacity) => setSuite({ capacity: digits(capacity).slice(0, 3) })}
              inputMode="numeric"
              placeholder="e.g. 20…"
              className="max-w-xs"
            />
            <fieldset>
              <legend className="mb-2 text-[15px] font-medium text-ink-strong">
                Size <span className="font-normal text-muted-warm">(optional)</span>
              </legend>
              <div className="grid grid-cols-2 gap-4 sm:max-w-md">
                <TextField path="bridalSuite.lengthFt" label="Length" suffix="ft" value={suite.lengthFt} onChange={(lengthFt) => setSuite({ lengthFt: digits(lengthFt).slice(0, 3) })} inputMode="numeric" />
                <TextField path="bridalSuite.widthFt" label="Width" suffix="ft" value={suite.widthFt} onChange={(widthFt) => setSuite({ widthFt: digits(widthFt).slice(0, 3) })} inputMode="numeric" />
              </div>
              {area && <p className="mt-2 text-[14px] text-muted-warm">{area.toLocaleString('en-US')} sq ft</p>}
            </fieldset>
            <TextArea
              path="bridalSuite.description"
              label="Description"
              value={suite.description}
              onChange={(description) => setSuite({ description })}
              maxLength={300}
              rows={3}
              hint="Optional. Mirrors, lounge seating, a private entrance…"
            />
          </div>
        )}
      </div>
    </>
  )
}

export function LocationStep() {
  const { draft, update } = useWizard()
  const { venue } = draft
  // A new city moves the pin to that city's centre on the next step (unless the host already placed it there).
  function changeCity(city) {
    update((current) => {
      const next = setVenue({ city })(current)
      if (city !== current.venue.city) return setVenue({ lat: null, lng: null })(next)
      return next
    })
  }
  return (
    <>
      <StepHeading title="Where’s your venue located?" subtitle="We list venues across Pakistan. You’ll confirm the exact spot on a map next." />
      <div className="grid gap-6">
        <SelectField path="venue.city" label="City" value={venue.city} onChange={changeCity} options={CITIES} placeholder="Select a city" />
        <TextField
          path="venue.street"
          label="Street address"
          value={venue.street}
          onChange={(street) => update(setVenue({ street }))}
          placeholder="e.g. Plot 12, West Canal Road…"
          autoComplete="address-line1"
          maxLength={160}
        />
        <div className="grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TextField
            path="venue.area"
            label="Area / locality"
            value={venue.area}
            onChange={(area) => update(setVenue({ area }))}
            placeholder="e.g. Madina Town…"
            autoComplete="address-level3"
            maxLength={80}
          />
          <TextField
            path="venue.postalCode"
            label="Postal code"
            optional
            value={venue.postalCode}
            onChange={(postalCode) => update(setVenue({ postalCode: postalCode.replace(/\D/g, '').slice(0, 5) }))}
            placeholder="38000"
            inputMode="numeric"
            autoComplete="postal-code"
          />
        </div>
      </div>
    </>
  )
}

export function PinStep() {
  const { draft, update } = useWizard()
  const { venue } = draft
  const [status, setStatus] = useState('')

  // First visit: drop the pin on the city centre so the host only has to nudge it.
  useEffect(() => {
    const center = cityCenter(venue.city)
    if (venue.lat == null && center) update(setVenue({ lat: center.lat, lng: center.lng }))
  }, [venue.lat, venue.city, update])

  const move = (lat, lng) => update(setVenue({ lat: round(lat), lng: round(lng) }))

  function locateMe() {
    if (!navigator.geolocation) {
      setStatus('Your browser can’t share its location. Drag the pin instead.')
      return
    }
    setStatus('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords
        const inPakistan = lat >= PAKISTAN_BOUNDS.minLat && lat <= PAKISTAN_BOUNDS.maxLat && lng >= PAKISTAN_BOUNDS.minLng && lng <= PAKISTAN_BOUNDS.maxLng
        if (!inPakistan) {
          setStatus('Your location is outside Pakistan, so the pin didn’t move. Drag it onto your venue.')
          return
        }
        move(lat, lng)
        setStatus('Pin moved to your location. Drag it if it isn’t exactly right.')
      },
      (error) =>
        setStatus(
          error.code === error.PERMISSION_DENIED
            ? 'Location access is blocked. Allow it in your browser settings, or drag the pin.'
            : 'We couldn’t find your location. Drag the pin instead.',
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <>
      <StepHeading title="Is the pin in the right spot?" subtitle="Customers use this pin for directions on the day of the event." />
      <div className="relative overflow-hidden rounded-3xl border border-line">
        <p className="absolute inset-x-3 top-3 z-[500] flex items-center gap-3 rounded-full bg-white px-4 py-3 text-[15px] text-ink-strong shadow-search sm:inset-x-4 sm:top-4 sm:px-5">
          <HostIcon name="pin" className="size-5 shrink-0 text-primary" />
          <span className="truncate">{formatAddress(venue) || 'Your venue'}</span>
        </p>
        <Suspense fallback={<div className="h-[360px] bg-map sm:h-[440px]" aria-label="Loading map" />}>
          {venue.lat != null && <PinMap lat={venue.lat} lng={venue.lng} onMove={move} />}
        </Suspense>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={locateMe}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-outline-strong px-4 text-[15px] font-medium text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <HostIcon name="locate" className="size-5" />
          Use my location
        </button>
        <p className="text-[14px] text-muted-warm">Drag the pin, click the map, or focus the pin and use the arrow keys.</p>
      </div>
      <p role="status" className="mt-3 min-h-5 text-[14px] text-ink">
        {status}
      </p>
      <TextField
        path="venue.googleMapsUrl"
        label="Google Maps link"
        optional
        hint="Open your venue in Google Maps, tap Share and paste the link here."
        value={venue.googleMapsUrl}
        onChange={(googleMapsUrl) => update(setVenue({ googleMapsUrl }))}
        placeholder="https://maps.app.goo.gl/…"
        type="url"
        spellCheck={false}
        autoComplete="url"
        inputMode="url"
        className="mt-6"
      />
    </>
  )
}

// ~11 cm precision is plenty for a venue pin and keeps the draft tidy.
const round = (value) => Math.round(value * 1e6) / 1e6

export function HallsStep() {
  const { draft, update, errorFor } = useWizard()
  const { halls } = draft

  function setCount(count) {
    if (count > halls.length) {
      update((current) => ({ ...current, halls: [...current.halls, newHall(current.halls.length)] }))
      return
    }
    const removed = halls[halls.length - 1]
    const photoIds = draft.venueImages.filter((image) => image.hallId === removed.hallId).map((image) => image.imageId)
    const files = [
      photoIds.length && `${photoIds.length} photo${photoIds.length === 1 ? '' : 's'}`,
      removed.floorPlan && 'floor plan',
      removed.walkthrough.file && '3D file',
    ].filter(Boolean)
    if (files.length && !window.confirm(`Remove ${removed.name || 'the last hall'} and its ${files.join(', ')}?`)) return
    update((current) => ({
      ...current,
      halls: current.halls.slice(0, -1),
      venueImages: ensureCover(current.venueImages.filter((image) => image.hallId !== removed.hallId)),
    }))
    // Its photos, floor plan and 3D file go with it.
    const fileIds = [...photoIds, removed.floorPlan?.fileId, removed.walkthrough.file?.fileId].filter(Boolean)
    if (fileIds.length) deletePhotos(fileIds)
  }

  const setHall = (index, patch) =>
    update((current) => ({ ...current, halls: current.halls.map((hall, i) => (i === index ? { ...hall, ...patch } : hall)) }))

  return (
    <>
      <StepHeading title="Tell us about your halls" subtitle="Add every hall that can host an event on its own. You can add more later." />
      <div className="border-b border-line pb-6">
        <Counter label="Halls" value={halls.length} min={1} max={10} onChange={setCount} />
      </div>
      <div className="mt-8 grid gap-8">
        {halls.map((hall, index) => (
          <fieldset key={hall.hallId} className="rounded-3xl border border-line p-5 sm:p-7">
            <legend className="px-2 font-heading text-[20px] font-semibold text-ink-strong">Hall {index + 1}</legend>
            <div className="grid gap-6">
              <TextField path={`halls.${index}.name`} label="Hall name" value={hall.name} onChange={(name) => setHall(index, { name })} maxLength={60} placeholder="e.g. Grand Ballroom…" />
              <div className="grid gap-6 sm:grid-cols-2">
                <TextField
                  path={`halls.${index}.capacity`}
                  label="Seated capacity"
                  value={hall.capacity}
                  onChange={(capacity) => setHall(index, { capacity: digits(capacity) })}
                  inputMode="numeric"
                  placeholder="e.g. 500…"
                  hint="Guests seated at tables"
                />
                <TextField
                  path={`halls.${index}.standingCapacity`}
                  label="Standing capacity"
                  optional
                  value={hall.standingCapacity}
                  onChange={(standingCapacity) => setHall(index, { standingCapacity: digits(standingCapacity) })}
                  inputMode="numeric"
                  placeholder="e.g. 800…"
                  hint="Guests at a standing reception"
                />
              </div>
              <fieldset>
                <legend className="mb-2 text-[15px] font-medium text-ink-strong">Setting</legend>
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface p-1">
                  {HALL_SETTINGS.map((setting) => (
                    <label
                      key={setting.value}
                      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-[14px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary sm:text-[15px] ${
                        hall.setting === setting.value ? 'bg-white text-primary shadow-chip' : 'text-ink hover:text-ink-strong'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`hall-setting-${hall.hallId}`}
                        value={setting.value}
                        checked={hall.setting === setting.value}
                        onChange={() => setHall(index, { setting: setting.value })}
                        className="sr-only"
                      />
                      {setting.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Switch id={`hall-ac-${hall.hallId}`} label="Air conditioned" checked={hall.hasAc} onChange={(hasAc) => setHall(index, { hasAc })} />
              <fieldset>
                <legend className="mb-1 text-[15px] font-medium text-ink-strong">Size</legend>
                <p className="mb-3 text-[14px] text-muted-warm">In feet. Approximate is fine; we use it for the floor area and the 3D model.</p>
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <TextField path={`halls.${index}.lengthFt`} label="Length" suffix="ft" value={hall.lengthFt} onChange={(lengthFt) => setHall(index, { lengthFt: digits(lengthFt).slice(0, 4) })} inputMode="numeric" inputClassName="pr-10" />
                  <TextField path={`halls.${index}.widthFt`} label="Width" suffix="ft" value={hall.widthFt} onChange={(widthFt) => setHall(index, { widthFt: digits(widthFt).slice(0, 4) })} inputMode="numeric" inputClassName="pr-10" />
                  <TextField path={`halls.${index}.ceilingFt`} label="Ceiling" suffix="ft" value={hall.ceilingFt} onChange={(ceilingFt) => setHall(index, { ceilingFt: digits(ceilingFt).slice(0, 3) })} inputMode="numeric" inputClassName="pr-10" />
                </div>
                {/* Read out when it changes, so screen reader users hear the calculated area. */}
                <p aria-live="polite" className="mt-3 text-[15px] text-ink">
                  {hallArea(hall) ? (
                    <>
                      Floor area: <strong className="font-semibold tabular-nums text-ink-strong">{hallArea(hall).toLocaleString('en-US')} sq ft</strong>
                    </>
                  ) : (
                    <span className="text-muted-warm">Floor area appears once you add the length and width.</span>
                  )}
                </p>
              </fieldset>
              <TextArea
                path={`halls.${index}.description`}
                label="Description"
                value={hall.description}
                onChange={(description) => setHall(index, { description })}
                maxLength={300}
                rows={3}
                hint="Optional. What the hall is best for: stage, lighting, family seating…"
              />
            </div>
          </fieldset>
        ))}
      </div>
      <ErrorText id="field-halls-error">{errorFor('halls')}</ErrorText>
    </>
  )
}

const digits = (text) => text.replace(/\D/g, '').slice(0, 5)

export function EventsStep() {
  const { draft, update, errorFor } = useWizard()
  const selected = new Set(draft.venue.supportedEvents)
  const toggle = (value) =>
    update((current) => {
      const events = new Set(current.venue.supportedEvents)
      if (events.has(value)) events.delete(value)
      else events.add(value)
      // Keep the enum order so the summary reads the same every time.
      return setVenue({ supportedEvents: EVENT_TYPES.map((e) => e.value).filter((v) => events.has(v)) })(current)
    })
  const error = errorFor('venue.supportedEvents')
  return (
    <>
      <StepHeading title="What events do you host?" subtitle="Pick all that apply. Customers filter venues by event type." />
      <fieldset aria-describedby={error ? `${fieldId('venue.supportedEvents')}-error` : undefined}>
        <legend className="sr-only">Events hosted</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {EVENT_TYPES.map((event) => (
            <ChoiceCard
              key={event.value}
              type="checkbox"
              name="supported-events"
              value={event.value}
              label={event.label}
              checked={selected.has(event.value)}
              onChange={() => toggle(event.value)}
              className="min-h-[72px] justify-center pr-10"
            />
          ))}
        </div>
      </fieldset>
      <ErrorText id={`${fieldId('venue.supportedEvents')}-error`}>{error}</ErrorText>
    </>
  )
}
