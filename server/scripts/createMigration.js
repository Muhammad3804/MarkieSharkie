// npm run migrate:create -- add-time-slot-hall
// Creates server/migrations/NNN_add-time-slot-hall.sql with the next number.
// CLAUDE.md rule 10: also update db/schema.sql and docs/database.md in the same change.
import fs from 'node:fs'
import path from 'node:path'
import { MIGRATIONS_DIR } from './migrate.js'

const name = process.argv[2]
if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
  console.error('Usage: npm run migrate:create -- <kebab-case-name>   e.g. add-time-slot-hall')
  process.exit(1)
}

const numbers = fs
  .readdirSync(MIGRATIONS_DIR)
  .map((file) => /^(\d+)_/.exec(file)?.[1])
  .filter(Boolean)
  .map(Number)
const next = String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, '0')
const file = path.join(MIGRATIONS_DIR, `${next}_${name}.sql`)

fs.writeFileSync(
  file,
  `-- Up Migration\n-- ${next}_${name}\n-- Remember: update db/schema.sql and docs/database.md in the same change (CLAUDE.md rule 10).\n\n`,
  { flag: 'wx' },
)
console.log(`[migrate:create] created ${path.relative(process.cwd(), file)}`)
