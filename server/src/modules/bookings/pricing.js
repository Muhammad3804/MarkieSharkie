import { money, paisa } from '../owner/money.js'

// Booking price and refund maths in integer paisa (CLAUDE.md: never float maths on money). The client has the same
// rules for its live total (client/src/features/booking/pricing.js); this is the copy that counts (EUC-24, REQ-35).

export const MIN_GUESTS = 25
export const MAX_ADD_ON_QUANTITY = 4

// menu: menu_packages row or null; addOns: [{ row, quantity }]; hallCharge: numeric text (no hall hire field yet).
export function priceBooking({ guests, menu, addOns, hallCharge = '0.00', advancePercent }) {
  const billable = menu ? Math.max(guests, menu.min_guests) : guests
  const menuPaisa = menu ? paisa(menu.price_per_head) * billable : 0
  const hallPaisa = paisa(hallCharge)
  const lines = addOns.map(({ row, quantity }) => ({
    row,
    quantity,
    unitPaisa: paisa(row.price),
    totalPaisa: paisa(row.price) * quantity,
  }))
  const totalPaisa = menuPaisa + hallPaisa + lines.reduce((sum, l) => sum + l.totalPaisa, 0)
  // The advance is rounded to whole rupees and never more than the total.
  const advancePaisa = Math.min(totalPaisa, Math.round((totalPaisa * advancePercent) / 100 / 100) * 100)
  return {
    billable,
    menuPricePerHead: menu ? menu.price_per_head : null,
    hallCharge: money(hallPaisa),
    addOns: lines.map((l) => ({ addOnId: l.row.add_on_id, quantity: l.quantity, unitPrice: money(l.unitPaisa) })),
    total: money(totalPaisa),
    advanceDue: money(advancePaisa),
    totalPaisa,
    advancePaisa,
  }
}

// Cancellation tiers as { fromDays, toDays (null = or more), percent }, newest policy rules first.
export function policyTiers(policy, customTiers = []) {
  switch (policy) {
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
      return customTiers
        .map((t) => ({ fromDays: t.from_days, toDays: t.to_days, percent: t.refund_percent }))
        .sort((a, b) => b.fromDays - a.fromDays)
    case 'strict':
    default:
      return [{ fromDays: 0, toDays: null, percent: 0 }]
  }
}

export function refundPercent(tiers, daysBefore) {
  const tier = tiers.find((t) => daysBefore >= t.fromDays && (t.toDays === null || daysBefore < t.toDays))
  return tier?.percent ?? 0
}

// Refund recorded on cancel (REQ-22; nothing is paid out by the platform, REQ-25 scope): a percentage of the advance,
// and only when the booking was confirmed (the venue confirms once the advance is settled with it).
export function refundOnCancel({ snapshot, advanceDue, wasConfirmed, daysBefore }) {
  const percent = refundPercent(snapshot?.tiers ?? [], daysBefore)
  const amount = wasConfirmed ? Math.round((paisa(advanceDue) * percent) / 100) : 0
  return { percent, amount: money(amount) }
}
