import { useNavigate } from 'react-router-dom'
import searchIcon from '../../assets/icons/search.svg'

// Mirrors the event_type enum in db/schema.sql.
const eventTypes = [
  ['wedding', 'Wedding'], ['mehndi', 'Mehndi'], ['barat', 'Barat'], ['walima', 'Walima'], ['engagement', 'Engagement'],
  ['birthday', 'Birthday'], ['corporate', 'Corporate'], ['conference', 'Conference'], ['religious', 'Religious'], ['other', 'Other'],
]

const fieldClass = 'flex flex-col justify-center gap-[2px] px-6 py-[10px] md:h-full'
const labelClass = 'text-[11px] font-bold uppercase tracking-[0.8px] text-ink'
const inputClass = 'w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-placeholder'
const divider = <span aria-hidden className="h-px w-full bg-accent md:h-[40px] md:w-px md:shrink-0" />

export default function SearchBar() {
  const navigate = useNavigate()

  function handleSubmit(event) {
    event.preventDefault()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (String(value).trim()) params.set(key, String(value).trim())
    }
    navigate(`/search?${params}`)
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-[958px] flex-col overflow-hidden rounded-[32px] border border-accent bg-white shadow-search md:h-16 md:flex-row md:items-center"
    >
      <label className={`${fieldClass} md:w-[220px] md:pl-7 md:pr-5`}>
        <span className={labelClass}>Location</span>
        <input name="location" placeholder="Where are you celebrating?" className={inputClass} />
      </label>
      {divider}
      <label className={`${fieldClass} md:w-[200px] md:pr-5`}>
        <span className={labelClass}>Event type</span>
        <select name="eventType" defaultValue="" className={`${inputClass} invalid:text-placeholder`} required={false}>
          <option value="">Wedding, Reception</option>
          {eventTypes.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {divider}
      <label className={`${fieldClass} md:w-[170px] md:pr-5`}>
        <span className={labelClass}>Guests</span>
        <input name="guests" type="number" min="1" inputMode="numeric" placeholder="Add guests" className={inputClass} />
      </label>
      {divider}
      <label className={`${fieldClass} md:w-[190px] md:pr-5`}>
        <span className={labelClass}>Date</span>
        <input name="date" type="date" aria-label="Date" className={`${inputClass} text-placeholder`} />
      </label>
      <button
        type="submit"
        className="flex h-16 shrink-0 items-center justify-center gap-2 bg-primary px-[14px] text-[15px] font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white md:ml-auto md:w-[175px]"
      >
        <img src={searchIcon} alt="" width="18" height="18" />
        Search
      </button>
    </form>
  )
}
