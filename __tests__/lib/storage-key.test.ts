// Storage keys are assembled by interpolation, and several of the buckets they
// land in are public with upsert enabled. These pin the guarantee that a value
// arriving in a request body can only ever become ONE path segment.

import { describe, it, expect } from 'vitest'
import { safeKeySegment, safeExtension } from '@/lib/storage-key'

describe('safeKeySegment', () => {
  it('leaves real ids and document numbers exactly as they were', () => {
    // Must be a no-op on legitimate input, or applying it would relocate every
    // object already in storage.
    for (const ok of [
      'INV-2026-0001',
      '3ca07ef4-f42c-4f17-8346-6378f1eafef0',
      'DEMO-PORTAL-001',
      'SUP_INV.2026-08',
    ]) {
      expect(safeKeySegment(ok)).toBe(ok)
    }
  })

  it('cannot climb out of its directory', () => {
    expect(safeKeySegment('../../etc/passwd')).not.toContain('..')
    expect(safeKeySegment('../../etc/passwd')).not.toContain('/')
    expect(safeKeySegment('..')).toBe('unknown')
    expect(safeKeySegment('....//....//x')).not.toContain('..')
  })

  it('cannot nest itself somewhere unexpected', () => {
    expect(safeKeySegment('a/b/c')).toBe('abc')
    expect(safeKeySegment('org-logos/other-org')).toBe('org-logosother-org')
  })

  it('survives the shapes that break naive string handling', () => {
    expect(safeKeySegment(null)).toBe('unknown')
    expect(safeKeySegment(undefined)).toBe('unknown')
    expect(safeKeySegment('')).toBe('unknown')
    expect(safeKeySegment('%2f%2e%2e')).toBe('2f2e2e')
    expect(safeKeySegment('x'.repeat(5000))).toHaveLength(100)
  })
})

describe('safeExtension', () => {
  it('takes the ordinary extension', () => {
    expect(safeExtension('photo.PNG')).toBe('png')
    expect(safeExtension('scan.pdf')).toBe('pdf')
  })

  it('never returns a separator, however the name is shaped', () => {
    for (const hostile of [
      'a.b/../../c',
      'x.../../../etc/passwd',
      'f.png/../..',
      'a.',
      '.hidden',
      'no-dot',
    ]) {
      const ext = safeExtension(hostile)
      expect(ext).not.toContain('/')
      expect(ext).not.toContain('.')
      expect(ext).toMatch(/^[a-z0-9]+$/)
    }
  })

  it('falls back rather than producing an empty or absurd extension', () => {
    // Note the difference from the old `split('.').pop()`, which handed back
    // the WHOLE filename when there was no dot in it — so a file called
    // `passwd` produced the "extension" `passwd`.
    expect(safeExtension('no-dot')).toBe('bin')
    expect(safeExtension('trailing.')).toBe('bin')
    expect(safeExtension(null)).toBe('bin')
    expect(safeExtension(`x.${'y'.repeat(500)}`)).toHaveLength(10)
  })
})
