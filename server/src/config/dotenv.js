import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

// The one .env lives at the repo root (CLAUDE.md "Environment"). Variables already set in the shell win over the file,
// so `JWT_ACCESS_SECRET=... npm run dev`-style overrides and the test runner's own values keep working.
export const ROOT_ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')

let loaded = false

export function loadDotenv() {
  if (loaded) return
  dotenv.config({ path: ROOT_ENV_PATH, quiet: true })
  loaded = true
}
