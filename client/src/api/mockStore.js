// Tiny localStorage-backed store for the mock APIs (api/listings.js, api/admin.js) until the server exists.
// One JSON value per key, cached in memory, synced across tabs through the `storage` event. Storage can be
// blocked (private mode), so reads and writes are guarded and the store keeps working in memory for this page load.
const listeners = new Set()

// Every mock store shares one change signal, so a page that reads several of them refreshes after any action.
export function subscribeMockStores(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Tells every subscriber that data changed (the server-backed admin API uses it after a write, so pages refetch).
export function notifyStoreChange() {
  emit()
}

function emit() {
  for (const listener of listeners) listener()
}

const keys = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || keys.has(event.key)) emit()
  })
}

// `seed()` builds the first value when nothing valid is stored; `isValid(value)` rejects old or broken shapes.
export function createMockStore(key, { seed, isValid }) {
  keys.add(key)
  let memory = null
  let cachedRaw = null

  // Storage first (another tab may have written), parsed once per distinct string. If the last write failed
  // (quota, private mode), the in-memory value is newer than storage and wins.
  let writeFailed = false
  function read() {
    if (memory && writeFailed) return memory
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        if (raw === cachedRaw && memory) return memory
        const parsed = JSON.parse(raw)
        if (isValid(parsed)) {
          cachedRaw = raw
          memory = parsed
          return parsed
        }
      }
    } catch {
      // fall through to memory or a fresh seed
    }
    if (memory) return memory
    const fresh = seed()
    write(fresh)
    return fresh
  }

  function write(value) {
    memory = value
    try {
      const raw = JSON.stringify(value)
      localStorage.setItem(key, raw)
      cachedRaw = raw
      writeFailed = false
      return true
    } catch (error) {
      console.warn(`[mock] could not save ${key}`, error)
      writeFailed = true
      return false
    }
  }

  return {
    get: read,
    // recipe(current) -> next. Emits once the value is written.
    update(recipe) {
      const next = recipe(read())
      write(next)
      emit()
      return next
    },
    reset() {
      try {
        localStorage.removeItem(key)
      } catch {
        // nothing stored
      }
      memory = null
      cachedRaw = null
      writeFailed = false
      emit()
    },
  }
}

// Simulated network latency, so loading states are real. Keep it short; the UI should never feel slow.
export const latency = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms))
