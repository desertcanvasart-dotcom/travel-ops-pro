import { describe, it, expect } from 'vitest'
// Import tooling, deliberately plain JS and outside the app bundle.
import {
  auditProgramCode,
  canonicalFieldsFor,
  canonicalFor,
  findSequenceCollisions,
  formatProgramCode,
  nextFreeSequence,
  parseProgramCode,
} from '../../scripts/lib/program-code.mjs'

const program = (over: any = {}) => ({
  duration_days: 8,
  folder: 'NRT EK',
  days: [{ is_cruise_day: false }, { is_cruise_day: true }],
  ...over,
})

describe('parseProgramCode — the canonical form', () => {
  it('decodes airport, carrier, length, sequence and type', () => {
    const c = parseProgramCode('NEK803-CR')
    expect(c).toMatchObject({
      airport: 'N',
      airport_name: 'Narita',
      carrier: 'EK',
      carrier_name: 'Emirates',
      service_class: 'economy',
      days: 8,
      sequence: '03',
      type: 'CR',
    })
    expect(c.deviations).toEqual([])
  })

  it('reads a two-digit day count from a four-digit core', () => {
    // 1005 is ten days, programme 05 — not day 1 programme 005.
    expect(parseProgramCode('NEK1005-CR')).toMatchObject({ days: 10, sequence: '05' })
    expect(parseProgramCode('NEK805-CR')).toMatchObject({ days: 8, sequence: '05' })
  })

  it('reads Kansai, which is live but absent from the Narita catalogue', () => {
    expect(parseProgramCode('KMS601-LND')).toMatchObject({
      airport: 'K',
      airport_name: 'Kansai',
      carrier: 'MS',
    })
  })

  it('reads the business-class marker', () => {
    expect(parseProgramCode('NMSBZ805-CR')).toMatchObject({
      airport: 'N',
      carrier: 'MS',
      service_class: 'business',
      days: 8,
    })
  })
})

describe('parseProgramCode — tolerating the existing catalogue', () => {
  it('reads a carrier-first code and says so, without failing', () => {
    // Historic documents are not being re-cut, so MSN805-CR has to keep
    // working; it is simply reported as deviating.
    const c = parseProgramCode('MSN805-CR')
    expect(c.valid).toBe(true)
    expect(c).toMatchObject({ airport: 'N', carrier: 'MS', days: 8, sequence: '05' })
    expect(c.deviations.map(d => d.kind)).toContain('order')
  })

  it('reads a hyphenated prefix', () => {
    const c = parseProgramCode('MSN-601')
    expect(c).toMatchObject({ airport: 'N', carrier: 'MS', days: 6, sequence: '01' })
    expect(c.deviations.map(d => d.kind)).toEqual(
      expect.arrayContaining(['prefix_hyphen', 'missing_type'])
    )
  })

  it('flags a code with no departure airport at all', () => {
    // MSBZ805-CR names the carrier and the cabin but not the airport, which
    // matters now that Kansai sells too.
    const c = parseProgramCode('MSBZ805-CR')
    expect(c).toMatchObject({ carrier: 'MS', airport: null, service_class: 'business' })
    expect(c.deviations.map(d => d.kind)).toContain('missing_airport')
  })

  it('keeps a composite suffix intact rather than guessing at it', () => {
    // ACRS could be Abu Simbel + Cruise + Sea, or something else entirely.
    // The places are already recorded in cities_covered.
    const c = parseProgramCode('NEK1205-ACRS')
    expect(c.suffix).toBe('ACRS')
    expect(c.type).toBeNull()
    expect(c.deviations.map(d => d.kind)).toContain('legacy_suffix')
  })

  it('normalises a full-width dash', () => {
    expect(parseProgramCode('MSN1002－ABCR')).toMatchObject({ days: 10, sequence: '02' })
  })
})

