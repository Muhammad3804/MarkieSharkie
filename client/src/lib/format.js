const pkr = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// Money arrives from the API as a decimal string ("3755.00"); never do float math on it, only display it.
export function formatPKR(amount) {
  return `Rs. ${pkr.format(Number(amount))}`
}
