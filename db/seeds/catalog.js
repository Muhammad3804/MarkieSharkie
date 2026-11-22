// Loads the client's mock catalogue (client/src/features/venues/mockVenues.js) in Node, so the seeded venues are
// exactly what the website showed before the venues API: same names, halls, menus, photos, reviews and terms.
//
// mockVenues.js imports its photos the Vite way (`import hall1Img from '../../assets/gallery/hall-1.webp'`), which
// Node can't run. This copies mockVenues.js and constants.js into a temp folder, turns each image import into a
// plain string (`const hall1Img = 'asset:gallery/hall-1.webp'`) and imports the copy. The client files are not
// changed and no venue data is duplicated in the repo. Only imports are allowed in this file (no npm packages):
// it lives outside server/, where node_modules can't be resolved.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const CLIENT_VENUES_DIR = path.resolve(here, '../../client/src/features/venues')
export const CLIENT_ASSETS_DIR = path.resolve(here, '../../client/src/assets')
export const ASSET_PREFIX = 'asset:'

const IMAGE_IMPORT = /^import (\w+) from '\.\.\/\.\.\/assets\/([^']+)'$/gm

export async function loadMockCatalog() {
  const source = fs.readFileSync(path.join(CLIENT_VENUES_DIR, 'mockVenues.js'), 'utf8')
  const constants = fs.readFileSync(path.join(CLIENT_VENUES_DIR, 'constants.js'), 'utf8')
  const rewritten = source.replace(
    IMAGE_IMPORT,
    (_line, name, rel) => `const ${name} = ${JSON.stringify(ASSET_PREFIX + rel)}`,
  )
  if (/from '\.\.\/\.\.\/assets\//.test(rewritten))
    throw new Error('mockVenues.js has an asset import the seed can not read')

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markie-seed-'))
  try {
    fs.writeFileSync(path.join(dir, 'constants.js'), constants)
    fs.writeFileSync(path.join(dir, 'mockVenues.js'), rewritten)
    fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}')
    const mod = await import(pathToFileURL(path.join(dir, 'mockVenues.js')).href)
    return { landingSections: mod.landingSections, venues: mod.getAllMockVenues() }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// 'asset:gallery/hall-1.webp' -> { source: <client asset path>, fileName: 'gallery-hall-1.webp' }
export function assetFile(value) {
  if (typeof value !== 'string' || !value.startsWith(ASSET_PREFIX)) return null
  const rel = value.slice(ASSET_PREFIX.length)
  return { source: path.join(CLIENT_ASSETS_DIR, rel), fileName: rel.replace(/[\\/]/g, '-') }
}
