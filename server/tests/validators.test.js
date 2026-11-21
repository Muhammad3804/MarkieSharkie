import { describe, expect, it } from 'vitest'
import {
  EMAIL_MESSAGE,
  PHONE_MESSAGE,
  emailSchema,
  identifierSchema,
  moneySchema,
  nameSchema,
  normalizePkMobile,
  passwordSchema,
  phoneSchema,
  preferencesSchema,
} from '../src/lib/validators.js'
import { issuesToDetails } from '../src/lib/validation.js'

const messages = (result) => result.error.issues.map((i) => i.message)

describe('REQ-1 Pakistani mobile numbers', () => {
  it.each([
    ['0300-1234567', '+923001234567'],
    ['03001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['+923001234567', '+923001234567'],
    ['  0321 - 765 4321 ', '+923217654321'],
    ['+92-345-1112223', '+923451112223'],
  ])('normalises %s to %s (users_phone_pk_format)', (input, expected) => {
    expect(normalizePkMobile(input)).toBe(expected)
    expect(phoneSchema.parse(input)).toBe(expected)
  })

  it.each([
    '0300-123456',
    '0300-12345678',
    '04001234567',
    '923001234567',
    '+9230012345678',
    '+92 400 1234567',
    'abc',
    '',
  ])('rejects %j with the fix-it message', (input) => {
    expect(normalizePkMobile(input)).toBeNull()
    const result = phoneSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(messages(result)).toEqual([PHONE_MESSAGE])
  })

  it('rejects a non-string with the same message', () => {
    expect(messages(phoneSchema.safeParse(3001234567))).toEqual([PHONE_MESSAGE])
  })
})

describe('REQ-1 email', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Sara.Khan@Example.PK ')).toBe('sara.khan@example.pk')
  })
  it.each(['sara', 'sara@', '@example.pk', 'sara example.pk'])('rejects %j', (input) => {
    expect(messages(emailSchema.safeParse(input))).toEqual([EMAIL_MESSAGE])
  })
})

describe('REQ-1 password: at least 8 characters with letters and digits', () => {
  it('accepts letters + digits', () => expect(passwordSchema.parse('Shadi2025')).toBe('Shadi2025'))
  it('does not trim', () => expect(passwordSchema.parse(' abc12345 ')).toBe(' abc12345 '))
  it('rejects short', () => expect(messages(passwordSchema.safeParse('ab1'))).toContain('Use at least 8 characters.'))
  it('rejects no digit', () =>
    expect(messages(passwordSchema.safeParse('abcdefgh'))).toEqual(['Include at least one digit.']))
  it('rejects no letter', () =>
    expect(messages(passwordSchema.safeParse('12345678'))).toEqual(['Include at least one letter.']))
  it('rejects over 128', () =>
    expect(messages(passwordSchema.safeParse(`a1${'x'.repeat(127)}`))).toEqual(['Use 128 characters or fewer.']))
})

describe('name', () => {
  it('trims and requires 2-100 characters', () => {
    expect(nameSchema.parse('  Ali  ')).toBe('Ali')
    expect(nameSchema.safeParse(' A ').success).toBe(false)
    expect(nameSchema.safeParse('x'.repeat(101)).success).toBe(false)
  })
})

describe('REQ-2 login identifier: email or mobile', () => {
  it('detects email', () =>
    expect(identifierSchema.parse(' Ali@Example.pk ')).toEqual({ type: 'email', value: 'ali@example.pk' }))
  it('detects and normalises phone', () =>
    expect(identifierSchema.parse('+92 300 1234567')).toEqual({ type: 'phone', value: '+923001234567' }))
  it('rejects neither', () => expect(identifierSchema.safeParse('ali').success).toBe(false))
})

describe('money as decimal strings (CLAUDE.md conventions)', () => {
  it.each([
    ['350000', '350000.00'],
    ['350000.5', '350000.50'],
    ['0099.99', '99.99'],
    ['9999999999.99', '9999999999.99'],
  ])('%s -> %s', (input, expected) => expect(moneySchema.parse(input)).toBe(expected))
  it.each(['-1', '1.234', '1e5', '12345678901', 'abc', '0', '0.00'])('rejects %j', (input) =>
    expect(moneySchema.safeParse(input).success).toBe(false),
  )
  it('rejects numbers (no JS float money)', () => expect(moneySchema.safeParse(350000).success).toBe(false))
})

describe('REQ-4 customer preferences', () => {
  it('accepts the full shape and dedupes event types', () => {
    expect(
      preferencesSchema.parse({
        preferredCity: 'Lahore',
        eventTypes: ['walima', 'walima', 'mehndi'],
        guestCount: 400,
        budgetMax: '350000',
      }),
    ).toEqual({ preferredCity: 'Lahore', eventTypes: ['walima', 'mehndi'], guestCount: 400, budgetMax: '350000.00' })
  })
  it('rejects values outside the event_type enum, bad guest counts and unknown keys', () => {
    expect(preferencesSchema.safeParse({ eventTypes: ['rave'] }).success).toBe(false)
    expect(preferencesSchema.safeParse({ guestCount: 0 }).success).toBe(false)
    expect(preferencesSchema.safeParse({ guestCount: 10001 }).success).toBe(false)
    expect(preferencesSchema.safeParse({ guestCount: 2.5 }).success).toBe(false)
    expect(preferencesSchema.safeParse({ colour: 'red' }).success).toBe(false)
  })
})

describe('NFR-3 per-field error details', () => {
  it('maps paths, unknown keys and root errors to { field, message }', () => {
    const result = preferencesSchema.safeParse({ guestCount: 0, colour: 'red' })
    expect(issuesToDetails(result.error.issues, 'body')).toEqual(
      expect.arrayContaining([
        { field: 'guestCount', message: 'Guests must be at least 1.' },
        { field: 'colour', message: "This field can't be set here." },
      ]),
    )
    const root = preferencesSchema.safeParse('nope')
    expect(issuesToDetails(root.error.issues, 'body')).toEqual([
      { field: 'body', message: 'Send the fields as a JSON object.' },
    ])
  })
})
