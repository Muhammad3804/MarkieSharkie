import { z } from 'zod'
import { loadDotenv } from './dotenv.js'
import { sameDatabase } from './sameDatabase.js'

// Secrets and settings come only from env and are validated at startup (docs/api-and-security.md "Hardening").
// The server refuses to start with a clear list of what is wrong instead of failing later at runtime.

const WEAK_SECRETS = ['change-me', 'changeme', 'secret', 'password', 'jwt-secret']

const int = (fallback, { min = 1, max = 100_000 } = {}) => z.coerce.number().int().min(min).max(max).default(fallback)

const postgresUrl = z
  .string()
  .trim()
  .min(1)
  .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// connection string')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000, { max: 65535 }),
  CLIENT_ORIGIN: z.url({ error: 'must be the frontend URL, e.g. http://localhost:5173' }),
  DATABASE_URL: postgresUrl,
  TEST_DATABASE_URL: postgresUrl.optional(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(
      32,
      "must be at least 32 characters (generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\")",
    )
    .refine(
      (v) => !WEAK_SECRETS.some((weak) => v.toLowerCase().includes(weak)),
      'is a placeholder; set a random value',
    ),
  ACCESS_TOKEN_TTL_MINUTES: int(15, { max: 60 }),
  REFRESH_TOKEN_TTL_DAYS: int(7, { max: 90 }),
  SESSION_INACTIVITY_MINUTES: int(30, { max: 24 * 60 }),
  LOGIN_MAX_ATTEMPTS: int(5, { max: 100 }),
  LOGIN_LOCK_MINUTES: int(15, { max: 24 * 60 }),
  SLOT_HOLD_MINUTES: int(10, { max: 120 }),
  // Express `trust proxy`: false (default, direct connections), true, a hop count, or a list like "loopback".
  TRUST_PROXY: z.string().trim().default('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

function parseTrustProxy(value) {
  if (value === 'true') return true
  if (value === 'false' || value === '') return false
  if (/^\d+$/.test(value)) return Number(value)
  return value
}

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

// Pure: takes a plain object (process.env in real use) and returns the typed config or throws ConfigError.
export function parseEnv(raw) {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join('.') || 'env'} ${i.message}`))
  }
  const e = result.data
  const isTest = e.NODE_ENV === 'test'

  if (isTest) {
    // Tests must never touch the dev database (Part A "Tooling").
    if (!e.TEST_DATABASE_URL) throw new ConfigError(['TEST_DATABASE_URL is required when NODE_ENV=test'])
    if (sameDatabase(e.TEST_DATABASE_URL, e.DATABASE_URL)) {
      throw new ConfigError(['TEST_DATABASE_URL points at the same database as DATABASE_URL; refusing to run tests'])
    }
  }

  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    isTest,
    port: e.PORT,
    clientOrigin: e.CLIENT_ORIGIN.replace(/\/$/, ''),
    databaseUrl: isTest ? e.TEST_DATABASE_URL : e.DATABASE_URL,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    logLevel: e.LOG_LEVEL,
    auth: Object.freeze({
      jwtSecret: e.JWT_ACCESS_SECRET,
      accessTokenTtlMinutes: e.ACCESS_TOKEN_TTL_MINUTES,
      refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
      sessionInactivityMinutes: e.SESSION_INACTIVITY_MINUTES,
      loginMaxAttempts: e.LOGIN_MAX_ATTEMPTS,
      loginLockMinutes: e.LOGIN_LOCK_MINUTES,
    }),
    slotHoldMinutes: e.SLOT_HOLD_MINUTES,
  })
}

function loadOrExit() {
  loadDotenv()
  try {
    return parseEnv(process.env)
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    console.error(`[config] ${err.message}\n[config] Fix the values in .env (see .env.example) and start again.`)
    process.exit(1)
  }
}

export const env = loadOrExit()
