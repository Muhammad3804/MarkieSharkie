// Pakistani mobile numbers (CLAUDE.md rule 7): accept "03XX-XXXXXXX" or "+92 3XX XXXXXXX" (spaces and dashes
// optional) and store "+923XXXXXXXXX". Returns null when the text isn't a Pakistani mobile number.
export function normalizePkMobile(text) {
  const compact = String(text).replace(/[\s-]/g, '')
  const match = /^(?:\+92|0092|92|0)(3\d{9})$/.exec(compact)
  return match ? `+92${match[1]}` : null
}

// "+923001234567" -> "+92 300 1234567" (the login modal shows numbers in +92 format).
export function formatPkMobileIntl(stored) {
  const match = /^\+92(3\d{2})(\d{7})$/.exec(stored ?? '')
  return match ? `+92 ${match[1]} ${match[2]}` : stored
}

// "+923001234567" -> "0300-1234567" for display.
export function formatPkMobile(stored) {
  const match = /^\+92(3\d{2})(\d{7})$/.exec(stored ?? '')
  return match ? `0${match[1]}-${match[2]}` : stored
}
