// Same host + port + database name? Used to stop tests / test migrations from ever touching the dev DB.
// Kept free of src/config/env.js so scripts that don't need the JWT secret can use it.
export function sameDatabase(a, b) {
  try {
    const x = new URL(a)
    const y = new URL(b)
    const port = (u) => u.port || '5432'
    return x.hostname === y.hostname && port(x) === port(y) && x.pathname === y.pathname
  } catch {
    return a === b
  }
}
