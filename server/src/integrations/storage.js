import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env.js'

// File storage behind a small interface (docs/architecture.md "IFileStorage"), so S3 or Cloudinary can replace the
// local disk later without touching the services:
//   save(buffer, { folder, ext }) -> { key, url }      key = 'venues/owner-<id>/<random>.jpg', url = '/uploads/<key>'
//   read(key) -> Buffer
//   remove(key)
//   move(fromKey, toKey) -> rename (quarantining an AI-rejected photo, srs-alignment #42)
//   urlFor(key) -> '/uploads/<key>' (relative; the API adds its origin when it answers)
// File names are 128 random bits, never the uploader's name, so they can't be guessed or collide.

export const DEFAULT_UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
const SAFE_KEY = /^[a-z0-9][a-z0-9/_-]*\.(jpg|png|pdf|glb|webp)$/

export function createLocalStorage(root = env.uploadsDir || DEFAULT_UPLOADS_DIR) {
  const resolveKey = (key) => {
    if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error('invalid storage key')
    return path.join(root, key)
  }
  return {
    root,
    urlFor: (key) => `/uploads/${key}`,
    async save(buffer, { folder, ext }) {
      const key = `${folder}/${crypto.randomBytes(16).toString('hex')}.${ext}`
      const file = resolveKey(key)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, buffer, { flag: 'wx' })
      return { key, url: `/uploads/${key}` }
    },
    read: (key) => fs.readFile(resolveKey(key)),
    async remove(key) {
      await fs.rm(resolveKey(key), { force: true })
    },
    async move(fromKey, toKey) {
      const target = resolveKey(toKey)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.rename(resolveKey(fromKey), target)
    },
  }
}

let storage = createLocalStorage()
export const getStorage = () => storage
// Tests point storage at a temp folder.
export function setStorage(next) {
  storage = next
}

// '/uploads/venues/x.jpg' -> 'venues/x.jpg' (null for anything else).
export function keyFromUrl(url) {
  return typeof url === 'string' && url.startsWith('/uploads/') ? url.slice('/uploads/'.length) : null
}
