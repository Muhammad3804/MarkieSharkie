import { useId, useState } from 'react'
import { AMENITY_FILTERS, CAPACITY_OPTIONS, EVENT_TYPES, RATING_OPTIONS, SETTINGS } from './filters.js'

const VISIBLE_AMENITIES = 6
const groupTitle = 'text-[15px] font-semibold text-ink-strong'
const chipClass =
  'cursor-pointer rounded-full border border-outline-strong px-4 py-2 text-[14px] text-ink-strong transition-colors hover:border-ink-strong has-checked:border-primary has-checked:bg-blush has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary'
const checkboxRow = 'flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-ink-strong'
const checkbox = 'size-[18px] shrink-0 accent-primary'

// Sidebar filters, used in the desktop sidebar and the mobile bottom sheet. Every change goes straight to the URL
// through onChange(patch); price commits on blur or Enter so typing doesn't run a search per keystroke.
export default function FiltersPanel({ filters, priceRange, onChange }) {
  const id = useId()

  function toggleIn(key, value) {
    const current = filters[key]
    onChange({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] })
  }

  return (
    <div className="flex flex-col divide-y divide-line">
      <div className="pb-6">
      <fieldset className="flex flex-col gap-3">
        <legend className={`${groupTitle} mb-1`}>Price per guest</legend>
        <PriceRange
          idPrefix={id}
          min={filters.priceMin}
          max={filters.priceMax}
          range={priceRange}
          onCommit={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
        />
      </fieldset>
      </div>

      <div className="flex flex-col gap-3 py-6">
        <label htmlFor={`${id}-event`} className={groupTitle}>Event type</label>
        <select
          id={`${id}-event`}
          value={filters.eventType}
          onChange={(event) => onChange({ eventType: event.target.value })}
          className="h-11 rounded-[12px] border border-outline-strong bg-white px-3 text-[14px] text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <option value="">Any event</option>
          {EVENT_TYPES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="py-6">
      <fieldset>
        <legend className={`${groupTitle} mb-3`}>Capacity</legend>
        <div className="flex flex-wrap gap-2">
          {CAPACITY_OPTIONS.map((option) => (
            <label key={option.value} className={chipClass}>
              <input
                type="radio"
                name={`${id}-capacity`}
                value={option.value}
                checked={filters.capacity === option.value}
                onChange={() => onChange({ capacity: option.value })}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      </div>

      <div className="py-6">
      <fieldset>
        <legend className={`${groupTitle} mb-3`}>Guest rating</legend>
        <div className="flex flex-wrap gap-2">
          {RATING_OPTIONS.map((option) => (
            <label key={option.value || 'any'} className={chipClass}>
              <input
                type="radio"
                name={`${id}-rating`}
                value={option.value}
                checked={filters.rating === option.value}
                onChange={() => onChange({ rating: option.value })}
                className="sr-only"
              />
              {option.value ? <><span aria-hidden="true">★ </span>{option.label}</> : option.label}
            </label>
          ))}
        </div>
      </fieldset>
      </div>

      <div className="py-6">
      <fieldset>
        <legend className={`${groupTitle} mb-2`}>Setting</legend>
        {SETTINGS.map((setting) => (
          <label key={setting.value} className={checkboxRow}>
            <input type="checkbox" checked={filters.settings.includes(setting.value)} onChange={() => toggleIn('settings', setting.value)} className={checkbox} />
            {setting.label}
          </label>
        ))}
      </fieldset>
      </div>

      <div className="py-6">
        <label className={`${checkboxRow} justify-between`}>
          <span className="flex flex-col gap-0.5">
            <span className={groupTitle}>Catering included</span>
            <span className="text-[13px] text-muted-warm">In-house catering and menus</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={filters.catering}
            onChange={(event) => onChange({ catering: event.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-7 w-12 shrink-0 rounded-full bg-outline-strong transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary motion-reduce:transition-none motion-reduce:after:transition-none"
          />
        </label>
      </div>

      <Amenities selected={filters.amenities} onToggle={(key) => toggleIn('amenities', key)} listId={`${id}-amenities`} />
    </div>
  )
}

function Amenities({ selected, onToggle, listId }) {
  const [showAll, setShowAll] = useState(false)
  // Selected amenities stay visible when the list is collapsed.
  const visible = showAll ? AMENITY_FILTERS : AMENITY_FILTERS.filter((a, index) => index < VISIBLE_AMENITIES || selected.includes(a.key))

  return (
    <div className="pt-6">
      <fieldset>
      <legend className={`${groupTitle} mb-2`}>Amenities</legend>
      <div id={listId}>
        {visible.map((amenity) => (
          <label key={amenity.key} className={checkboxRow}>
            <input type="checkbox" checked={selected.includes(amenity.key)} onChange={() => onToggle(amenity.key)} className={checkbox} />
            {amenity.label}
          </label>
        ))}
      </div>
      {visible.length < AMENITY_FILTERS.length || showAll ? (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 min-h-11 text-[14px] font-semibold text-ink-strong underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {showAll ? 'Show fewer' : `Show all ${AMENITY_FILTERS.length} amenities`}
        </button>
      ) : null}
    </fieldset>
      </div>
  )
}

const priceInput =
  'h-11 w-full rounded-[12px] border border-outline-strong bg-white pl-10 pr-3 text-[14px] tabular-nums text-ink-strong placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// Two number inputs. Drafts reset whenever the URL values change (e.g. "Clear all").
function PriceRange({ idPrefix, min, max, range, onCommit }) {
  const [draft, setDraft] = useState({ min: min ?? '', max: max ?? '' })
  const [synced, setSynced] = useState({ min, max })
  if (synced.min !== min || synced.max !== max) {
    setSynced({ min, max })
    setDraft({ min: min ?? '', max: max ?? '' })
  }

  function commit() {
    const parse = (text) => (/^\d{1,7}$/.test(String(text).trim()) ? Number(String(text).trim()) : null)
    const nextMin = parse(draft.min)
    const nextMax = parse(draft.max)
    if (nextMin !== min || nextMax !== max) onCommit(nextMin, nextMax)
    else setDraft({ min: min ?? '', max: max ?? '' })
  }

  const field = (key, label, placeholder) => (
    <div className="flex flex-1 flex-col gap-1.5">
      <label htmlFor={`${idPrefix}-price-${key}`} className="text-[12px] font-medium text-muted-warm">{label}</label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-warm">Rs.</span>
        <input
          id={`${idPrefix}-price-${key}`}
          name={`price-${key}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={draft[key]}
          onChange={(event) => setDraft((d) => ({ ...d, [key]: event.target.value.replace(/[^\d]/g, '') }))}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && commit()}
          className={priceInput}
        />
      </div>
    </div>
  )

  return (
    <>
      <div className="flex items-end gap-3">
        {field('min', 'Minimum', range ? String(range.min) : '')}
        <span aria-hidden="true" className="pb-3 text-muted-warm">–</span>
        {field('max', 'Maximum', range ? String(range.max) : '')}
      </div>
      {range && (
        <p className="text-[13px] text-muted-warm">
          Venues range from Rs. {range.min.toLocaleString('en-US')} to Rs. {range.max.toLocaleString('en-US')} per guest.
        </p>
      )}
    </>
  )
}
