import { describe, it, expect } from 'vitest'
import {
  checkUpload,
  sniffType,
  documentStorageKey,
  purgeAfterFor,
  MAX_DOCUMENT_BYTES,
  MAX_OTHER_DOCUMENTS,
} from '@/lib/portal/traveller-documents'

// The portal upload route is the only path in this app that accepts a FILE from
// someone with no session, and what it accepts is a passport scan. These cover
// the three checks that stand between a stranger and the bucket.

const bytes = (...head: number[]) => {
  const b = new Uint8Array(64)
  head.forEach((v, i) => { b[i] = v })
  return b
}
const ascii = (s: string, pad = 64) => {
  const b = new Uint8Array(pad)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return b
}

const PDF = ascii('%PDF-1.7')
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const webp = () => { const b = ascii('RIFF'); 'WEBP'.split('').forEach((c, i) => { b[8 + i] = c.charCodeAt(0) }); return b }
const heic = () => { const b = new Uint8Array(64); 'ftyp'.split('').forEach((c,i)=>{b[4+i]=c.charCodeAt(0)}); 'heic'.split('').forEach((c,i)=>{b[8+i]=c.charCodeAt(0)}); return b }

describe('sniffType', () => {
  it('recognises the accepted formats from their real bytes', () => {
    expect(sniffType(PDF)).toBe('application/pdf')
    expect(sniffType(JPEG)).toBe('image/jpeg')
    expect(sniffType(PNG)).toBe('image/png')
    expect(sniffType(webp())).toBe('image/webp')
  })

  it('recognises HEIC, which is what an iPhone photographs a passport as', () => {
    expect(sniffType(heic())).toBe('image/heic')
  })

  it('returns null for anything else', () => {
    expect(sniffType(ascii('<!DOCTYPE html>'))).toBeNull()
    expect(sniffType(ascii('#!/bin/sh'))).toBeNull()
    expect(sniffType(bytes(0x4d, 0x5a))).toBeNull()   // DOS/PE executable
    expect(sniffType(new Uint8Array(0))).toBeNull()
  })

  it('does not mistake a truncated header for a match', () => {
    expect(sniffType(bytes(0x89, 0x50))).toBeNull()
    expect(sniffType(ascii('%PD'))).toBeNull()
  })
})

describe('checkUpload', () => {
  it('accepts a real passport photo and reports what it actually is', () => {
    expect(checkUpload(JPEG, 'image/jpeg')).toEqual({ ok: true, type: 'image/jpeg', ext: 'jpg' })
    expect(checkUpload(PDF, 'application/pdf')).toEqual({ ok: true, type: 'application/pdf', ext: 'pdf' })
    expect(checkUpload(heic(), 'image/heic')).toEqual({ ok: true, type: 'image/heic', ext: 'heic' })
  })

  it('refuses a type that is not on the allowlist', () => {
    expect(checkUpload(ascii('<!DOCTYPE html>'), 'text/html'))
      .toEqual({ ok: false, reason: 'type_not_allowed' })
    expect(checkUpload(JPEG, 'image/svg+xml'))
      .toEqual({ ok: false, reason: 'type_not_allowed' })
  })

  it('refuses bytes that disagree with the declared type', () => {
    // The whole point of the sniff: file.type is set by the caller.
    expect(checkUpload(ascii('<!DOCTYPE html><script>'), 'image/jpeg'))
      .toEqual({ ok: false, reason: 'content_mismatch' })
    expect(checkUpload(bytes(0x4d, 0x5a, 0x90), 'application/pdf'))
      .toEqual({ ok: false, reason: 'content_mismatch' })
  })

  it('refuses a real image announced as a different real image', () => {
    // Neither one gets to be the honest answer, so the upload fails.
    expect(checkUpload(PNG, 'image/jpeg')).toEqual({ ok: false, reason: 'content_mismatch' })
  })

  it('refuses an empty file', () => {
    expect(checkUpload(new Uint8Array(0), 'image/jpeg')).toEqual({ ok: false, reason: 'empty' })
  })

  it('refuses anything over the size ceiling', () => {
    const huge = new Uint8Array(MAX_DOCUMENT_BYTES + 1)
    huge[0] = 0xff; huge[1] = 0xd8; huge[2] = 0xff
    expect(checkUpload(huge, 'image/jpeg')).toEqual({ ok: false, reason: 'too_large' })
  })

  it('caps supporting documents but never the passport slot', () => {
    const atCap = { kind: 'other' as const, existingOtherCount: MAX_OTHER_DOCUMENTS }
    expect(checkUpload(JPEG, 'image/jpeg', atCap)).toEqual({ ok: false, reason: 'too_many' })
    // The passport is one replaceable slot, so the cap must not apply to it.
    expect(checkUpload(JPEG, 'image/jpeg', { kind: 'passport', existingOtherCount: 99 }).ok).toBe(true)
    expect(checkUpload(JPEG, 'image/jpeg', { kind: 'other', existingOtherCount: MAX_OTHER_DOCUMENTS - 1 }).ok).toBe(true)
  })
})

describe('documentStorageKey', () => {
  it('nests by booking and traveller', () => {
    expect(documentStorageKey({
      bookingId: 'aaaa-1111', passengerId: 'bbbb-2222',
      kind: 'passport', ext: 'jpg', unique: 'abc123',
    })).toBe('aaaa-1111/bbbb-2222/passport-abc123.jpg')
  })

  it('cannot be made to climb or nest by a hostile segment', () => {
    const key = documentStorageKey({
      bookingId: '../../etc', passengerId: 'a/b/c',
      kind: 'other', ext: '../sh', unique: '..',
    })
    expect(key).not.toContain('..')
    expect(key.split('/')).toHaveLength(3)
  })

  it('gives two uploads different keys, so a replace cannot land on a file still being read', () => {
    const base = { bookingId: 'b', passengerId: 'p', kind: 'passport' as const, ext: 'jpg' }
    expect(documentStorageKey({ ...base, unique: 'one' }))
      .not.toBe(documentStorageKey({ ...base, unique: 'two' }))
  })
})

describe('purgeAfterFor', () => {
  const uploaded = new Date('2026-03-01T00:00:00Z')

  it('schedules the purge for the day after the trip ends', () => {
    expect(purgeAfterFor('2026-05-20', uploaded)).toBe('2026-05-21T00:00:00.000Z')
  })

  it('ignores a time component on the end date', () => {
    expect(purgeAfterFor('2026-05-20T15:30:00Z', uploaded)).toBe('2026-05-21T00:00:00.000Z')
  })

  it('still sets a horizon for a booking with no end date', () => {
    // An undated booking must not mean a passport scan kept for ever.
    expect(purgeAfterFor(null, uploaded)).toBe('2027-03-02T00:00:00.000Z')
    expect(purgeAfterFor('', uploaded)).toBe('2027-03-02T00:00:00.000Z')
    expect(purgeAfterFor('not-a-date', uploaded)).toBe('2027-03-02T00:00:00.000Z')
  })

  it('is computed from the booking date, not the upload date', () => {
    // Stamped once at upload; the caller stores it. Recomputing at purge time
    // would let a later date change silently extend retention.
    const early = purgeAfterFor('2026-05-20', new Date('2026-01-01T00:00:00Z'))
    const late = purgeAfterFor('2026-05-20', new Date('2026-04-01T00:00:00Z'))
    expect(early).toBe(late)
  })
})
