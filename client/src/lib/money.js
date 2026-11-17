// Money arrives as a decimal string ("3755.00"). Convert to integer paisa for any arithmetic so we never do
// float math on money (CLAUDE.md conventions), and only format back to rupees for display.
export function toPaisa(amount) {
  const [rupees, fraction = ''] = String(amount).split('.')
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
}

const grouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// formatPaisa(42500000, 'PKR') -> "PKR 425,000"; prefix matches the design ("PKR" on the booking card, "Rs" on menus).
export function formatPaisa(paisa, prefix = 'Rs') {
  return `${prefix} ${grouping.format(Math.round(paisa / 100))}`
}

export const formatAmount = (amount, prefix) => formatPaisa(toPaisa(amount), prefix)

// 18775050 -> "187750.50", the decimal string the API sends and stores (numeric(12,2)).
export function paisaToAmount(paisa) {
  return `${Math.trunc(paisa / 100)}.${String(Math.abs(paisa % 100)).padStart(2, '0')}`
}
