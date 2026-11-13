import { Link } from 'react-router-dom'
import { VENUE_TABS } from '../../features/venues/constants.js'

// In-page section links (Figma 61:5). Each tab is a ?tab= URL so it can be shared and the back button works.
export default function SectionTabs({ active }) {
  return (
    <nav aria-label="Venue sections" className="scrollbar-none -mx-4 overflow-x-auto px-4 pb-5">
      <ul className="flex min-w-max items-start justify-center gap-8 sm:gap-[70px]">
        {VENUE_TABS.map((tab) => {
          const isActive = tab.id === active
          return (
            <li key={tab.id}>
              <Link
                to={tab.id === 'overview' ? '?' : `?tab=${tab.id}`}
                aria-current={isActive ? 'page' : undefined}
                preventScrollReset
                className={`font-heading flex flex-col gap-1.5 text-[18px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${
                  isActive ? 'font-semibold text-ink-strong' : 'text-muted-warm hover:text-ink-strong'
                }`}
              >
                {tab.label}
                <span aria-hidden className={`h-0.5 w-full ${isActive ? 'bg-ink-strong' : 'bg-transparent'}`} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
