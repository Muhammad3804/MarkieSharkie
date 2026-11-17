import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWizard } from '../../host/WizardContext.js'
import { ChoiceCard, Counter, ErrorText, SelectField, StepHeading, TextArea, TextField } from '../../host/fields.jsx'
import { fieldId } from '../../host/fieldStyles.js'
import { EVENT_TYPES } from '../../host/options.js'
import { MAX_ADD_ON_QUANTITY } from '../options.js'
import { cancellationTiers, policyInfo, refundPercent, tierText } from '../pricing.js'
import { MIN_GUESTS, slotPreset } from '../../../lib/booking.js'
import { daysBetween } from '../../../lib/days.js'
import { formatEventDate, todayKey } from '../../../lib/format.js'
import { formatPaisa, toPaisa } from '../../../lib/money.js'
import { formatPkMobile, normalizePkMobile } from '../../../lib/phone.js'

// The booking flow's screens (pages/BookingFlow.jsx). They read and write the draft through the host wizard's
// WizardContext, so the wizard's form components (fields.jsx) work here unchanged.

const rs = (paisa) => formatPaisa(paisa, 'Rs.')
const card = 'rounded-3xl border border-line bg-white shadow-[0_1px_2px_rgba(41,28,31,0.05),0_16px_40px_-16px_rgba(41,28,31,0.18)]'
const editLink =
  'inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg px-2 text-[15px] font-semibold text-primary underline underline-offset-4 hover:bg-blush focus-visible:outline-2 focus-visible:outline-primary'

function Row({ label, children, action }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line py-4 first:border-t-0">
      <div className="min-w-0">
        <dt className="text-[14px] font-medium text-muted-warm">{label}</dt>
        <dd className="mt-1 text-[16px] text-ink-strong">{children}</dd>
      </div>
      {action}
    </div>
  )
}

// 1. Your selection --------------------------------------------------------------------------------------------

export function SelectionStep() {
  const { draft, update, venue, hold, holdError, price, selection } = useWizard()
  const [editing, setEditing] = useState(null) // 'guests' | 'menu' | null
  const hall = venue.halls.find((h) => h.hallId === draft.hallId) ?? venue.halls[0]
  const menu = venue.menuPackages.find((m) => m.menuId === draft.menuId)
  const slot = slotPreset(draft.slot)
  const changeSlot = (what) => (
    <Link to={`/venues/${venue.id}?tab=availability`} className={editLink}>
      Edit<span className="sr-only"> {what}</span>
    </Link>
  )
  const toggle = (what, label) => (
    <button type="button" onClick={() => setEditing((current) => (current === what ? null : what))} aria-expanded={editing === what} className={editLink}>
      {editing === what ? 'Done' : 'Edit'}
      <span className="sr-only"> {label}</span>
    </button>
  )

  return (
    <>
      <StepHeading title="Your selection" subtitle={hold ? 'This slot is held for you while you book. Check the details, then add your event.' : 'Check the details, then hold the slot for 10 minutes while you book.'} />

      {!hold && (
        <section aria-labelledby="hold-status" className="mb-6 rounded-2xl border border-pending/25 bg-pending-bg p-4 sm:p-5">
          <h2 id="hold-status" className="text-[16px] font-semibold text-pending">
            This slot isn’t held for you yet
          </h2>
          <p className="mt-1 text-[15px] text-ink">Press “Hold slot &amp; continue”. If someone else got it first, pick one of the suggestions.</p>
          {holdError && (
            <div role="alert" className="mt-3 flex flex-col gap-3">
              <p className="text-[15px] font-medium text-danger">{holdError.message}</p>
              <Alternatives alternatives={holdError.alternatives} onDate={(date) => update({ date })} onHall={(hallId) => update({ hallId })} />
            </div>
          )}
        </section>
      )}

      <article className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-4 border-b border-line bg-blush/50 p-4 sm:p-5">
          {venue.image && <img src={venue.image} alt="" width="96" height="72" className="h-[72px] w-24 shrink-0 rounded-2xl object-cover" />}
          <div className="min-w-0">
            <h2 className="font-heading text-[19px] font-semibold text-ink-strong">{venue.name}</h2>
            <p className="text-[14px] text-muted-warm">
              {venue.area}, {venue.city}
            </p>
          </div>
        </div>
        <dl className="px-4 sm:px-6">
          <Row label="Date" action={changeSlot('date')}>
            {formatEventDate(draft.date)}
          </Row>
          <Row label="Time" action={changeSlot('time')}>
            {slot.label} · {slot.time}
          </Row>
          <Row label="Hall" action={changeSlot('hall')}>
            {hall.name} · up to {hall.capacity.toLocaleString('en-US')} guests
          </Row>
          <Row label="Guests" action={toggle('guests', 'guest count')}>
            {editing === 'guests' ? (
              <GuestsEditor hall={hall} />
            ) : (
              <>
                {Number(draft.guests).toLocaleString('en-US')} guests
                {price.billable > price.guests && <span className="block text-[14px] text-muted-warm">{menu?.name} is charged for at least {price.billable} guests.</span>}
              </>
            )}
          </Row>
          {venue.menuPackages.length > 0 && (
            <Row label="Menu" action={toggle('menu', 'menu')}>
              {editing === 'menu' ? (
                <SelectField path="menuId" label="Menu" value={draft.menuId} onChange={(menuId) => update({ menuId })} options={venue.menuPackages.map((m) => ({ value: m.menuId, label: `${m.name} · ${rs(toPaisa(m.pricePerHead))} per guest` }))} />
              ) : (
                <>
                  {menu?.name} · {rs(toPaisa(menu?.pricePerHead ?? '0'))} per guest
                </>
              )}
            </Row>
          )}
        </dl>
        <div className="flex items-baseline justify-between gap-4 border-t border-line bg-surface/60 px-4 py-4 sm:px-6">
          <span className="text-[15px] text-muted-warm">Estimated total</span>
          <span className="font-heading text-[22px] font-semibold tabular-nums text-ink-strong">{rs(price.totalPaisa)}</span>
        </div>
      </article>
      <p className="mt-4 text-[14px] text-muted-warm">Editing the date, time or hall takes you back to the venue page and releases {selection.hallName}.</p>
    </>
  )
}

