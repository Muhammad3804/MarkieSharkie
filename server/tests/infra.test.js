import fs from 'node:fs'
import path from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../src/lib/AppError.js'
import { createLogger } from '../src/lib/logger.js'
import { errorHandler } from '../src/middleware/errorHandler.js'
import { withTransaction } from '../src/db/withTransaction.js'
import { api, bearer, cookie, refreshCookieValue, testApp } from './helpers/app.js'
import { count, pool, resetDb } from './helpers/db.js'
import { account, PASSWORD } from './helpers/factories.js'

const here = path.dirname(fileURLToPath(import.meta.url))

beforeEach(resetDb)

describe('GET /api/health', () => {
  it('runs SELECT 1 and reports the DB as up', async () => {
    const res = await api().get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', db: 'up' })
  })
})

describe('error handling (CLAUDE.md "Errors")', () => {
  it('unknown route -> 404 NOT_FOUND in the standard shape', async () => {
    const res = await api().get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('unknown errors -> 500 INTERNAL_ERROR without stack, SQL or driver details', async () => {
    const app = express()
    app.use((req, _res, next) => {
      req.log = createLogger({ level: 'silent' })
      next()
    })
    app.get('/boom', () => {
      const err = new Error('duplicate key value violates unique constraint "users_phone_key"')
      Object.assign(err, {
        code: '23505',
        detail: 'Key (phone)=(+923001234567) already exists.',
        query: 'SELECT secret',
      })
      throw err
    })
    app.use(errorHandler)
    const res = await request(app).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: expect.any(String) } })
    expect(res.text).not.toMatch(/users_phone_key|923001234567|SELECT|stack|at /)
  })

  it('AppError keeps status, code, message and details', async () => {
    const app = express()
    app.get('/x', () => {
      throw new AppError(409, 'PHONE_TAKEN', 'Taken.', [{ field: 'phone', message: 'Taken.' }])
    })
    app.use(errorHandler)
    const res = await request(app).get('/x')
    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error: { code: 'PHONE_TAKEN', message: 'Taken.', details: [{ field: 'phone', message: 'Taken.' }] },
    })
  })

  it('malformed JSON -> 400 INVALID_JSON, oversized body -> 413', async () => {
    const bad = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"identifier":')
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('INVALID_JSON')

    const huge = await api()
      .post('/api/auth/login')
      .send({ identifier: 'a@b.pk', password: 'x'.repeat(1024 * 1024 + 10) })
    expect(huge.status).toBe(413)
    expect(huge.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('validate() rejects unknown keys (.strict())', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'a@b.pk', password: 'x', remember: true })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toContainEqual({ field: 'remember', message: "This field can't be set here." })
  })
})

describe('hardening (docs/api-and-security.md)', () => {
  it('sends helmet headers and no x-powered-by', async () => {
    const res = await api().get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('CORS allows only CLIENT_ORIGIN, with credentials', async () => {
    const ok = await api().get('/api/health').set('Origin', 'http://localhost:5173')
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(ok.headers['access-control-allow-credentials']).toBe('true')

    const evil = await api().get('/api/health').set('Origin', 'https://evil.example')
    expect(evil.headers['access-control-allow-origin']).not.toBe('https://evil.example')
  })
})

describe('withTransaction', () => {
  it('rolls back everything when the callback throws', async () => {
    await expect(
      withTransaction(async (client) => {
        await client.query(
          `INSERT INTO users (name, email, phone, password_hash, role, city)
           VALUES ('Rollback', 'rb@example.pk', '+923009999999', 'x', 'customer', 'Lahore')`,
        )
        throw new Error('fail after insert')
      }),
    ).rejects.toThrow('fail after insert')
    expect(await count("SELECT count(*) FROM users WHERE email = 'rb@example.pk'")).toBe(0)
  })

  it('releases the client (pool does not leak connections)', async () => {
    for (let i = 0; i < 15; i++) await withTransaction((client) => client.query('SELECT 1'))
    expect(pool.totalCount).toBeLessThanOrEqual(10)
    expect(pool.waitingCount).toBe(0)
  })
})

describe('migration 001', () => {
  it('is an exact copy of db/schema.sql', () => {
    const schema = fs.readFileSync(path.resolve(here, '../../db/schema.sql'))
    const migration = fs.readFileSync(path.resolve(here, '../migrations/001_initial-schema.sql'))
    expect(migration.equals(schema)).toBe(true)
  })

  it('has been applied to the test database (all ERD tables exist)', async () => {
    const tables = await count(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users','customers','venue_owners','decorators','admins','refresh_tokens','search_history','bookings')",
    )
    expect(tables).toBe(8)
  })
})

describe('logging: no passwords, tokens, hashes or full phone numbers', () => {
  it('request logs stay clean through register, login, refresh, /me and errors', async () => {
    const lines = []
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(chunk.toString())
        done()
      },
    })
    const agent = api(testApp({ logger: createLogger({ level: 'trace', destination: sink }) }))

    const body = account('venue_owner')
    await agent.post('/api/auth/register').send(body).expect(201)
    await agent.post('/api/auth/register').send(body).expect(409)
    await agent.post('/api/auth/login').send({ identifier: body.phone, password: 'Wrong12345' }).expect(401)
    const login = await agent.post('/api/auth/login').send({ identifier: body.email, password: PASSWORD }).expect(200)
    const refreshToken = refreshCookieValue(login)
    const refreshed = await agent.post('/api/auth/refresh').set('Cookie', cookie(refreshToken)).expect(200)
    await agent.get('/api/me').set('Authorization', bearer(refreshed.body.accessToken)).expect(200)

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [body.email])
    const output = lines.join('')
    expect(lines.length).toBeGreaterThan(5)
    for (const secret of [
      PASSWORD,
      'Wrong12345',
      rows[0].password_hash,
      login.body.accessToken,
      refreshed.body.accessToken,
      refreshToken,
      body.phone.replace(/\D/g, '').slice(1), // the digits of the mobile in any format
      body.contactNumber.replace(/\D/g, '').slice(1),
    ]) {
      expect(output).not.toContain(secret)
    }
  })
})
