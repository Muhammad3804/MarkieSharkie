import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SearchBar from '../features/search/SearchBar.jsx'
import VenueCard from '../features/venues/VenueCard.jsx'
import FiltersPanel from '../features/explore/FiltersPanel.jsx'
import FilterSheet from '../features/explore/FilterSheet.jsx'
import Pagination from '../features/explore/Pagination.jsx'
import { useVenueSearch } from '../features/explore/useVenueSearch.js'
import {
  AMENITY_FILTERS, CAPACITY_OPTIONS, EVENT_TYPES, SETTINGS, SIDEBAR_DEFAULTS, SORTS, countActiveFilters, parseFilters, toSearchParams,
} from '../features/explore/filters.js'
import { formatEventDate } from '../lib/format.js'
import Button from '../components/ui/Button.jsx'
import searchIcon from '../assets/icons/search.svg'
import mapIcon from '../assets/icons/venue/map.svg'
import gridIcon from '../assets/icons/venue/layout-grid.svg'

const VenueMap = lazy(() => import('../features/explore/VenueMap.jsx'))
const NO_VENUES = []

function buildHref(filters, map) {
  const query = toSearchParams(filters)
  if (map) query.set('map', '1')
  return `?${query}`
}

const EVENT_NAMES = Object.fromEntries(EVENT_TYPES)
const toolButton =
  'inline-flex h-11 items-center gap-2 rounded-full border border-outline-strong bg-white px-4 text-[14px] font-medium text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// Explore / search results (REQ-12). No Figma frame: layout follows the landing page's tokens and VenueCard.