function GuestsEditor({ hall }) {
  const { draft, update } = useWizard()
  return (
    <TextField
      path="guests"
      label="Guest count"
      value={draft.guests}
      onChange={(guests) => update({ guests })}
      inputMode="numeric"
      type="number"
      min={MIN_GUESTS}
      max={hall.capacity}
      hint={`${MIN_GUESTS} to ${hall.capacity.toLocaleString('en-US')} guests in ${hall.name}.`}
      inputClassName="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  )
}

function Alternatives({ alternatives, onDate, onHall }) {
  const { dates = [], halls = [] } = alternatives ?? {}
  const chip = 'min-h-11 cursor-pointer rounded-full border border-outline-strong bg-white px-4 text-[14px] font-medium text-ink-strong hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
  return (
    <>
      {dates.length > 0 && (
        <div>
          <p className="mb-2 text-[14px] font-medium text-ink">Nearest free dates</p>
          <div className="flex flex-wrap gap-2">
            {dates.map((date) => (
              <button key={date} type="button" className={chip} onClick={() => onDate(date)}>
                {formatEventDate(date)}
              </button>
            ))}
          </div>
        </div>
      )}
      {halls.length > 0 && (
        <div>
          <p className="mb-2 text-[14px] font-medium text-ink">Other halls free at that time</p>
          <div className="flex flex-wrap gap-2">
            {halls.map((hall) => (
              <button key={hall.hallId} type="button" className={chip} onClick={() => onHall(hall.hallId)}>
                {hall.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// 2. Event details ---------------------------------------------------------------------------------------------

export function DetailsStep() {
  const { draft, update, errorFor, venue } = useWizard()
  const typeError = errorFor('eventType')
  // The venue's listed events first, then the rest.
  const types = [...EVENT_TYPES].sort((a, b) => Number(venue.supportedEvents?.includes(b.value)) - Number(venue.supportedEvents?.includes(a.value)))
  const phone = normalizePkMobile(draft.hostPhone)
  return (
    <>
      <StepHeading title="Tell us about your event" subtitle="The venue uses this to plan your day. Only you and the venue see the host’s phone number." />
      <div className="grid gap-8">
        <fieldset aria-describedby={typeError ? `${fieldId('eventType')}-error` : undefined}>
          <legend className="mb-3 text-[15px] font-medium text-ink-strong">What are you celebrating?</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {types.map((type) => (
              <ChoiceCard key={type.value} name="eventType" value={type.value} checked={draft.eventType === type.value} onChange={() => update({ eventType: type.value })} label={type.label} className="min-h-[76px]" />
            ))}
          </div>
          <ErrorText id={`${fieldId('eventType')}-error`}>{typeError}</ErrorText>
        </fieldset>
        <TextField path="eventName" label="Event name" value={draft.eventName} onChange={(eventName) => update({ eventName })} maxLength={80} placeholder="Ali & Sara’s Walima" autoComplete="off" />
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField path="hostName" label="Host’s name" value={draft.hostName} onChange={(hostName) => update({ hostName })} autoComplete="name" maxLength={60} />
          <TextField
            path="hostPhone"
            label="Host’s mobile number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={draft.hostPhone}
            onChange={(hostPhone) => update({ hostPhone })}
            placeholder="0300-1234567"
            hint={phone ? `We’ll save it as ${formatPkMobile(phone)}.` : '03XX-XXXXXXX or +92 3XX XXXXXXX.'}
          />
        </div>
        <TextArea path="specialRequests" label="Special requests (optional)" value={draft.specialRequests} onChange={(specialRequests) => update({ specialRequests })} maxLength={500} rows={4} hint="Seating, stage, dietary needs, arrival times. Up to 500 characters." />
      </div>
    </>
  )
}

// 3. Add-ons ---------------------------------------------------------------------------------------------------

const ADD_ON_ICONS = {
  sound_system: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z M12 6h.01 M8 14a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  smd: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M8 21h8 M12 17v4',
}

export function AddOnsStep() {
  const { draft, update, venue } = useWizard()
  const addOns = (venue.addOns ?? []).filter((addOn) => addOn.isAvailable)
  const setQuantity = (addOnId, quantity) => update((current) => ({ addOns: { ...current.addOns, [addOnId]: quantity } }))
  return (
    <>
      <StepHeading title="Add sound or a screen" subtitle={`Extras ${venue.name} offers for your slot. Skip this if you don’t need any.`} />
      {addOns.length === 0 ? (
        <div className={`${card} flex flex-col items-start gap-2 p-6`}>
          <h2 className="font-heading text-[18px] font-semibold text-ink-strong">No add-ons at this venue</h2>
          <p className="text-[15px] text-muted-warm">{venue.name} doesn’t list sound or screen add-ons. Ask in Special requests if you need anything, then press Next.</p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {addOns.map((addOn) => {
            const quantity = draft.addOns?.[addOn.addOnId] ?? 0
            return (
              <li key={addOn.addOnId} className={`${card} flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${quantity ? 'ring-1 ring-primary' : ''}`}>
                <div className="flex min-w-0 gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blush text-primary" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ADD_ON_ICONS[addOn.type]} />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-semibold text-ink-strong">{addOn.name}</h2>
                    {addOn.description && <p className="mt-0.5 text-[15px] text-muted-warm">{addOn.description}</p>}
                    <p className="mt-1 text-[15px] font-medium text-ink-strong">
                      {rs(toPaisa(addOn.price))} <span className="font-normal text-muted-warm">each · available on {formatEventDate(draft.date)}</span>
                    </p>
                  </div>
                </div>
                <div className="sm:w-[180px]">
                  <Counter label="Quantity" value={quantity} min={0} max={MAX_ADD_ON_QUANTITY} onChange={(value) => setQuantity(addOn.addOnId, value)} id={fieldId(`addOns.${addOn.addOnId}`)} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

// 4. Price breakdown -------------------------------------------------------------------------------------------

export function PriceStep() {
  const { venue, price, draft } = useWizard()
  return (
    <>
      <StepHeading title="Price breakdown" subtitle="What you’ll pay the venue, what’s due as an advance, and the venue’s rules." />
      <PriceTable price={price} />
      <PolicySection terms={venue.bookingTerms} date={draft.date} />
      <HouseRules rules={venue.bookingTerms?.houseRules ?? []} />
    </>
  )
}

export function PriceTable({ price }) {
  const balance = price.totalPaisa - price.advancePaisa
  return (
    <section aria-labelledby="price-title" className={`${card} p-5 sm:p-6`}>
      <h2 id="price-title" className="font-heading text-[18px] font-semibold text-ink-strong">
        Your total
      </h2>
      <table className="mt-3 w-full text-[15px]">
        <caption className="sr-only">Price breakdown in Pakistani rupees</caption>
        <tbody>
          {price.lines.map((line) => (
            <tr key={line.key} className="border-b border-line">
              <th scope="row" className="py-3 pr-4 text-left font-normal">
                <span className="block font-medium text-ink-strong">{line.label}</span>
                <span className="text-[14px] text-muted-warm">{line.detail}</span>
              </th>
              <td className="whitespace-nowrap py-3 text-right align-top tabular-nums text-ink-strong">{rs(line.paisa)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="pt-4 text-left font-heading text-[17px] font-semibold text-ink-strong">
              Total
            </th>
            <td className="whitespace-nowrap pt-4 text-right font-heading text-[22px] font-semibold tabular-nums text-ink-strong">{rs(price.totalPaisa)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-5 grid gap-3 rounded-2xl bg-blush p-4 sm:grid-cols-2">
        <p>
          <span className="block text-[14px] text-muted-warm">Advance ({price.advancePercent}%), after the venue accepts</span>
          <span className="font-heading text-[19px] font-semibold tabular-nums text-primary">{rs(price.advancePaisa)}</span>
        </p>
        <p>
          <span className="block text-[14px] text-muted-warm">Balance, paid to the venue later</span>
          <span className="font-heading text-[19px] font-semibold tabular-nums text-ink-strong">{rs(balance)}</span>
        </p>
      </div>
      <p className="mt-3 text-[14px] text-muted-warm">MarkieSharkie doesn’t take payments. You pay the venue directly and the venue records it here.</p>
    </section>
  )
}

export function PolicySection({ terms, date }) {
  const info = policyInfo(terms)
  const tiers = cancellationTiers(terms)
  const daysBefore = date ? daysBetween(todayKey(), date) : null
  const nowPercent = daysBefore === null ? null : refundPercent(tiers, daysBefore)
  return (
    <section aria-labelledby="policy-title" className={`${card} mt-6 p-5 sm:p-6`}>
      <h2 id="policy-title" className="font-heading text-[18px] font-semibold text-ink-strong">
        Cancellation policy: {info.label}
      </h2>
      <p className="mt-1 text-[15px] text-muted-warm">{info.description}</p>
      <ul className="mt-3 grid gap-2">
        {tiers.map((tier) => (
          <li key={`${tier.fromDays}-${tier.toDays}`} className="flex gap-2 text-[15px] text-ink">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            {tierText(tier)}
          </li>
        ))}
      </ul>
      {nowPercent !== null && (
        <p className="mt-3 text-[14px] text-ink">
          Your event is {daysBefore} day{daysBefore === 1 ? '' : 's'} away: cancelling today returns <strong>{nowPercent}%</strong> of any advance paid.
        </p>
      )}
      <p className="mt-2 text-[14px] text-muted-warm">You can always cancel before the event date; the venue settles any refund with you.</p>
    </section>
  )
}

function HouseRules({ rules }) {
  return (
    <section aria-labelledby="rules-title" className={`${card} mt-6 p-5 sm:p-6`}>
      <h2 id="rules-title" className="font-heading text-[18px] font-semibold text-ink-strong">
        House rules
      </h2>
      {rules.length ? (
        <ul className="mt-3 grid gap-2">
          {rules.map((rule) => (
            <li key={rule} className="flex gap-2 text-[15px] text-ink">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              {rule}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[15px] text-muted-warm">The venue hasn’t listed any house rules.</p>
      )}
    </section>
  )
}

// 5. Review & request ------------------------------------------------------------------------------------------

function Summary({ title, step, children }) {
  const { venue } = useWizard()
  return (
    <section className={`${card} flex items-start justify-between gap-4 p-5 sm:p-6`}>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-ink-strong">{title}</h2>
        <div className="mt-1 text-[15px] leading-relaxed text-ink">{children}</div>
      </div>
      <Link to={`/venues/${venue.id}/book/${step}?from=review`} className={editLink}>
        Edit<span className="sr-only"> {title.toLowerCase()}</span>
      </Link>
    </section>
  )
}

export function ReviewStep() {
  const { draft, update, venue, price, errorFor, touch } = useWizard()
  const hall = venue.halls.find((h) => h.hallId === draft.hallId)
  const slot = slotPreset(draft.slot)
  const menu = venue.menuPackages.find((m) => m.menuId === draft.menuId)
  const eventType = EVENT_TYPES.find((t) => t.value === draft.eventType)?.label
  const addOns = (venue.addOns ?? []).filter((a) => draft.addOns?.[a.addOnId])
  const agreedError = errorFor('agreed')
  return (
    <>
      <StepHeading title="Review and request" subtitle="Check everything once more. Sending the request keeps this slot for you while the venue decides." />
      <div className="grid gap-4">
        <Summary title="Your selection" step="selection">
          {venue.name} · {hall?.name}
          <span className="block">
            {formatEventDate(draft.date)}, {slot.label} ({slot.time})
          </span>
          <span className="block text-muted-warm">
            {Number(draft.guests).toLocaleString('en-US')} guests{menu ? ` · ${menu.name}` : ''}
          </span>
        </Summary>
        <Summary title="Event details" step="details">
          {draft.eventName} · {eventType}
          <span className="block text-muted-warm">
            Host: {draft.hostName}, {formatPkMobile(normalizePkMobile(draft.hostPhone))}
          </span>
          {draft.specialRequests.trim() && <span className="mt-1 block whitespace-pre-line break-words text-muted-warm">“{draft.specialRequests.trim()}”</span>}
        </Summary>
        <Summary title="Add-ons" step="add-ons">
          {addOns.length ? addOns.map((a) => `${draft.addOns[a.addOnId]} × ${a.name}`).join(', ') : 'None'}
        </Summary>
        <Summary title="Price" step="price">
          <span className="font-semibold tabular-nums">{rs(price.totalPaisa)}</span> total
          <span className="block text-muted-warm">
            Advance {rs(price.advancePaisa)} ({price.advancePercent}%) after the venue accepts · {policyInfo(venue.bookingTerms).label} cancellation policy
          </span>
        </Summary>
      </div>

      <div className={`mt-6 rounded-2xl border p-4 sm:p-5 ${agreedError ? 'border-danger bg-danger-bg' : 'border-line bg-surface/60'}`}>
        <div className="flex items-start gap-3">
          <input
            id={fieldId('agreed')}
            type="checkbox"
            checked={draft.agreed}
            onChange={(event) => update({ agreed: event.target.checked })}
            onBlur={() => touch('agreed')}
            aria-invalid={agreedError ? 'true' : undefined}
            aria-describedby={agreedError ? `${fieldId('agreed')}-error` : undefined}
            className="mt-0.5 size-6 shrink-0 cursor-pointer accent-primary"
          />
          <label htmlFor={fieldId('agreed')} className="cursor-pointer text-[16px] leading-snug text-ink-strong">
            I agree to the cancellation policy and house rules
            <span className="mt-1 block text-[14px] text-muted-warm">
              See them on <Link to={`/venues/${venue.id}/book/price?from=review`} className="font-medium text-primary underline underline-offset-2">Price breakdown</Link>.
            </span>
          </label>
        </div>
        <ErrorText id={`${fieldId('agreed')}-error`}>{agreedError}</ErrorText>
      </div>
      <p className="mt-4 text-[14px] text-muted-warm">No payment now. The venue accepts or declines your request; then you pay the advance to the venue directly.</p>
    </>
  )
}
