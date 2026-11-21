import { describe, expect, it } from 'vitest'
import { ConfigError, parseEnv } from '../src/config/env.js'
import { sameDatabase } from '../src/config/sameDatabase.js'

const valid = {
  NODE_ENV: 'development',
  CLIENT_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://markie_app:pw@localhost:5432/markiesharkie',
  TEST_DATABASE_URL: 'postgres://markie_app:pw@localhost:5432/markiesharkie_test',
  JWT_ACCESS_SECRET: 'Zq3vN8pL0sXk2mR7tY4wB6cD9fG1hJ5aE0uI3oP8',
}

const problemsOf = (raw) => {
  try {
    parseEnv(raw)
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError)
    return err.problems.join('\n')
  }
  throw new Error('expected parseEnv to throw')
}

describe('config/env.js: refuse to start on missing or weak settings (NFR-4)', () => {
  it('parses a valid env with the documented defaults', () => {
    const env = parseEnv(valid)
    expect(env.port).toBe(4000)
    expect(env.databaseUrl).toBe(valid.DATABASE_URL)
    expect(env.trustProxy).toBe(false)
    expect(env.auth).toEqual({
      jwtSecret: valid.JWT_ACCESS_SECRET,
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 7,
      sessionInactivityMinutes: 30,
      loginMaxAttempts: 5,
      loginLockMinutes: 15,
    })
  })

  it.each(['DATABASE_URL', 'CLIENT_ORIGIN', 'JWT_ACCESS_SECRET'])('rejects a missing %s', (key) => {
    const raw = { ...valid }
    delete raw[key]
    expect(problemsOf(raw)).toContain(key)
  })

  it('rejects the "change-me" placeholder from .env.example', () => {
    expect(problemsOf({ ...valid, JWT_ACCESS_SECRET: 'change-me' })).toContain('JWT_ACCESS_SECRET')
    expect(problemsOf({ ...valid, JWT_ACCESS_SECRET: 'change-me-change-me-change-me-change-me' })).toContain(
      'placeholder',
    )
  })

  it('rejects a secret shorter than 32 characters', () => {
    expect(problemsOf({ ...valid, JWT_ACCESS_SECRET: 'a'.repeat(31) })).toContain('at least 32 characters')
  })

  it('rejects a non-postgres DATABASE_URL and a bad number', () => {
    expect(problemsOf({ ...valid, DATABASE_URL: 'mysql://x' })).toContain('DATABASE_URL')
    expect(problemsOf({ ...valid, LOGIN_MAX_ATTEMPTS: 'five' })).toContain('LOGIN_MAX_ATTEMPTS')
  })

  it('parses TRUST_PROXY values', () => {
    expect(parseEnv({ ...valid, TRUST_PROXY: 'true' }).trustProxy).toBe(true)
    expect(parseEnv({ ...valid, TRUST_PROXY: '1' }).trustProxy).toBe(1)
    expect(parseEnv({ ...valid, TRUST_PROXY: 'loopback' }).trustProxy).toBe('loopback')
  })
})

describe('test database guard (Part A tooling)', () => {
  it('uses TEST_DATABASE_URL when NODE_ENV=test', () => {
    expect(parseEnv({ ...valid, NODE_ENV: 'test' }).databaseUrl).toBe(valid.TEST_DATABASE_URL)
  })

  it('refuses to run tests against the dev database', () => {
    const sameDb = 'postgres://other_user:x@localhost/markiesharkie'
    expect(problemsOf({ ...valid, NODE_ENV: 'test', TEST_DATABASE_URL: sameDb })).toContain('same database')
    expect(problemsOf({ ...valid, NODE_ENV: 'test', TEST_DATABASE_URL: undefined })).toContain('TEST_DATABASE_URL')
  })

  it('compares host, port and database name', () => {
    expect(sameDatabase('postgres://a@localhost:5432/db', 'postgres://b:pw@localhost/db')).toBe(true)
    expect(sameDatabase('postgres://a@localhost:5432/db', 'postgres://a@localhost:5432/db_test')).toBe(false)
    expect(sameDatabase('postgres://a@localhost:5432/db', 'postgres://a@localhost:5433/db')).toBe(false)
  })
})
