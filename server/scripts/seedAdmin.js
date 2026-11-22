// npm run seed:admin                    -> creates the admin from .env if it doesn't exist yet (safe to run again)
// npm run seed:admin -- --reset-password -> also sets an existing admin's password to SEED_ADMIN_PASSWORD
//
// REQ-1: admins can't sign up through the API (registration only accepts customer / venue_owner / decorator).
// This seeds one admin from SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_PHONE and
// SEED_ADMIN_CITY (users.phone and users.city are NOT NULL), with the same validation and argon2id hashing as
// registration. The password is never printed.
import { loadDotenv } from '../src/config/dotenv.js'
import { maskPhone } from '../src/lib/logger.js'

loadDotenv()

const { adminAccountSchema } = await import('../src/modules/auth/schemas.js')
const { ensureAdmin } = await import('../src/modules/auth/service.js')
const { AppError } = await import('../src/lib/AppError.js')
const { pool } = await import('../src/db/pool.js')

const resetPassword = process.argv.includes('--reset-password')

const VARS = {
  name: 'SEED_ADMIN_NAME',
  email: 'SEED_ADMIN_EMAIL',
  password: 'SEED_ADMIN_PASSWORD',
  phone: 'SEED_ADMIN_PHONE',
  city: 'SEED_ADMIN_CITY',
}

async function main() {
  const raw = Object.fromEntries(Object.entries(VARS).map(([field, name]) => [field, process.env[name] ?? '']))
  const missing = Object.entries(VARS)
    .filter(([field]) => !raw[field].trim())
    .map(([, name]) => name)
  if (missing.length) throw new Error(`Set ${missing.join(', ')} in .env (see .env.example).`)

  const parsed = adminAccountSchema.safeParse(raw)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${VARS[i.path[0]] ?? i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid seed values:\n  ${problems.join('\n  ')}`)
  }

  const { status, admin } = await ensureAdmin(parsed.data, { resetPassword })
  if (status === 'created') {
    console.log(`[seed:admin] Admin created: ${admin.name} <${admin.email}>, ${maskPhone(admin.phone)}`)
  } else if (status === 'password_reset') {
    console.log(`[seed:admin] Admin ${admin.email} already existed; password updated and its sessions ended.`)
  } else {
    console.log(
      `[seed:admin] Admin ${admin.email} already exists; nothing changed (pass --reset-password to update the password).`,
    )
  }
  console.log('[seed:admin] Log in through the app; the admin home page is /admin.')
}

try {
  await main()
} catch (err) {
  console.error(`[seed:admin] ${err instanceof AppError || err instanceof Error ? err.message : 'failed'}`)
  process.exitCode = 1
} finally {
  await pool.end().catch(() => {})
}
