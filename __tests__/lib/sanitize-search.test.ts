import { describe, it, expect } from 'vitest'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'

describe('sanitizeSearchTerm — PostgREST .or() injection guard', () => {
  it('strips the metacharacters used to break out of an ilike condition', () => {
    // A classic injection: close the value and add an always-true OR condition.
    const malicious = 'x,is_active.eq.true)'
    const out = sanitizeSearchTerm(malicious)
    expect(out).not.toMatch(/[,()*:%\\]/)
    expect(out).toBe('x is_active.eq.true') // commas/parens gone → no new condition
  })

  it('drops user-supplied wildcards and casts', () => {
    expect(sanitizeSearchTerm('%admin%')).toBe('admin')
    expect(sanitizeSearchTerm('a::text')).toBe('a text')
    expect(sanitizeSearchTerm('a*b')).toBe('a b')
  })

  it('preserves ordinary names and emails', () => {
    expect(sanitizeSearchTerm('  John O Brien ')).toBe('John O Brien')
    expect(sanitizeSearchTerm('user@example.com')).toBe('user@example.com')
  })

  it('returns "" for non-strings (falsy → search guard skipped)', () => {
    expect(sanitizeSearchTerm(null)).toBe('')
    expect(sanitizeSearchTerm(undefined)).toBe('')
    expect(sanitizeSearchTerm(123)).toBe('')
  })

  it('bounds the length to 100 chars', () => {
    expect(sanitizeSearchTerm('a'.repeat(500)).length).toBe(100)
  })
})
