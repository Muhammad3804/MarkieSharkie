import SearchBar from '../features/search/SearchBar.jsx'
import VenueRow from '../features/venues/VenueRow.jsx'
import { useLandingSections } from '../features/venues/useLandingSections.js'
import Button from '../components/ui/Button.jsx'

// Landing page from Figma (file zEl0W4jI3xx9Gm2L8eKVan, node 1:3).
// Venue rows come from the api/ layer (mock data until the venues API exists).
export default function Landing() {
  const { status, sections, reload } = useLandingSections()

  return (
    <>
      <div className="page-container flex justify-center pt-2">
        <SearchBar />
      </div>

      <div className="mb-8 mt-[50px] flex flex-col gap-8">
        {status === 'loading' && <RowsSkeleton />}
        {status === 'error' && (
          <div className="page-container flex flex-col items-start gap-4 py-12">
            <p className="text-[15px] text-muted-warm">Couldn’t load venues. Check your connection and try again.</p>
            <Button onClick={reload} className="px-5 py-2.5">Try again</Button>
          </div>
        )}
        {status === 'ready' && sections.map((section) => <VenueRow key={section.id} section={section} />)}
      </div>
    </>
  )
}

const block = 'bg-surface motion-safe:animate-pulse'

// Placeholder rows shaped like VenueRow (heading + cards bleeding right) so the page doesn't jump when data lands.
function RowsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading venues" className="flex flex-col gap-8">
      {[0, 1].map((row) => (
        <div key={row} className="flex flex-col gap-2">
          <div className="page-container">
            <div className={`h-9 w-56 rounded-[12px] ${block}`} />
          </div>
          <div className="flex gap-5 overflow-hidden page-inset-left pb-12 pt-4">
            {[0, 1, 2, 3].map((card) => (
              <div key={card} className={`h-[475px] w-[85vw] max-w-[400px] shrink-0 sm:w-[400px] rounded-[30px] ${block}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
