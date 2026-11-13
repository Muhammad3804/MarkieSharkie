import { SectionTitle } from './AboutSection.jsx'

// "Good to know" (Figma 44:1132). Timing and policies are UI-only mock data (not in the ERD).
export default function EventNotes({ notes }) {
  const columns = [
    ['Event timing', notes.timing],
    ['Policies', notes.policies],
  ]
  return (
    <section aria-labelledby="notes-title" className="flex flex-col gap-[18px]">
      <SectionTitle id="notes-title">Good to know</SectionTitle>
      <div className="grid gap-6 text-[13px] sm:grid-cols-2 sm:gap-16">
        {columns.map(([title, lines]) => (
          <div key={title} className="flex flex-col gap-[7px]">
            <h3 className="font-semibold text-ink-strong">{title}</h3>
            <ul className="leading-[1.45] text-muted-warm">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
