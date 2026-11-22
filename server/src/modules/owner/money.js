// Money as integer paisa (CLAUDE.md: never JS float math for money). '2500.5' -> 250050 -> '2500.50'.
export const paisa = (text) => {
  const [whole, fraction = ''] = String(text).split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
}
export const money = (p) => `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`
export const intOrNull = (text) => (text === '' || text === undefined || text === null ? null : Number(text))
