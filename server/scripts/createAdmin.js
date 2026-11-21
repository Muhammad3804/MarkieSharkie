// npm run create-admin
// REQ-1 "Admins are created only by an existing Admin". The very first admin has no admin to create it, so it comes
// from this CLI (docs/api-and-security.md "Authentication"). No HTTP route can create an admin.
// Same validation rules as registration; users(role='admin') + admins inserted in one transaction.
import readline from 'node:readline/promises'
import { citySchema, emailSchema, nameSchema, passwordSchema, phoneSchema } from '../src/lib/validators.js'
import { AppError } from '../src/lib/AppError.js'
import { maskPhone } from '../src/lib/logger.js'
import { createAdmin } from '../src/modules/auth/service.js'
import { pool } from '../src/db/pool.js'

const interactive = Boolean(process.stdin.isTTY)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive })

// The async iterator buffers lines, so piped input (all lines arriving at once) works as well as typing.
// rl.question() would drop lines that arrive before the next question is asked.
const lines = rl[Symbol.asyncIterator]()

// Hidden input: while muted, readline's echo of typed characters (and its prompt redraws) are swallowed.
let muted = false
const writeToOutput = rl._writeToOutput?.bind(rl)
if (writeToOutput) rl._writeToOutput = (text) => muted || writeToOutput(text)

async function ask(question, { hidden = false } = {}) {
  rl.setPrompt(question)
  rl.prompt()
  if (hidden) muted = true
  try {
    const { value, done } = await lines.next()
    if (done) throw new Error('Input ended before every answer was given.')
    return value
  } finally {
    if (hidden) {
      muted = false
      if (interactive) process.stdout.write('\n')
    }
  }
}

// Ask until the value passes its schema (interactive) or fail on the first bad value (piped input).
async function askValid(label, schema, { hidden = false } = {}) {
  for (;;) {
    const raw = await ask(`${label}: `, { hidden })
    const result = schema.safeParse(raw)
    if (result.success) return result.data
    const messages = result.error.issues.map((i) => i.message).join(' ')
    if (!interactive) throw new Error(`${label}: ${messages}`)
    console.log(`  ${messages}`)
  }
}

async function main() {
  console.log('Create a MarkieSharkie admin account (REQ-1). Press Ctrl+C to cancel.\n')
  const name = await askValid('Full name', nameSchema)
  const email = await askValid('Email', emailSchema)
  const phone = await askValid('Mobile (e.g. 0300-1234567)', phoneSchema)
  const city = await askValid('City', citySchema)

  let password
  for (;;) {
    password = await askValid('Password (8+ characters, letters and digits)', passwordSchema, { hidden: true })
    const confirm = await ask('Confirm password: ', { hidden: true })
    if (confirm === password) break
    if (!interactive) throw new Error('Passwords do not match.')
    console.log("  Passwords don't match. Try again.")
  }

  const admin = await createAdmin({ name, email, phone, city, password })
  console.log(`\nAdmin created: ${admin.name} <${admin.email}>, ${maskPhone(admin.phone)}, id ${admin.id}`)
  console.log('Log in through POST /api/auth/login; the admin home page is /admin.')
}

try {
  await main()
} catch (err) {
  if (err instanceof AppError) console.error(`\n[create-admin] ${err.message}`)
  else console.error(`\n[create-admin] failed: ${err.message}`)
  process.exitCode = 1
} finally {
  rl.close()
  await pool.end().catch(() => {})
}
