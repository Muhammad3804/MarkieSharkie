import { toPaisa } from '../../lib/money.js'
import { billableGuests } from '../../lib/booking.js'
import { CANCELLATION_POLICIES } from '../host/options.js'

// Booking price and refund maths, all in integer paisa (CLAUDE.md: never float maths on money).
// The server repeats this when it creates the booking (docs/booking-engine.md "compute total_amount"); the client
// copy is for the live total and the breakdown screen only.

// { hall, menu, guests, billable, lines[], totalPaisa, advancePercent, advancePaisa }
// `addOns` is { [addOnId]: quantity }. Unknown or unavailable add-ons are ignored.
export function priceBreakdown(venue, { hallId, guests, menuId, addOns = {} }) {
  const hall = venue.halls.find((h) => h.hallId === hallId) ?? venue.halls[0]
  const menu = venue.menuPackages.find((m) => m.menuId === menuId) ?? venue.menuPackages[0] ?? null
  const billable = menu ? billableGuests(guests, menu) : guests
  const lines = []
  if (menu) {
    lines.push({
      key: 'menu',
      label: menu.name,
      detail: `${billable.toLocaleString('en-US')} guests × ${formatRupees(toPaisa(menu.pricePerHead))} per guest`,
      paisa: toPaisa(menu.pricePerHead) * billable,
    })
  }
  const hallPaisa = toPaisa(hall.hallCharge ?? '0.00')
  lines.push({ key: 'hall', label: `${hall.name} hire`, detail: hallPaisa === 0 ? 'Included with the menu' : 'Flat charge for the slot', paisa: hallPaisa })
  for (const addOn of venue.addOns ?? []) {
    const quantity = addOns[addOn.addOnId] ?? 0
    if (!quantity || !addOn.isAvailable) continue
    lines.push({ key: addOn.addOnId, label: addOn.name, detail: `${quantity} × ${formatRupees(toPaisa(addOn.price))}`, paisa: toPaisa(addOn.price) * quantity })
  }
  const totalPaisa = lines.reduce((sum, line) => sum + line.paisa, 0)
  const advancePercent = venue.bookingTerms?.advancePercent ?? 0
  // Round the advance to whole rupees, never up past the total.
  const advancePaisa = Math.min(totalPaisa, Math.round((totalPaisa * advancePercent) / 100 / 100) * 100)
  return { hall, menu, guests, billable, lines, totalPaisa, advancePercent, advancePaisa }
}

const grouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const formatRupees = (paisa) => `Rs. ${grouping.format(Math.round(paisa / 100))}`

// Cancellation tiers as { fromDays, toDays (null = or more), percent }. The policy is information only (progress.md
// Decisions): it never blocks a REQ-22 cancellation, and refunds are settled by the venue, not the platform.
export function cancellationTiers(terms) {
  switch (terms?.cancellationPolicy) {
    case 'flexible':
      return [
        { fromDays: 7, toDays: null, percent: 100 },
        { fromDays: 0, toDays: 7, percent: 0 },
      ]
    case 'moderate':
      return [
        { fromDays: 30, toDays: null, percent: 50 },
        { fromDays: 0, toDays: 30, percent: 0 },
      ]
    case 'custom':
      return (terms.customTiers ?? [])
        .map((tier) => ({ fromDays: Number(tier.fromDays), toDays: tier.toDays === '' || tier.toDays == null ? null : Number(tier.toDays), percent: Number(tier.refundPercent) }))
        .filter((tier) => Number.isInteger(tier.fromDays) && Number.isInteger(tier.percent))
        .sort((a, b) => b.fromDays - a.fromDays)
    case 'strict':
    default:
      return [{ fromDays: 0, toDays: null, percent: 0 }]
  }
}

export function policyInfo(terms) {
  const policy = CANCELLATION_POLICIES.find((p) => p.value === terms?.cancellationPolicy) ?? CANCELLATION_POLICIES.find((p) => p.value === 'strict')
  return { label: policy.label, description: policy.value === 'custom' ? 'Refund depends on how many days before the event you cancel.' : policy.description }
}

export function tierText(tier) {
  const range = tier.toDays === null ? `${tier.fromDays} or more days before` : tier.fromDays === 0 ? `Less than ${tier.toDays} days before` : `${tier.fromDays} to ${tier.toDays} days before`
  return `${range}: ${tier.percent}% of the advance back`
}

export function refundPercent(tiers, daysBefore) {
  const tier = tiers.find((t) => daysBefore >= t.fromDays && (t.toDays === null || daysBefore < t.toDays))
  return tier?.percent ?? 0
}

// Refund (paisa) on the advance actually paid, if cancelled `daysBefore` days before the event.
export function refundFor(terms, advancePaidPaisa, daysBefore) {
  const percent = refundPercent(cancellationTiers(terms), daysBefore)
  return { percent, paisa: Math.round((advancePaidPaisa * percent) / 100) }
}
