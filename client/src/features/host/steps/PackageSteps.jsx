import { useWizard } from '../WizardContext.js'
import { ChoiceCard, ErrorText, StepHeading, Switch, TagInput, TextArea, TextField } from '../fields.jsx'
import { fieldId, inputClass } from '../fieldStyles.js'
import { ADD_ON_TYPES, CANCELLATION_POLICIES, MENU_TEMPLATES, SLOT_TYPES, WEEKDAYS } from '../options.js'
import { newAddOn, newMenuPackage } from '../draft.js'
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
              <TagInput
                path={`menuPackages.${index}.items`}
                label="Dishes"
                tags={menu.items}
                onChange={(items) => setMenu(index, { items })}
                placeholder="Type a dish and press Enter"
                hint="Press Enter or type a comma after each dish."
              />
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
                <span className="text-[14px] leading-snug text-muted-warm">{template.items.length} dishes · from {template.minGuests} guests</span>
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
          <div className="grid gap-3 sm:grid-cols-3">
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
        </fieldset>
      </div>
    </>
  )
}
