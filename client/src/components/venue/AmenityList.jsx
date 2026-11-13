import { useMemo, useState } from 'react'
import { AMENITIES } from '../../features/venues/constants.js'
import { SectionTitle } from './AboutSection.jsx'
import treesIcon from '../../assets/icons/venue/trees.svg'
import sparklesIcon from '../../assets/icons/venue/sparkles.svg'
import carIcon from '../../assets/icons/venue/car-front.svg'
import snowflakeIcon from '../../assets/icons/venue/snowflake.svg'
import utensilsIcon from '../../assets/icons/venue/utensils.svg'
import accessibilityIcon from '../../assets/icons/venue/accessibility.svg'
import checkIcon from '../../assets/icons/venue/check-circle.svg'

const ICONS = { garden: treesIcon, decor: sparklesIcon, valet: carIcon, climate: snowflakeIcon, catering: utensilsIcon, access: accessibilityIcon }
const LABELS = Object.fromEntries(AMENITIES.map((a) => [a.key, a.label]))
const VISIBLE = 6

// Amenities from venues.facilities (Figma 44:1108). Shows six, then "Show all N amenities".
export default function AmenityList({ facilities }) {
  const [showAll, setShowAll] = useState(false)
  const items = useMemo(() => facilities.map((key) => ({ key, label: LABELS[key] ?? key, icon: ICONS[key] ?? checkIcon })), [facilities])
  const visible = showAll ? items : items.slice(0, VISIBLE)

  return (
    <section aria-labelledby="amenities-title" className="flex flex-col gap-[22px]">
      <SectionTitle id="amenities-title">What this venue offers</SectionTitle>
      <ul id="amenity-list" className="grid grid-cols-1 gap-x-[76px] gap-y-5 sm:grid-cols-[repeat(2,minmax(0,278px))]">
        {visible.map((item) => (
          <li key={item.key} className="flex items-center gap-3 text-[15px] text-ink-strong">
            <img src={item.icon} alt="" width="22" height="22" />
            {item.label}
          </li>
        ))}
      </ul>
      {items.length > VISIBLE && (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls="amenity-list"
          onClick={() => setShowAll((value) => !value)}
          className="self-start rounded-[12px] border border-outline-strong px-4 py-[11px] text-[13px] font-semibold text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {showAll ? 'Show fewer amenities' : `Show all ${items.length} amenities`}
        </button>
      )}
    </section>
  )
}
