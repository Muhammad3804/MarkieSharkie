import SearchBar from '../features/search/SearchBar.jsx'
import VenueRow from '../features/venues/VenueRow.jsx'
import AskAiButton from '../features/chatbot/AskAiButton.jsx'
import { landingSections } from '../features/venues/mockVenues.js'

// Landing page from Figma (file zEl0W4jI3xx9Gm2L8eKVan, node 1:3).
// Venue rows use mock data until the venues API exists; see features/venues/mockVenues.js.
export default function Landing() {
  return (
    <>
      <div className="px-4 pt-2">
        <SearchBar />
      </div>

      <div className="mb-8 mt-[50px] flex flex-col gap-8">
        {landingSections.map((section) => (
          <VenueRow key={section.id} section={section} />
        ))}
      </div>

      <AskAiButton />
    </>
  )
}
