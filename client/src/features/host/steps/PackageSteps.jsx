import { useRef, useState } from 'react'
import { useWizard } from '../WizardContext.js'
import { ChoiceCard, ErrorText, StepHeading, Switch, TagInput, TextArea, TextField } from '../fields.jsx'
import { fieldId, inputClass } from '../fieldStyles.js'
import { ADD_ON_TYPES, CANCELLATION_POLICIES, HOUSE_RULES, MAX_POLICY_TIERS, MENU_SECTIONS, MENU_TEMPLATES, SLOT_TYPES, WEEKDAYS } from '../options.js'
import { dishCount, newAddOn, newMenuPackage, newPolicyTier, newSection, sectionKey, tierSummary } from '../draft.js'
import { formatAmount } from '../../../lib/money.js'
import HostIcon from '../icons.jsx'

// Phase 3 questions: menu packages, custom menus + add-ons, booking rules.
const moneyDigits = (text) => text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 10)
const wholeDigits = (text) => text.replace(/\D/g, '').slice(0, 5)

// The removed card took the focused button with it; put focus back on the question.
const focusHeading = () => document.querySelector('main [data-step-heading]')?.focus()

const secondaryButton =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-outline-strong px-4 text-[15px] font-medium text-ink-strong hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const removeButton =
  'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-ink underline underline-offset-4 hover:text-danger focus-visible:outline-2 focus-visible:outline-primary'

