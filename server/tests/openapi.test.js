import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { testApp } from './helpers/app.js'

// NFR-6 / docs/api-and-security.md: "Document every route in server/openapi.yaml. Update it in the same change as the
// route." This test makes that rule enforceable: the spec and the mounted Express routes must match exactly.

const here = path.dirname(fileURLToPath(import.meta.url))
const spec = parse(fs.readFileSync(path.resolve(here, '../openapi.yaml'), 'utf8'))
const METHODS = ['get', 'post', 'put', 'patch', 'delete']

const documented = Object.entries(spec.paths).flatMap(([p, item]) =>
  METHODS.filter((m) => item[m]).map((m) => `${m.toUpperCase()} /api${p}`),
)
const mounted = testApp().locals.routes.map((r) => `${r.method} ${r.path}`)

function refs(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => refs(n, found))
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push(value)
      else refs(value, found)
    }
  }
  return found
}

describe('server/openapi.yaml (NFR-6)', () => {
  it('is OpenAPI 3.1', () => {
    expect(spec.openapi).toMatch(/^3\.1\./)
  })

  it('documents every mounted route', () => {
    expect(mounted.length).toBeGreaterThan(0)
    expect(documented.sort()).toEqual([...new Set(mounted)].sort())
  })

  it('every $ref resolves', () => {
    for (const ref of refs(spec)) {
      const target = ref
        .replace(/^#\//, '')
        .split('/')
        .reduce((node, key) => node?.[key], spec)
      expect(target, ref).toBeDefined()
    }
  })

  it('every operation has an operationId, SRS ids and a 5xx response', () => {
    for (const [p, item] of Object.entries(spec.paths)) {
      for (const m of METHODS.filter((x) => item[x])) {
        const op = item[m]
        expect(op.operationId, `${m} ${p}`).toBeTruthy()
        if (p !== '/health') expect(op['x-srs']?.length, `${m} ${p} x-srs`).toBeGreaterThan(0)
        expect(
          Object.keys(op.responses).some((code) => code.startsWith('5')),
          `${m} ${p} 5xx`,
        ).toBe(true)
      }
    }
  })

  it('lists every error code the server can send', () => {
    const src = path.resolve(here, '../src')
    const files = fs.readdirSync(src, { recursive: true }).filter((f) => f.endsWith('.js'))
    const codes = new Set()
    for (const file of files) {
      const text = fs.readFileSync(path.join(src, file), 'utf8')
      for (const match of text.matchAll(/AppError\(\s*\d{3},\s*'([A-Z_]+)'/g)) codes.add(match[1])
      for (const match of text.matchAll(/code: '([A-Z_]+)'/g)) codes.add(match[1])
      for (const match of text.matchAll(/'(EMAIL_TAKEN|PHONE_TAKEN)'/g)) codes.add(match[1])
    }
    expect(codes.size).toBeGreaterThan(5)
    const documentedCodes = spec.components.schemas.ErrorCode.enum
    for (const code of codes) expect(documentedCodes, code).toContain(code)
  })
})
