// Explore page filters <-> URL search params. The URL is the single source of truth, so a search can be shared,
// bookmarked and restored with back/forward. Every value is validated here; anything unknown is dropped.
import { AMENITIES } from '../venues/constants.js'

// Mirrors the event_type enum in db/schema.sql (same list as the landing search bar).
export const EVENT_TYPES = [
  ['wedding', 'Wedding'], ['mehndi', 'Mehndi'], ['barat', 'Barat'], ['walima', 'Walima'], ['engagement', 'Engagement'],
  ['birthday', 'Birthday'], ['corporate', 'Corporate'], ['conference', 'Conference'], ['religious', 'Religious'], ['other', 'Other'],
]

export const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'capacity', label: 'Largest capacity' },
]

// Largest hall capacity (venues.capacity) buckets.
export const CAPACITY_OPTIONS = [
  { value: 'any', label: 'Any size', min: 0, max: Infinity },
  { value: 'up-to-500', label: 'Up to 500', min: 0, max: 500 },
  { value: '500-750', label: '500 to 750', min: 500, max: 750 },
  { value: '750-plus', label: '750+', min: 750, max: Infinity },
]

export const RATING_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '4.6', label: '4.6+' },
  { value: '4.8', label: '4.8+' },
  { value: '4.9', label: '4.9+' },
]

// venue_type enum values.
export const SETTINGS = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'semi_outdoor', label: 'Indoor & outdoor' },
]

// Catering has its own toggle, so it isn't repeated in the amenity list.
export const AMENITY_FILTERS = AMENITIES.filter((a) => a.key !== 'catering')

export const PAGE_SIZE = 12

const eventValues = new Set(EVENT_TYPES.map(([value]) => value))
const sortValues = new Set(SORTS.map((s) => s.value))
const capacityValues = new Set(CAPACITY_OPTIONS.map((c) => c.value))
const ratingValues = new Set(RATING_OPTIONS.map((r) => r.value).filter(Boolean))
const settingValues = new Set(SETTINGS.map((s) => s.value))
const amenityValues = new Set(AMENITY_FILTERS.map((a) => a.key))

const wholeNumber = (text) => (/^\d{1,7}$/.test(text ?? '') ? Number(text) : null)
const list = (text, allowed) => [...new Set((text ?? '').split(',').filter((v) => allowed.has(v)))]
const isDayKey = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text ?? '') && !Number.isNaN(Date.parse(text))

// URLSearchParams -> filters. `location` is the landing search bar's old name for `city`.
export function parseFilters(params) {
  const priceMin = wholeNumber(params.get('priceMin'))
  const priceMax = wholeNumber(params.get('priceMax'))
  const page = wholeNumber(params.get('page'))
  return {
    city: (params.get('city') ?? params.get('location') ?? '').trim().slice(0, 80),
    date: isDayKey(params.get('date')) ? params.get('date') : '',
    guests: wholeNumber(params.get('guests')) || null,
    eventType: eventValues.has(params.get('eventType')) ? params.get('eventType') : '',
    // A reversed range is read as the user meant it.
    priceMin: priceMin !== null && priceMax !== null ? Math.min(priceMin, priceMax) : priceMin,
    priceMax: priceMin !== null && priceMax !== null ? Math.max(priceMin, priceMax) : priceMax,
    capacity: capacityValues.has(params.get('capacity')) ? params.get('capacity') : 'any',
    rating: ratingValues.has(params.get('rating')) ? params.get('rating') : '',
    settings: list(params.get('setting'), settingValues),
    amenities: list(params.get('amenities'), amenityValues),
    catering: params.get('catering') === '1',
    section: /^[a-z-]{1,40}$/.test(params.get('section') ?? '') ? params.get('section') : '',
    sort: sortValues.has(params.get('sort')) ? params.get('sort') : 'recommended',
    page: page && page > 0 ? page : 1,
  }
}

// filters -> URLSearchParams, leaving out defaults so URLs stay short.
export function toSearchParams(filters) {
  const params = new URLSearchParams()
  const set = (key, value) => {
    if (value !== '' && value !== null && value !== undefined && value !== false) params.set(key, String(value))
  }
  set('city', filters.city)
  set('date', filters.date)
  set('guests', filters.guests)
  set('eventType', filters.eventType)
  set('priceMin', filters.priceMin)
  set('priceMax', filters.priceMax)
  if (filters.capacity !== 'any') set('capacity', filters.capacity)
  set('rating', filters.rating)
  set('setting', filters.settings.join(','))
  set('amenities', filters.amenities.join(','))
  if (filters.catering) params.set('catering', '1')
  set('section', filters.section)
  if (filters.sort !== 'recommended') set('sort', filters.sort)
  if (filters.page > 1) set('page', filters.page)
  return params
}

// Sidebar filters (not the search bar fields, sort or page): what "Clear all" resets.
export const SIDEBAR_DEFAULTS = {
  priceMin: null, priceMax: null, capacity: 'any', rating: '', settings: [], amenities: [], catering: false, eventType: '', section: '',
}

export function countActiveFilters(filters) {
  return [
    filters.priceMin !== null || filters.priceMax !== null,
    filters.capacity !== 'any',
    filters.rating !== '',
    filters.settings.length > 0,
    filters.catering,
    filters.eventType !== '',
    filters.section !== '',
  ].filter(Boolean).length + filters.amenities.length
}