export function MenusStep() {
  const { draft, update, errorFor } = useWizard()
  const { menuPackages } = draft

  const add = (template) => update((current) => ({ ...current, menuPackages: [...current.menuPackages, newMenuPackage(template)] }))
  const setMenu = (index, patch) =>
    update((current) => ({ ...current, menuPackages: current.menuPackages.map((menu, i) => (i === index ? { ...menu, ...patch } : menu)) }))
  const removeMenu = (index) => {
    if (!window.confirm(`Remove ${menuPackages[index].name.trim() || 'this package'} and its dishes?`)) return
    update((current) => ({ ...current, menuPackages: current.menuPackages.filter((_, i) => i !== index) }))
    focusHeading()
  }

  return (
    <>
      <StepHeading title="Set up your menu packages" subtitle="Customers pick a package when they book. The price is per guest, and customers see the total for their guest count." />

      <div className="grid gap-8">
        {menuPackages.map((menu, index) => (
          <fieldset key={menu.menuId} className="rounded-3xl border border-line p-5 sm:p-7">
            <legend className="px-2 font-heading text-[20px] font-semibold text-ink-strong">{menu.name.trim() || `Package ${index + 1}`}</legend>
            <div className="grid gap-6">
              <TextField path={`menuPackages.${index}.name`} label="Package name" value={menu.name} onChange={(name) => setMenu(index, { name })} maxLength={60} placeholder="e.g. Premium…" />
              <div className="grid gap-6 sm:grid-cols-2">
                <TextField
                  path={`menuPackages.${index}.pricePerHead`}
                  label="Price per guest"
                  prefix="Rs."
                  value={menu.pricePerHead}
                  onChange={(pricePerHead) => setMenu(index, { pricePerHead: moneyDigits(pricePerHead) })}
                  inputMode="decimal"
                  placeholder="2500"
                  hint={/^\d+(\.\d{1,2})?$/.test(menu.pricePerHead) ? `${formatAmount(menu.pricePerHead, 'Rs.')} per guest` : 'In rupees'}
                />
                <TextField
                  path={`menuPackages.${index}.minGuests`}
                  label="Minimum guests"
                  value={menu.minGuests}
                  onChange={(minGuests) => setMenu(index, { minGuests: wholeDigits(minGuests) })}
                  inputMode="numeric"
                  placeholder="100"
                  hint="Smallest guest count for this package"
                />
              </div>
              <MenuSections menu={menu} index={index} onChange={(sections) => setMenu(index, { sections })} />
              <TextField
                path={`menuPackages.${index}.description`}
                label="Short description"
                optional
                value={menu.description}
                onChange={(description) => setMenu(index, { description })}
                maxLength={200}
                placeholder="e.g. Our most booked wedding menu…"
              />
              <div className="flex justify-end">
                <button type="button" className={removeButton} onClick={() => removeMenu(index)}>
                  <HostIcon name="trash" className="size-4" />
                  Remove package
                </button>
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      {menuPackages.length < 10 && (
        <section aria-labelledby="menu-templates" className={menuPackages.length ? 'mt-10' : ''}>
          <h2 id="menu-templates" className="mb-1 font-heading text-[20px] font-semibold text-ink-strong">
            {menuPackages.length ? 'Add another package' : 'Start from a template'}
          </h2>
          <p className="mb-4 text-[15px] text-muted-warm">You can change every dish and price after adding it.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {MENU_TEMPLATES.map((template) => (
              <button
                key={template.name}
                type="button"
                onClick={() => add(template)}
                className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-outline-strong p-5 text-left transition-colors hover:border-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[17px] font-semibold text-ink-strong">{template.name}</span>
                  <HostIcon name="plus" className="size-5 text-primary" strokeWidth={2} />
                </span>
                <span className="text-[15px] tabular-nums text-ink">{formatAmount(template.pricePerHead, 'Rs.')} per guest</span>
                <span className="text-[14px] leading-snug text-muted-warm">{Object.values(template.sections).flat().length} dishes · from {template.minGuests} guests</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => add()} className={`${secondaryButton} mt-4`}>
            <HostIcon name="plus" className="size-4" strokeWidth={2} />
            Start from scratch
          </button>
        </section>
      )}
      <ErrorText id="field-menuPackages-error">{errorFor('menuPackages')}</ErrorText>
    </>
  )
}

// Dishes grouped into sections (menu_items.category). Each section is a tag input; sections can be reordered with
// the arrow buttons, custom ones renamed or removed. Empty sections are left out of the listing.
function MenuSections({ menu, index, onChange }) {
  const { errorFor } = useWizard()
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [moveMessage, setMoveMessage] = useState('')
  const list = useRef(null)
  const { sections } = menu
  const defaults = new Set(MENU_SECTIONS.map((name) => name.toLowerCase()))
  const dishes = dishCount(menu)
  const error = errorFor(`menuPackages.${index}.sections`)
  const errorId = `field-menuPackages-${index}-sections-error`

  const setSection = (sectionId, patch) => onChange(sections.map((s) => (s.sectionId === sectionId ? { ...s, ...patch } : s)))

  function move(from, to, direction) {
    const next = [...sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
    setMoveMessage(`${moved.name.trim() || 'Section'} moved to position ${to + 1} of ${next.length}.`)
    // Re-ordering drops focus; put it back on the same arrow (or the other one at either end).
    requestAnimationFrame(() => {
      const buttons = [...(list.current?.querySelectorAll(`[data-section="${moved.sectionId}"] [data-move]`) ?? [])]
      ;(buttons.find((b) => b.dataset.move === direction && b.getAttribute('aria-disabled') !== 'true') ?? buttons.find((b) => b.getAttribute('aria-disabled') !== 'true'))?.focus()
    })
  }

  function addSection() {
    const name = newName.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 40) return setAddError('Section names are 2 to 40 characters.')
    if (sections.some((s) => sectionKey(s.name) === sectionKey(name))) return setAddError('This package already has that section.')
    if (sections.length >= 15) return setAddError('A package can have up to 15 sections.')
    onChange([...sections, newSection(name, [], false)])
    setNewName('')
    setAddError('')
  }

  function removeSection(section) {
    if (section.items.length && !window.confirm(`Remove “${section.name}” and its ${section.items.length} dish${section.items.length === 1 ? '' : 'es'}?`)) return
    const index = sections.indexOf(section)
    onChange(sections.filter((s) => s !== section))
    // Focus the section that took its place (or the one above), not the add field at the bottom of the list.
    requestAnimationFrame(() => {
      const items = list.current?.querySelectorAll('[data-remove]') ?? []
      ;(items[Math.min(index, items.length - 1)] ?? document.getElementById(`new-section-${menu.menuId}`))?.focus()
    })
  }

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 text-[16px] font-semibold text-ink-strong">Dishes</legend>
      <p className="mb-4 text-[14px] text-muted-warm">
        Add dishes to any section: press Enter or type a comma after each. Empty sections are hidden from customers.{' '}
        <span className="tabular-nums">
          {dishes} dish{dishes === 1 ? '' : 'es'} added.
        </span>
      </p>
      <ol ref={list} className="grid gap-4">
        {sections.map((section, sectionIndex) => {
          // Stored on the section, so typing a default name into a custom one doesn't swap the input away.
          const isCustom = !(section.isDefault ?? defaults.has(sectionKey(section.name)))
          const label = section.name.trim() || 'Untitled section'
          return (
            <li key={section.sectionId} data-section={section.sectionId} className="rounded-2xl bg-surface p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                {isCustom ? (
                  <TextField
                    path={`menuPackages.${index}.sections.${sectionIndex}.name`}
                    label="Section name"
                    value={section.name}
                    onChange={(name) => setSection(section.sectionId, { name })}
                    maxLength={40}
                    className="min-w-0 flex-1 [&_input]:h-11 [&_label]:sr-only"
                  />
                ) : (
                  <h4 className="text-[15px] font-semibold text-ink-strong">{section.name}</h4>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    data-move="up"
                    className={iconButton}
                    aria-disabled={sectionIndex === 0}
                    onClick={() => sectionIndex > 0 && move(sectionIndex, sectionIndex - 1, 'up')}
                    aria-label={`Move ${label} up`}
                  >
                    <HostIcon name="chevron-left" className="size-4 rotate-90" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    data-move="down"
                    className={iconButton}
                    aria-disabled={sectionIndex === sections.length - 1}
                    onClick={() => sectionIndex < sections.length - 1 && move(sectionIndex, sectionIndex + 1, 'down')}
                    aria-label={`Move ${label} down`}
                  >
                    <HostIcon name="chevron-right" className="size-4 rotate-90" strokeWidth={2} />
                  </button>
                  <button type="button" data-remove className={iconButton} onClick={() => removeSection(section)} aria-label={`Remove section ${label}`}>
                    <HostIcon name="trash" className="size-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
              <TagInput
                path={`menuPackages.${index}.sections.${sectionIndex}.items`}
                label={label}
                labelClassName="sr-only"
                tags={section.items}
                onChange={(items) => setSection(section.sectionId, { items })}
                placeholder={`Add to ${label.toLowerCase()}…`}
                hint=""
              />
            </li>
          )
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {moveMessage}
      </p>
      <div className="mt-4">
        <label htmlFor={`new-section-${menu.menuId}`} className="mb-2 block text-[15px] font-medium text-ink-strong">
          Add your own section
        </label>
        <div className="flex gap-3">
          <input
            id={`new-section-${menu.menuId}`}
            value={newName}
            maxLength={41}
            onChange={(event) => {
              setNewName(event.target.value)
              setAddError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newName.trim()) {
                event.preventDefault()
                addSection()
              }
            }}
            placeholder="e.g. Live stations…"
            aria-invalid={addError ? 'true' : undefined}
            aria-describedby={addError ? `new-section-${menu.menuId}-error` : undefined}
            className={`${inputClass} h-12 min-w-0 flex-1`}
          />
          <button type="button" onClick={addSection} className={`${secondaryButton} h-12 shrink-0`}>
            Add
          </button>
        </div>
        <ErrorText id={`new-section-${menu.menuId}-error`}>{addError}</ErrorText>
      </div>
      <ErrorText id={errorId}>{error}</ErrorText>
    </fieldset>
  )
}

const iconButton =
  'flex size-9 cursor-pointer items-center justify-center rounded-full bg-white text-ink-strong shadow-chip hover:bg-rose focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40'

export function CustomStep() {
  const { draft, update } = useWizard()
  const { customMenu, menuPackages, addOns } = draft

  const setCustom = (patch) => update((current) => ({ ...current, customMenu: { ...current.customMenu, ...patch } }))
  const setAddOn = (index, patch) => update((current) => ({ ...current, addOns: current.addOns.map((a, i) => (i === index ? { ...a, ...patch } : a)) }))
  const toggleCustomizable = (menuId) =>
    update((current) => ({
      ...current,
      menuPackages: current.menuPackages.map((menu) => (menu.menuId === menuId ? { ...menu, isCustomizable: !menu.isCustomizable } : menu)),
    }))

  return (
    <>
      <StepHeading title="Custom menus and add-ons" subtitle="Both are optional. Customers can still book your packages as they are." />

      <section aria-labelledby="custom-menu-title" className="rounded-3xl border border-line p-5 sm:p-7">
        <h2 id="custom-menu-title" className="sr-only">
          Custom menu requests
        </h2>
        <Switch
          id="accept-custom-menus"
          label="Accept custom menu requests"
          description="Customers can ask to swap or add dishes when they request a quotation."
          checked={customMenu.accepts}
          onChange={(accepts) => setCustom({ accepts })}
        />
        {customMenu.accepts && (
          <div className="mt-6 grid gap-6 border-t border-line pt-6">
            <fieldset>
              <legend className="mb-3 text-[15px] font-medium text-ink-strong">Which packages can be changed?</legend>
              <div className="grid gap-2">
                {menuPackages.map((menu) => (
                  <label key={menu.menuId} className="flex min-h-11 cursor-pointer items-center gap-3 text-[16px] text-ink-strong">
                    <input type="checkbox" checked={menu.isCustomizable} onChange={() => toggleCustomizable(menu.menuId)} className="size-5 cursor-pointer accent-primary" />
                    {menu.name.trim() || 'Untitled package'}
                  </label>
                ))}
              </div>
            </fieldset>
            <TextArea
              path="customMenu.note"
              label="Note for customers"
              value={customMenu.note}
              onChange={(note) => setCustom({ note })}
              maxLength={300}
              rows={3}
              hint="Optional. For example: “Changes must be agreed 2 weeks before the event.”"
            />
          </div>
        )}
      </section>

      <section aria-labelledby="add-ons-title" className="mt-10">
        <h2 id="add-ons-title" className="mb-1 font-heading text-[20px] font-semibold text-ink-strong">
          Add-ons
        </h2>
        <p className="mb-5 max-w-[60ch] text-[15px] text-muted-warm">
          Extras customers can add to a booking. Decor is arranged with decorators on MarkieSharkie, so it isn’t listed here.
        </p>
        <div className="grid gap-6">
          {addOns.map((addOn, index) => {
            const type = ADD_ON_TYPES.find((t) => t.value === addOn.type)
            return (
              <fieldset key={addOn.addOnId} className="rounded-3xl border border-line p-5 sm:p-7">
                <legend className="px-2 font-heading text-[18px] font-semibold text-ink-strong">{type.label}</legend>
                <div className="grid gap-6">
                  <div className="grid gap-6 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <TextField path={`addOns.${index}.name`} label="Name" value={addOn.name} onChange={(name) => setAddOn(index, { name })} maxLength={60} placeholder={`${type.placeholder}…`} />
                    <TextField
                      path={`addOns.${index}.price`}
                      label="Price per event"
                      prefix="Rs."
                      value={addOn.price}
                      onChange={(price) => setAddOn(index, { price: moneyDigits(price) })}
                      inputMode="decimal"
                      placeholder="25000"
                    />
                  </div>
                  <TextField
                    path={`addOns.${index}.description`}
                    label="Description"
                    optional
                    value={addOn.description}
                    onChange={(description) => setAddOn(index, { description })}
                    maxLength={200}
                    placeholder="What’s included"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className={removeButton}
                      onClick={() => {
                        update((current) => ({ ...current, addOns: current.addOns.filter((_, i) => i !== index) }))
                        focusHeading()
                      }}
                    >
                      <HostIcon name="trash" className="size-4" />
                      Remove add-on
                    </button>
                  </div>
                </div>
              </fieldset>
            )
          })}
        </div>
        {addOns.length < 10 && (
          <div className="mt-5 flex flex-wrap gap-3">
            {ADD_ON_TYPES.map((type) => (
              <button key={type.value} type="button" className={secondaryButton} onClick={() => update((current) => ({ ...current, addOns: [...current.addOns, newAddOn(type.value)] }))}>
                <HostIcon name="plus" className="size-4" strokeWidth={2} />
                Add {type.label.toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

export function RulesStep() {
  const { draft, update, errorFor, touch } = useWizard()
  const rules = draft.bookingRules
  const setRules = (patch) => update((current) => ({ ...current, bookingRules: { ...current.bookingRules, ...patch } }))
  const setSlot = (slot, patch) => setRules({ slots: { ...rules.slots, [slot]: { ...rules.slots[slot], ...patch } } })
  const days = new Set(rules.days)
  const toggleDay = (day) => {
    const next = new Set(days)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    setRules({ days: WEEKDAYS.map((d) => d.value).filter((d) => next.has(d)) })
  }

  return (
    <>
      <StepHeading title="Set your booking rules" subtitle="These set when customers can book you. You can block single dates later from your calendar." />
      <div className="grid gap-10">
        <fieldset aria-describedby={errorFor('bookingRules.days') ? 'field-bookingRules-days-error' : undefined}>
          <legend className="mb-3 font-heading text-[20px] font-semibold text-ink-strong">Available days</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-[15px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                  days.has(day.value) ? 'border-primary bg-primary text-white' : 'border-outline-strong text-ink-strong hover:border-ink-strong'
                }`}
              >
                <input type="checkbox" className="sr-only" checked={days.has(day.value)} onChange={() => toggleDay(day.value)} />
                <span aria-hidden="true">{day.short}</span>
                <span className="sr-only">{day.label}</span>
              </label>
            ))}
          </div>
          <ErrorText id="field-bookingRules-days-error">{errorFor('bookingRules.days')}</ErrorText>
        </fieldset>

        <fieldset>
          <legend className="mb-1 font-heading text-[20px] font-semibold text-ink-strong">Time slots</legend>
          <p className="mb-4 text-[15px] text-muted-warm">Each slot can have one booking per day.</p>
          <div className="grid gap-3">
            {SLOT_TYPES.map((slot) => {
              const value = rules.slots[slot.value]
              const startPath = `bookingRules.slots.${slot.value}.start`
              const endPath = `bookingRules.slots.${slot.value}.end`
              const error = errorFor(startPath) || errorFor(endPath)
              return (
                <div key={slot.value} className="rounded-2xl border border-line p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <label className="flex min-h-11 min-w-28 cursor-pointer items-center gap-3 text-[17px] font-medium text-ink-strong">
                      <input type="checkbox" checked={value.enabled} onChange={() => setSlot(slot.value, { enabled: !value.enabled })} className="size-5 cursor-pointer accent-primary" />
                      {slot.label}
                    </label>
                    {value.enabled && (
                      <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:w-auto">
                        {[
                          ['start', startPath, 'From'],
                          ['end', endPath, 'To'],
                        ].map(([key, path, text]) => (
                          <div key={key} className="min-w-0">
                            <label htmlFor={fieldId(path)} className="mb-1 block text-[13px] text-muted-warm">
                              {text}
                              <span className="sr-only"> ({slot.label})</span>
                            </label>
                            <input
                              id={fieldId(path)}
                              type="time"
                              value={value[key]}
                              onChange={(event) => setSlot(slot.value, { [key]: event.target.value })}
                              onBlur={() => touch(path)}
                              aria-invalid={errorFor(path) ? 'true' : undefined}
                              aria-describedby={error ? `slot-${slot.value}-error` : undefined}
                              className={`${inputClass} h-12 min-w-0 px-3`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <ErrorText id={`slot-${slot.value}-error`}>{error}</ErrorText>
                </div>
              )
            })}
          </div>
          <ErrorText id="field-bookingRules-slots-error">{errorFor('bookingRules.slots')}</ErrorText>
        </fieldset>

        <div className="max-w-xs">
          <TextField
            path="bookingRules.advancePercent"
            label="Advance payment"
            value={rules.advancePercent}
            onChange={(advancePercent) => setRules({ advancePercent: advancePercent.replace(/\D/g, '').slice(0, 3) })}
            inputMode="numeric"
            hint="Percent of the booking total, paid to you directly. MarkieSharkie records it but never handles the money."
            suffix="%"
            inputClassName="pr-12"
          />
        </div>

        <fieldset aria-describedby={errorFor('bookingRules.cancellationPolicy') ? 'field-bookingRules-cancellationPolicy-error' : undefined}>
          <legend className="mb-1 font-heading text-[20px] font-semibold text-ink-strong">Cancellation policy</legend>
          <p className="mb-4 max-w-[60ch] text-[15px] text-muted-warm">
            Customers can cancel any booking before the event date. Your policy tells them what happens to the advance they paid you.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CANCELLATION_POLICIES.map((policy) => (
              <ChoiceCard
                key={policy.value}
                name="cancellation-policy"
                value={policy.value}
                label={policy.label}
                description={policy.description}
                checked={rules.cancellationPolicy === policy.value}
                onChange={() => setRules({ cancellationPolicy: policy.value })}
                className="pr-10"
              />
            ))}
          </div>
          <ErrorText id="field-bookingRules-cancellationPolicy-error">{errorFor('bookingRules.cancellationPolicy')}</ErrorText>
          {rules.cancellationPolicy === 'custom' && <CustomPolicyBuilder policy={rules.customPolicy} onChange={(customPolicy) => setRules({ customPolicy })} />}
        </fieldset>
      </div>
    </>
  )
}

// "Refund X% if the customer cancels between A and B days before the event". Rows can't overlap (schema.js).
function CustomPolicyBuilder({ policy, onChange }) {
  const { errorFor } = useWizard()
  const list = useRef(null)
  const base = 'bookingRules.customPolicy'
  const setTier = (tierId, patch) => onChange({ ...policy, tiers: policy.tiers.map((t) => (t.tierId === tierId ? { ...t, ...patch } : t)) })
  const days = (text) => text.replace(/\D/g, '').slice(0, 3)

  function addRow() {
    onChange({ ...policy, tiers: [...policy.tiers, newPolicyTier()] })
    // Focus the new row's first field.
    requestAnimationFrame(() => list.current?.querySelector('li:last-child input')?.focus())
  }
  function removeRow(index) {
    onChange({ ...policy, tiers: policy.tiers.filter((_, i) => i !== index) })
    document.getElementById('custom-policy-add')?.focus()
  }

  return (
    <div className="mt-6 rounded-3xl border border-line p-5 sm:p-7">
      <h3 className="text-[17px] font-semibold text-ink-strong">Your refund rules</h3>
      <p className="mb-5 mt-1 text-[14px] text-muted-warm">
        Days are counted before the event date. Leave “To” empty for “or more”. Example: 30 or more days, 100%; 7 to 30 days, 50%; 0 to 7 days, 0%.
      </p>
      <ol ref={list} className="grid gap-4">
        {policy.tiers.map((tier, index) => {
          const path = `${base}.tiers.${index}`
          return (
            <li key={tier.tierId} className="rounded-2xl bg-surface p-4">
              <fieldset>
                <legend className="mb-3 text-[15px] font-medium text-ink-strong">
                  Rule {index + 1} <span className="font-normal text-muted-warm">· days before the event</span>
                </legend>
                <div className="grid grid-cols-3 items-start gap-3">
                  <TextField path={`${path}.fromDays`} label="From" value={tier.fromDays} onChange={(v) => setTier(tier.tierId, { fromDays: days(v) })} inputMode="numeric" placeholder="0" />
                  <TextField path={`${path}.toDays`} label="To" value={tier.toDays} onChange={(v) => setTier(tier.tierId, { toDays: days(v) })} inputMode="numeric" placeholder="more" />
                  <TextField
                    path={`${path}.refundPercent`}
                    label="Refund"
                    suffix="%"
                    value={tier.refundPercent}
                    onChange={(v) => setTier(tier.tierId, { refundPercent: days(v) })}
                    inputMode="numeric"
                    inputClassName="pr-9"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[14px] text-muted-warm">{tierSummary(tier)}</p>
                  <button type="button" className={removeButton} onClick={() => removeRow(index)}>
                    <HostIcon name="trash" className="size-4" />
                    Remove<span className="sr-only"> rule {index + 1}</span>
                  </button>
                </div>
              </fieldset>
            </li>
          )
        })}
      </ol>
      <ErrorText id="field-bookingRules-customPolicy-tiers-error">{errorFor(`${base}.tiers`)}</ErrorText>
      {policy.tiers.length < MAX_POLICY_TIERS && (
        <button id="custom-policy-add" type="button" className={`${secondaryButton} mt-4`} onClick={addRow}>
          <HostIcon name="plus" className="size-4" strokeWidth={2} />
          Add a rule
        </button>
      )}
      <TextArea
        path={`${base}.note`}
        label="Note for customers"
        value={policy.note}
        onChange={(note) => onChange({ ...policy, note })}
        maxLength={300}
        rows={3}
        hint="Optional. For example: “Refunds are paid within 7 days by bank transfer.”"
        className="mt-6"
      />
    </div>
  )
}

export function HouseRulesStep() {
  const { draft, update, errorFor } = useWizard()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const { houseRules, customHouseRules } = draft.venue
  const selected = new Set(houseRules)
  const setVenue = (patch) => update((current) => ({ ...current, venue: { ...current.venue, ...patch } }))

  const toggle = (key) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setVenue({ houseRules: HOUSE_RULES.map((rule) => rule.key).filter((k) => next.has(k)) })
  }

  function addRule() {
    const rule = text.trim().replace(/\s+/g, ' ')
    if (rule.length < 3 || rule.length > 80) return setError('Rules are 3 to 80 characters.')
    if (customHouseRules.length >= 10) return setError('You can add up to 10 of your own rules.')
    if (customHouseRules.some((r) => r.toLowerCase() === rule.toLowerCase())) return setError('You’ve already added that rule.')
    setVenue({ customHouseRules: [...customHouseRules, rule] })
    setText('')
    setError('')
  }

  return (
    <>
      <StepHeading title="Any house rules?" subtitle="Optional. These appear under “Good to know” on your listing, next to your event timings." />
      <fieldset>
        <legend className="sr-only">House rules</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {HOUSE_RULES.map((rule) => (
            <ChoiceCard
              key={rule.key}
              type="checkbox"
              name="house-rules"
              value={rule.key}
              label={rule.label}
              checked={selected.has(rule.key)}
              onChange={() => toggle(rule.key)}
              className="min-h-[72px] justify-center pr-10"
            />
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="own-rules-title" className="mt-10">
        <h2 id="own-rules-title" className="mb-1 font-heading text-[20px] font-semibold text-ink-strong">
          Your own rules
        </h2>
        <p className="mb-4 text-[15px] text-muted-warm">For example: “Valet included for all events”.</p>
        {customHouseRules.length > 0 && (
          <ul className="mb-4 grid gap-2" aria-label="Your rules">
            {customHouseRules.map((rule) => (
              <li key={rule} className="flex items-center justify-between gap-3 rounded-xl border border-line py-2 pl-4 pr-2 text-[15px] text-ink-strong">
                {rule}
                <button
                  type="button"
                  className={removeButton}
                  onClick={() => {
                    setVenue({ customHouseRules: customHouseRules.filter((r) => r !== rule) })
                    document.getElementById('custom-house-rule')?.focus()
                  }}
                >
                  Remove<span className="sr-only"> {rule}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor="custom-house-rule" className="mb-2 block text-[15px] font-medium text-ink-strong">
          Rule
        </label>
        <div className="flex gap-3">
          <input
            id="custom-house-rule"
            value={text}
            maxLength={81}
            onChange={(event) => {
              setText(event.target.value)
              setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && text.trim()) {
                event.preventDefault()
                addRule()
              }
            }}
            placeholder="e.g. Valet included for all events…"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'custom-house-rule-error' : undefined}
            className={`${inputClass} h-12 min-w-0 flex-1`}
          />
          <button type="button" onClick={addRule} className={`${secondaryButton} h-12 shrink-0`}>
            Add
          </button>
        </div>
        <ErrorText id="custom-house-rule-error">{error || errorFor('venue.customHouseRules')}</ErrorText>
      </section>
    </>
  )
}
