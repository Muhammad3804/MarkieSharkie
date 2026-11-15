import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EVENT_TYPES } from '../explore/filters.js'
import searchIcon from '../../assets/icons/search.svg'

const fieldClass = 'flex flex-col justify-center gap-[2px] px-6 py-[10px] lg:h-full'
const labelClass = 'text-[11px] font-bold uppercase tracking-[0.8px] text-ink'
const inputClass = 'w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-placeholder'
const divider = <span aria-hidden className="h-px w-full bg-accent lg:h-[40px] lg:w-px lg:shrink-0" />

// Fields are uncontrolled; `initial` prefills them ({ city, eventType, guests, date }). Remount with a new `key`
// to refill. Submits to /explore, or to onSearch(values) when the page handles the search itself.
export default function SearchBar({ initial = {}, onSearch, className = '' }) {
  const navigate = useNavigate()
  const [hasDate, setHasDate] = useState(Boolean(initial.date))

  function handleSubmit(event) {
    event.preventDefault()
    const values = {}
    for (const [key, value] of new FormData(event.currentTarget)) values[key] = String(value).trim()
    if (onSearch) return onSearch(values)
    const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value))
    navigate(`/explore?${params}`)
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={`mx-auto flex w-full max-w-[958px] flex-col overflow-hidden rounded-[32px] border border-accent bg-white shadow-search lg:h-16 lg:flex-row lg:items-center ${className}`}
    >
      <label className={`${fieldClass} lg:w-[220px] lg:pl-7 lg:pr-5`}>
        <span className={labelClass}>Location</span>
        <input name="city" defaultValue={initial.city} autoComplete="address-level2" placeholder="Where are you celebrating?" className={inputClass} />
      </label>
      {divider}
      <label className={`${fieldClass} lg:w-[200px] lg:pr-5`}>
        <span className={labelClass}>Event type</span>
        <select name="eventType" defaultValue={initial.eventType ?? ''} className={inputClass}>
          <option value="">Wedding, Reception</option>
          {EVENT_TYPES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {divider}
      <label className={`${fieldClass} lg:w-[170px] lg:pr-5`}>
        <span className={labelClass}>Guests</span>
        <input name="guests" type="number" min="1" inputMode="numeric" defaultValue={initial.guests ?? ''} placeholder="Add guests" className={inputClass} />
      </label>
      {divider}
      <label className={`${fieldClass} lg:w-[190px] lg:pr-5`}>
        <span className={labelClass}>Date</span>
        <input
          name="date"
          type="date"
          defaultValue={initial.date}
          onChange={(event) => setHasDate(Boolean(event.target.value))}
          className={`${inputClass} ${hasDate ? '' : 'text-placeholder'}`}
        />
      </label>
      <button
        type="submit"
        className="flex h-16 shrink-0 items-center justify-center gap-2 bg-primary px-[14px] text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white lg:ml-auto lg:w-[175px]"
      >
        <img src={searchIcon} alt="" width="18" height="18" />
        Search
      </button>
    </form>
  )
}
