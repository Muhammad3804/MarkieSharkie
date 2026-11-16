import { useState } from 'react'
import { useWizard } from '../WizardContext.js'
import { ChoiceCard, ErrorText, StepHeading, TextArea, TextField } from '../fields.jsx'
import { fieldId, inputClass } from '../fieldStyles.js'
import { AMENITY_GROUPS } from '../options.js'
import HostIcon from '../icons.jsx'

// Phase 2 questions (photos live in PhotosStep.jsx).
const setVenue = (patch) => (draft) => ({ ...draft, venue: { ...draft.venue, ...patch } })

export function AmenitiesStep() {
  const { draft, update, errorFor } = useWizard()
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState('')
  const selected = new Set(draft.venue.facilities)
  const { customFacilities } = draft.venue

  const toggle = (key) =>
    update((current) => {
      const next = new Set(current.venue.facilities)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return setVenue({ facilities: AMENITY_GROUPS.flatMap((g) => g.items.map((i) => i.key)).filter((k) => next.has(k)) })(current)
    })

  function addCustom() {
    const name = custom.trim().replace(/\s+/g, ' ')
    if (name.length < 2) return setCustomError('Type at least 2 characters.')
    if (name.length > 40) return setCustomError('Keep it under 41 characters.')
    if (customFacilities.length >= 10) return setCustomError('You can add up to 10 of your own amenities.')
    if (customFacilities.some((item) => item.toLowerCase() === name.toLowerCase())) return setCustomError('You’ve already added that.')
    update(setVenue({ customFacilities: [...customFacilities, name] }))
    setCustom('')
    setCustomError('')
  }

  return (
    <>
      <StepHeading title="Tell customers what your venue offers" subtitle="Pick everything that’s included. You can add more after your listing is live." />
      <div className="grid gap-10">
        {AMENITY_GROUPS.map((group) => (
          <fieldset key={group.title}>
            <legend className="mb-4 font-heading text-[20px] font-semibold text-ink-strong">{group.title}</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              {group.items.map((item) => (
                <ChoiceCard
                  key={item.key}
                  type="checkbox"
                  name="facilities"
                  value={item.key}
                  icon={item.icon}
                  label={item.label}
                  checked={selected.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="min-h-[112px]"
                />
              ))}
            </div>
          </fieldset>
        ))}

        {(selected.has('parking') || selected.has('valet')) && (
          <TextField
            path="venue.parkingSpaces"
            label="How many cars can park?"
            optional
            hint="Shown on your listing as “parking for 120 vehicles”."
            value={draft.venue.parkingSpaces}
            onChange={(parkingSpaces) => update(setVenue({ parkingSpaces: parkingSpaces.replace(/\D/g, '').slice(0, 4) }))}
            inputMode="numeric"
            placeholder="e.g. 120…"
            className="-mt-4 max-w-xs"
          />
        )}

        <section aria-labelledby="custom-amenities-title">
          <h2 id="custom-amenities-title" className="mb-1 font-heading text-[20px] font-semibold text-ink-strong">
            Something else?
          </h2>
          <p className="mb-4 text-[15px] text-muted-warm">Add amenities that aren’t listed, like a swimming pool or a helipad.</p>
          {customFacilities.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-2" aria-label="Your amenities">
              {customFacilities.map((name) => (
                <li key={name} className="flex items-center gap-1 rounded-full border border-primary bg-blush py-1 pl-4 pr-1 text-[15px] text-ink-strong">
                  {name}
                  <button
                    type="button"
                    onClick={() => {
                      update(setVenue({ customFacilities: customFacilities.filter((item) => item !== name) }))
                      document.getElementById('custom-amenity')?.focus()
                    }}
                    aria-label={`Remove ${name}`}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-rose focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <HostIcon name="x" className="size-4" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label htmlFor="custom-amenity" className="mb-2 block text-[15px] font-medium text-ink-strong">
            Amenity name
          </label>
          <div className="flex gap-3">
            <input
              id="custom-amenity"
              value={custom}
              maxLength={41}
              onChange={(event) => {
                setCustom(event.target.value)
                setCustomError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && custom.trim()) {
                  event.preventDefault()
                  addCustom()
                }
              }}
              placeholder="e.g. Swimming pool…"
              aria-invalid={customError ? 'true' : undefined}
              aria-describedby={customError ? 'custom-amenity-error' : undefined}
              className={`${inputClass} h-12 min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={addCustom}
              className="h-12 shrink-0 cursor-pointer rounded-xl border border-ink-strong px-5 text-[15px] font-medium text-ink-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Add
            </button>
          </div>
          <ErrorText id="custom-amenity-error">{customError || errorFor('venue.customFacilities')}</ErrorText>
        </section>
      </div>
    </>
  )
}

// Sentence starters the host can drop into the description (they edit the "…" parts).
const DESCRIPTION_PROMPTS = [
  { label: 'Your halls', text: 'Our halls seat up to … guests, with …' },
  { label: 'Food', text: 'Our kitchen serves …' },
  { label: 'Parking', text: 'Parking for … cars, with …' },
  { label: 'What’s special', text: 'Families choose us for …' },
  { label: 'Getting here', text: 'We’re … minutes from …' },
]

export function TitleStep() {
  const { draft, update } = useWizard()
  const { headline, description } = draft.venue

  const addPrompt = (text) => {
    const joined = description.trim() ? `${description.trimEnd()} ${text}` : text
    update(setVenue({ description: joined.slice(0, 1000) }))
    // Put the cursor at the end so the host can finish the sentence.
    requestAnimationFrame(() => {
      const field = document.getElementById(fieldId('venue.description'))
      field?.focus()
      field?.setSelectionRange(field.value.length, field.value.length)
    })
  }

  return (
    <>
      <StepHeading title="Give your listing a title and description" subtitle="Short and specific works best. You can change these any time." />
      <div className="grid gap-10">
        <TextArea
          path="venue.headline"
          label="Title"
          value={headline}
          onChange={(value) => update(setVenue({ headline: value.replace(/\n/g, ' ') }))}
          maxLength={60}
          minLength={10}
          rows={2}
          hint="10 to 60 characters, like “Garden marquee for 800 guests on Canal Road”."
          placeholder="Garden marquee for 800 guests on Canal Road"
          className="[&_textarea]:text-[20px] [&_textarea]:sm:text-[22px]"
        />
        <div>
          <TextArea
            path="venue.description"
            label="Description"
            value={description}
            onChange={(value) => update(setVenue({ description: value }))}
            maxLength={1000}
            minLength={50}
            rows={8}
            placeholder="Describe your halls, food, parking and what makes your venue special."
          />
          <div className="mt-4">
            <p id="prompt-title" className="mb-2 text-[14px] font-medium text-ink-strong">
              Need ideas? Add a sentence about:
            </p>
            <div role="group" aria-labelledby="prompt-title" className="flex flex-wrap gap-2">
              {DESCRIPTION_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  onClick={() => addPrompt(prompt.text)}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-outline-strong px-4 text-[14px] text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <HostIcon name="plus" className="size-4" strokeWidth={2} />
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
