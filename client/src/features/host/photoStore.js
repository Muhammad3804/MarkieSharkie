import { useEffect, useSyncExternalStore } from 'react'

// Photo files for the host draft. The draft itself (localStorage) only keeps photo metadata; the files live in
// IndexedDB so a refresh or "Save & exit" doesn't lose them. If IndexedDB is unavailable (private mode, blocked
// storage) the files are kept in memory for this page load only. Nothing is uploaded until the upload API
// exists (REQ-8/REQ-9: upload -> pending -> AI check).
const DB_NAME = 'markiesharkie-host'
const STORE = 'photos'
const urls = new Map() // imageId -> object URL (also keeps the file alive when IndexedDB is unavailable)
const deleted = new Set() // ids removed while a load may still be in flight
const listeners = new Set()
let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(STORE)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

async function run(mode, action) {
  const db = await openDb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      const request = action(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => resolve(undefined)
      tx.onabort = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

function emit() {
  for (const listener of listeners) listener()
}

function setUrl(imageId, blob) {
  if (urls.has(imageId)) return
  urls.set(imageId, URL.createObjectURL(blob))
}

// Resolves false when the file couldn't be stored, so the UI can warn that it only lasts until a refresh.
export async function savePhoto(imageId, file) {
  deleted.delete(imageId)
  setUrl(imageId, file)
  emit()
  const stored = await run('readwrite', (store) => store.put(file, imageId))
  if (stored === undefined) console.warn('[host] photo kept in memory only; it will be lost on refresh')
  return stored !== undefined
}

export async function deletePhotos(imageIds) {
  for (const id of imageIds) {
    deleted.add(id)
    const url = urls.get(id)
    if (url) URL.revokeObjectURL(url)
    urls.delete(id)
  }
  emit()
  await run('readwrite', (store) => {
    let last
    for (const id of imageIds) last = store.delete(id)
    return last ?? store.count()
  })
}

export async function clearPhotos() {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  for (const id of urls.keys()) deleted.add(id)
  urls.clear()
  emit()
  await run('readwrite', (store) => store.clear())
}

// Load any files that aren't in memory yet (after a refresh). Missing files resolve to "missing".
const missing = new Set()
async function loadPhotos(imageIds) {
  const toLoad = imageIds.filter((id) => !urls.has(id) && !missing.has(id))
  if (!toLoad.length) return
  const results = await Promise.all(toLoad.map((id) => run('readonly', (store) => store.get(id))))
  toLoad.forEach((id, index) => {
    const blob = results[index]
    if (deleted.has(id)) return // removed while loading: don't bring it back
    if (blob instanceof Blob) {
      setUrl(id, blob)
    } else {
      missing.add(id)
    }
  })
  emit()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let version = 0
listeners.add(() => {
  version += 1
})
const getVersion = () => version

// { url(imageId) -> string | undefined, isMissing(imageId) -> boolean }. Re-renders when files load.
export function usePhotoUrls(imageIds) {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  const key = imageIds.join(',')
  useEffect(() => {
    if (key) loadPhotos(key.split(','))
  }, [key])
  return { url: (id) => urls.get(id), isMissing: (id) => missing.has(id) }
}