describe('canonicalFor', () => {
  it('takes length and type from the itinerary, not the old string', () => {
    // MSN1005-CR calls itself a 10-day cruise; the itinerary is 8 days.
    const code = canonicalFor(parseProgramCode('MSN1005-CR'), program({ duration_days: 8 }))
    expect(code).toBe('NMS805-CR')
  })

  it('writes LND for a programme with no cruise night', () => {
    const p = program({ duration_days: 6, days: [{ is_cruise_day: false }] })
    expect(canonicalFor(parseProgramCode('MSN-601'), p)).toBe('NMS601-LND')
  })

  it('recovers a missing airport from the source folder', () => {
    const p = program({ folder: 'NRT MS' })
    expect(canonicalFieldsFor(parseProgramCode('MSBZ805-CR'), p).airport).toBe('N')
  })

  it('keeps the business marker in the canonical spelling', () => {
    expect(
      formatProgramCode({
        airport: 'N',
        carrier: 'MS',
        service_class: 'business',
        days: 8,
        sequence: '05',
        type: 'CR',
      })
    ).toBe('NMSBZ805-CR')
  })

  it('pads a single-digit sequence', () => {
    expect(
      formatProgramCode({ airport: 'K', carrier: 'EK', days: 9, sequence: '3', type: 'LND' })
    ).toBe('KEK903-LND')
  })
})

describe('auditProgramCode', () => {
  it('errors when the code misstates the length', () => {
    const problems = auditProgramCode(parseProgramCode('MSN1005-CR'), program({ duration_days: 8 }))
    expect(problems.some(p => /says 10 days but the itinerary is 8/.test(p.message))).toBe(true)
  })

  it('errors when the code claims a cruise the itinerary does not have', () => {
    const p = program({ days: [{ is_cruise_day: false }] })
    expect(auditProgramCode(parseProgramCode('NEK803-CR'), p).length).toBeGreaterThan(0)
  })

  it('errors when a land code has cruise nights', () => {
    expect(auditProgramCode(parseProgramCode('NEK803-LND'), program()).length).toBeGreaterThan(0)
  })

  it('catches a cruise claim hidden in a composite suffix', () => {
    const p = program({ days: [{ is_cruise_day: false }] })
    expect(auditProgramCode(parseProgramCode('NEK803-ABCR'), p).length).toBeGreaterThan(0)
  })

  it('passes a code that agrees with its itinerary', () => {
    expect(auditProgramCode(parseProgramCode('NEK803-CR'), program())).toEqual([])
  })
})

describe('findSequenceCollisions', () => {
  const fields = (over: any) => ({
    airport: 'N',
    carrier: 'MS',
    service_class: 'economy',
    days: 8,
    sequence: '05',
    type: 'CR',
    features: [],
    ...over,
  })

  it('catches two programmes resolving to the same identity', () => {
    // The operator confirmed this is an accident, not a variant scheme — so the
    // suffix is NOT part of the identity and CR/LND do not disambiguate.
    const collisions = findSequenceCollisions([
      { code: 'MSN805-CR', fields: fields({}) },
      { code: 'MSN805-LND', fields: fields({ type: 'LND' }) },
    ])
    expect(collisions).toHaveLength(1)
    expect(collisions[0].codes).toEqual(['MSN805-CR', 'MSN805-LND'])
    expect(collisions[0].identities).toEqual(['CR', 'LND'])
  })

  it('catches a collision only visible after canonicalisation', () => {
    // MSN1005-CR looks distinct but is an 8-day programme, so it lands on
    // 8-day #05 where MSN805-CR already sits.
    const collisions = findSequenceCollisions([
      { code: 'MSN805-CR', fields: fields({}) },
      { code: 'MSN1005-CR', fields: fields({ features: ['ABS'] }) },
    ])
    expect(collisions[0].codes).toHaveLength(2)
  })

  it('does not collide across different lengths, carriers or airports', () => {
    expect(
      findSequenceCollisions([
        { code: 'a', fields: fields({}) },
        { code: 'b', fields: fields({ days: 10 }) },
        { code: 'c', fields: fields({ carrier: 'EK' }) },
        { code: 'd', fields: fields({ airport: 'K' }) },
      ])
    ).toEqual([])
  })

  it('allows one number to be shared by cabin variants of ONE programme', () => {
    // MSBZ805-CR and MSN805-CR have the same overnights, hotel and sightseeing.
    // They are one trip sold in two cabins, so sharing 805 is correct.
    expect(
      findSequenceCollisions([
        { code: 'MSN805-CR', fields: fields({ service_class: 'economy' }) },
        { code: 'MSBZ805-CR', fields: fields({ service_class: 'business' }) },
      ])
    ).toEqual([])
  })

  it('suggests the next free number in the crowded bucket', () => {
    const entries = [
      { code: 'a', fields: fields({ sequence: '01' }) },
      { code: 'b', fields: fields({ sequence: '05' }) },
    ]
    expect(nextFreeSequence(entries, { airport: 'N', carrier: 'MS', days: 8 })).toBe('02')
  })
})