// Everything (search fields, filters, sort, page, map) lives in the URL; the landing search bar lands here
// (/search redirects to /explore with the same query).
export default function Explore() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const filters = useMemo(() => parseFilters(params), [params])
  const showMap = params.get('map') === '1'
  const { status, data, dataFilters, isFetching, reload } = useVenueSearch(filters)
  const [activeId, setActiveId] = useState(null)
  const [activeFor, setActiveFor] = useState(data)
  const resultsHeading = useRef(null)
  // Latest URL state for update(): two events in one frame (price blur, then a checkbox click) must not build the
  // second URL from the first one's stale render.
  const latest = useRef({ filters, showMap })
  useEffect(() => {
    latest.current = { filters, showMap }
  }, [filters, showMap])

  // New results: forget a hovered card that may no longer be on the page (mouseleave never fires for it).
  if (activeFor !== data) {
    setActiveFor(data)
    setActiveId(null)
  }
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchPanel = useRef(null)
  const searchSummary = useRef(null)
  const searchToggled = useRef(false)

  // Opening the mobile search moves focus to its first field; closing it hands focus back to the summary.
  useEffect(() => {
    if (!searchToggled.current) return
    if (searchOpen) searchPanel.current?.querySelector('input')?.focus()
    else searchSummary.current?.focus()
  }, [searchOpen])

  function toggleSearch(open) {
    searchToggled.current = true
    setSearchOpen(open)
  }

  // Filter changes replace the history entry (no back-button trail per checkbox) and keep the scroll position.
  // Any change goes back to page 1.
  const update = useCallback(
    (patch, { push = false } = {}) => {
      const next = { ...latest.current.filters, page: 1, ...patch }
      latest.current = { ...latest.current, filters: next }
      navigate(buildHref(next, latest.current.showMap), { replace: !push, preventScrollReset: true })
    },
    [navigate],
  )

  function toggleMap() {
    const map = !latest.current.showMap
    latest.current = { ...latest.current, showMap: map }
    navigate(buildHref(latest.current.filters, map), { replace: true, preventScrollReset: true })
  }

  // The pressed button goes away (a chip, the sidebar "Clear all"), so move focus to the results heading.
  function updateAndFocus(patch) {
    update(patch)
    resultsHeading.current?.focus()
  }

  // A page past the end (?page=99, or fewer results after going back) is corrected in the URL.
  useEffect(() => {
    if (data && !isFetching && data.page !== filters.page) {
      navigate(buildHref({ ...filters, page: data.page }, showMap), { replace: true, preventScrollReset: true })
    }
  }, [data, isFetching, filters, showMap, navigate])

  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const clearFilters = () => update(SIDEBAR_DEFAULTS)

  function handleSearch(values) {
    const { city, date, guests, eventType } = parseFilters(new URLSearchParams(values))
    update({ city, date, guests, eventType }, { push: true })
    if (searchOpen) toggleSearch(false)
  }

  const activeCount = countActiveFilters(filters)
  const total = data?.total ?? 0
  const searchKey = `${filters.city}|${filters.date}|${filters.guests}|${filters.eventType}`
  const sidebarVisibility = showMap ? 'hidden xl:block' : 'hidden lg:block'
  const filtersButtonVisibility = showMap ? 'xl:hidden' : 'lg:hidden'

  // Heading and subline describe the results on screen, which lag the URL while a new search loads.
  const shown = dataFilters ?? filters
  const heading = `${total.toLocaleString('en-US')} ${total === 1 ? 'venue' : 'venues'}${shown.city ? ` in ${shown.city}` : ''}`
  const subline = [
    shown.date && `Free on ${formatEventDate(shown.date)}`,
    shown.guests && `${shown.guests.toLocaleString('en-US')}+ guests`,
    shown.eventType && EVENT_NAMES[shown.eventType],
  ].filter(Boolean).join(' · ')

  const filtersPanel = <FiltersPanel filters={filters} priceRange={data?.priceRange} onChange={update} />

  return (
    <div className="page-container pb-16 pt-2">
      <title>{filters.city ? `Venues in ${filters.city} · MarkieSharkie` : 'Explore venues · MarkieSharkie'}</title>
      <meta name="description" content="Search marquees and event venues across Pakistan by city, date, guests, budget and amenities." />

      {/* Search: full bar from lg; on smaller screens a one-line summary that opens it. */}
      <div className="hidden justify-center lg:flex">
        <SearchBar key={searchKey} initial={filters} onSearch={handleSearch} />
      </div>
      <div className="lg:hidden">
        {searchOpen ? (
          <div ref={searchPanel} className="flex flex-col gap-2">
            <SearchBar key={searchKey} initial={filters} onSearch={handleSearch} />
            <button type="button" onClick={() => toggleSearch(false)} className="min-h-11 self-center px-3 text-[14px] font-medium text-ink-strong underline underline-offset-4">
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            ref={searchSummary}
            onClick={() => toggleSearch(true)}
            className="flex min-h-14 w-full items-center gap-3 rounded-full border border-accent bg-white px-5 py-2 text-left shadow-search focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary">
              <img src={searchIcon} alt="" width="16" height="16" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-semibold text-ink-strong">{filters.city || 'Anywhere in Pakistan'}</span>
              <span className="truncate text-[12px] text-muted-warm">
                {[filters.date ? formatEventDate(filters.date) : 'Any date', filters.guests ? `${filters.guests} guests` : 'Add guests', EVENT_NAMES[filters.eventType] ?? 'Any event'].join(' · ')}
              </span>
            </span>
            <span className="sr-only">Edit search</span>
          </button>
        )}
      </div>

      <div
        className={`mt-6 grid gap-8 lg:mt-10 ${showMap ? 'lg:grid-cols-2 xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,0.9fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-10'}`}
      >
        <aside aria-label="Filters" className={sidebarVisibility}>
          <div className="flex items-center justify-between pb-4">
            <p className="font-heading text-[18px] font-semibold text-ink-strong">Filters</p>
            {activeCount > 0 && (
              <button type="button" onClick={() => updateAndFocus(SIDEBAR_DEFAULTS)} className="min-h-11 px-1 text-[14px] font-semibold text-ink-strong underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
                Clear all
              </button>
            )}
          </div>
          {!sheetOpen && filtersPanel}
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 id="results-heading" ref={resultsHeading} tabIndex={-1} className="font-heading text-[24px] font-semibold text-ink-strong sm:text-[28px]">
                {status === 'loading' ? 'Finding venues…' : status === 'error' ? 'Search' : heading}
              </h1>
              {subline && <p className="text-[14px] text-muted-warm">{subline}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setSheetOpen(true)} className={`${toolButton} ${filtersButtonVisibility}`}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 4h7M13 4h1M2 12h1M7 12h7M11 2v4M5 10v4" />
                </svg>
                Filters
                {activeCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-white">
                    {activeCount}<span className="sr-only"> active</span>
                  </span>
                )}
              </button>
              <label className="relative">
                <span className="sr-only">Sort by</span>
                <select
                  value={filters.sort}
                  onChange={(event) => update({ sort: event.target.value })}
                  className={`${toolButton} appearance-none pr-9`}
                >
                  {SORTS.map((sort) => (
                    <option key={sort.value} value={sort.value}>{sort.label}</option>
                  ))}
                </select>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 fill-none stroke-ink-strong" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 4.5 3 3 3-3" />
                </svg>
              </label>
              <Button
                variant="outline"
                onClick={toggleMap}
                className="h-11 rounded-full px-4"
              >
                <img src={showMap ? gridIcon : mapIcon} alt="" width="16" height="16" />
                {showMap ? 'Show list' : 'Show map'}
              </Button>
            </div>
          </div>

          <p role="status" className="sr-only">
            {status === 'ready' && !isFetching ? `${heading} found` : ''}
          </p>

          <ActiveChips filters={filters} sectionTitle={data?.sectionTitle} onChange={updateAndFocus} />

          <div className={showMap ? 'max-lg:hidden' : ''}>
            {status === 'loading' && <ResultsSkeleton />}
            {status === 'error' && (
              <div className="flex flex-col items-start gap-4 py-12">
                <p className="text-[15px] text-muted-warm">Couldn’t load venues. Check your connection and try again.</p>
                <Button onClick={reload} className="px-5 py-2.5">Try again</Button>
              </div>
            )}
            {status === 'ready' && data.total === 0 && (
              <EmptyState
                hasFilters={activeCount > 0}
                onClearFilters={clearFilters}
                onClearAll={() => update({ ...SIDEBAR_DEFAULTS, city: '', date: '', guests: null, eventType: '' }, { push: true })}
              />
            )}
            {status === 'ready' && data.total > 0 && (
              <>
                <h2 className="sr-only">Results</h2>
                <ul
                  aria-busy={isFetching}
                  className={`mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-x-6 gap-y-8 transition-opacity ${isFetching ? 'opacity-60' : ''}`}
                >
                  {data.venues.map((venue, index) => (
                    <li key={venue.id} className="flex">
                      <VenueCard venue={venue} fluid eager={index < 3} onActiveChange={setActiveId} />
                    </li>
                  ))}
                </ul>
                <p className="mt-10 text-center text-[13px] tabular-nums text-muted-warm">
                  Showing {(data.page - 1) * data.pageSize + 1}–{(data.page - 1) * data.pageSize + data.venues.length} of {data.total}
                </p>
                <div className="mt-3">
                  <Pagination page={data.page} pageCount={data.pageCount} hrefFor={(page) => buildHref({ ...filters, page }, showMap)} />
                </div>
              </>
            )}
          </div>
        </section>

        {showMap && (
          <div className="isolate mt-2 h-[70dvh] overflow-hidden rounded-[24px] border border-line lg:sticky lg:top-[132px] lg:mt-0 lg:h-[calc(100dvh-148px)]">
            <Suspense fallback={<div aria-busy="true" aria-label="Loading map" className="size-full bg-map" />}>
              <VenueMap venues={data?.venues ?? NO_VENUES} activeId={activeId} onNavigate={navigate} />
            </Suspense>
          </div>
        )}
      </div>

      <FilterSheet open={sheetOpen} closeQuery={showMap ? '(width >= 80rem)' : '(width >= 64rem)'} onClose={closeSheet} onClear={clearFilters} total={total} isFetching={isFetching}>
        {sheetOpen && filtersPanel}
      </FilterSheet>
    </div>
  )
}

