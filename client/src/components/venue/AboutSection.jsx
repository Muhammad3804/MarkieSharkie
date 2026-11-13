import { useState } from 'react'

export function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className="font-heading text-[20px] font-semibold text-ink-strong">
      {children}
    </h2>
  )
}

// About (Figma 44:1103). "Read full venue story" expands the clamped description.
export default function AboutSection({ venue }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <section aria-labelledby="about-title" className="flex flex-col gap-3.5">
      <SectionTitle id="about-title">About this venue</SectionTitle>
      <p id="about-text" className={`text-[15px] leading-[1.55] text-muted-warm ${expanded ? '' : 'line-clamp-3'}`}>
        {venue.description}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="about-text"
        onClick={() => setExpanded((value) => !value)}
        className="self-start text-[13px] font-semibold text-ink-strong underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {expanded ? 'Show less' : 'Read full venue story'}
      </button>
    </section>
  )
}
