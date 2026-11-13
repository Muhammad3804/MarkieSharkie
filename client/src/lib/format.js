const pkr = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })

// "3:05 PM", shown in Pakistan time like every other timestamp in the app.
export function formatTime(date) {
  return time.format(date)
}

// Money arrives from the API as a decimal string ("3755.00"); never do float math on it, only display it.
export function formatPKR(amount) {
  return `Rs. ${pkr.format(Number(amount))}`
}