// Removable chips for the active filters, so they're visible when the sidebar is hidden (mobile, map view).
function ActiveChips({ filters, sectionTitle, onChange }) {
  const chips = []
  if (filters.section) chips.push({ key: 'section', label: sectionTitle || 'Collection', patch: { section: '' } })
  if (filters.eventType) chips.push({ key: 'eventType', label: EVENT_NAMES[filters.eventType], patch: { eventType: '' } })
  if (filters.priceMin !== null || filters.priceMax !== null) {
    const label = filters.priceMax === null ? `Rs. ${filters.priceMin.toLocaleString('en-US')}+` : `Rs. ${(filters.priceMin ?? 0).toLocaleString('en-US')} – ${filters.priceMax.toLocaleString('en-US')}`
    chips.push({ key: 'price', label: `${label} per guest`, patch: { priceMin: null, priceMax: null } })
  }
  if (filters.capacity !== 'any') chips.push({ key: 'capacity', label: `${CAPACITY_OPTIONS.find((c) => c.value === filters.capacity).label} guests`, patch: { capacity: 'any' } })
  if (filters.rating) chips.push({ key: 'rating', label: `★ ${filters.rating}+`, name: `${filters.rating}+ stars`, patch: { rating: '' } })
  for (const value of filters.settings) {
    chips.push({ key: `setting-${value}`, label: SETTINGS.find((s) => s.value === value).label, patch: { settings: filters.settings.filter((v) => v !== value) } })
  }
  if (filters.catering) chips.push({ key: 'catering', label: 'Catering included', patch: { catering: false } })
  for (const key of filters.amenities) {
    chips.push({ key: `amenity-${key}`, label: AMENITY_FILTERS.find((a) => a.key === key).label, patch: { amenities: filters.amenities.filter((v) => v !== key) } })
  }
  if (chips.length === 0) return null

  return (
    <ul aria-label="Active filters" className="mt-4 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onChange(chip.patch)}
            aria-label={`Remove filter: ${chip.name ?? chip.label}`}
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-rose px-3 text-[13px] font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {chip.label}
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m3 3 10 10M13 3 3 13" />
          </svg>
          </button>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ hasFilters, onClearFilters, onClearAll }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-4 rounded-[24px] border border-dashed border-outline-strong bg-surface px-6 py-16 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-white shadow-chip">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="stroke-primary" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <h2 className="font-heading text-[20px] font-semibold text-ink-strong">No venues match your search</h2>
      <p className="max-w-[420px] text-[15px] leading-normal text-muted-warm">
        Try another date or city, fewer guests, or a wider price range. Removing a filter or two usually helps.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {hasFilters && <Button onClick={onClearFilters} className="px-5 py-2.5">Clear filters</Button>}
        <Button variant="outline" onClick={onClearAll} className="px-5 py-2.5">Start a new search</Button>
      </div>
    </div>
  )
}

const block = 'bg-surface motion-safe:animate-pulse'

// Same footprint as the fluid VenueCard so results don't jump in.
function ResultsSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading venues" className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-x-6 gap-y-8">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex flex-col gap-3 rounded-[30px] pb-5 shadow-card">
          <div className={`aspect-[8/5] rounded-[30px] ${block}`} />
          <div className="flex flex-col gap-2 px-5 pt-2">
            <div className={`h-6 w-3/4 rounded-[8px] ${block}`} />
            <div className={`h-4 w-full rounded-[8px] ${block}`} />
            <div className={`h-4 w-2/3 rounded-[8px] ${block}`} />
            <div className={`mt-4 h-6 w-1/2 rounded-[8px] ${block}`} />
          </div>
        </li>
      ))}
    </ul>
  )
}
