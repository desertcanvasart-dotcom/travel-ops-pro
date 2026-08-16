import { describe, it, expect } from 'vitest'
// Import tooling, deliberately plain JS and outside the app bundle.
import {
  assignedSequence,
  auditProgramCode,
  carrierFromItinerary,
  canonicalFieldsFor,
  canonicalFor,
  findSequenceCollisions,
  documentCodeConflicts,
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
    // MSN1004-CR calls itself a 10-day programme; the itinerary is 8 days.
    // (Deliberately a code with no operator ruling, so this isolates the
    // length derivation from the sequence assignments tested below.)
    const code = canonicalFor(parseProgramCode('MSN1004-CR'), program({ duration_days: 8 }))
    expect(code).toBe('NMS804-CR')
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

describe('operator sequence rulings', () => {
  it('applies the assigned number in place of the contested one', () => {
    // Ruled 2026-08-16: MSN805-CR keeps 05, so these two move.
    expect(assignedSequence('MSN805-LND')?.sequence).toBe('02')
    expect(assignedSequence('MSN1005-CR')?.sequence).toBe('03')
    expect(assignedSequence('MSN805-CR')).toBeNull()
  })

  it('is case-insensitive on the written code', () => {
    expect(assignedSequence('msn805-lnd')?.sequence).toBe('02')
  })

  it('beats the number in the old code when canonicalising', () => {
    // MSN1005-CR's own code says 05; the ruling says 03, and the ruling wins
    // because that number is exactly what was contested.
    const p = program({ duration_days: 8, days: [{ is_cruise_day: true }] })
    const fields = canonicalFieldsFor(parseProgramCode('MSN1005-CR'), p)
    expect(fields.sequence).toBe('03')
    expect(fields.assigned_sequence).toBe(true)
  })

  it('leaves an unruled programme on its own number', () => {
    const p = program({ duration_days: 8, days: [{ is_cruise_day: true }] })
    expect(canonicalFieldsFor(parseProgramCode('MSN805-CR'), p).sequence).toBe('05')
  })
})

describe('documentCodeConflicts', () => {
  const canonical = { airport: 'N', carrier: 'EK', days: 9 }

  it('is NOT a conflict when only the derived type differs', () => {
    // NEK901 vs NEK901-CR: the itinerary has cruise nights, so CR is right and
    // the filename simply dropped a suffix we derive anyway.
    expect(documentCodeConflicts('NEK901-CR', canonical)).toBe(false)
  })

  it('IS a conflict when the carrier differs', () => {
    // MSN-601 claims to be NEK601 — an EgyptAir programme carrying an Emirates
    // code, which the itinerary cannot settle either way.
    expect(documentCodeConflicts('NEK601', { airport: 'N', carrier: 'MS', days: 6 })).toEqual([
      'carrier',
    ])
  })

  it('IS a conflict when the length differs', () => {
    expect(documentCodeConflicts('NEK1201-CR', canonical)).toEqual(['length'])
  })

  it('treats an unreadable document code as a conflict', () => {
    expect(documentCodeConflicts('rubbish', canonical)).toBe(true)
  })
})

describe('carrierFromItinerary', () => {
  const withText = (text: string) => ({ days: [{ description: text }] })

  it('reads EgyptAir from the check-in instruction', () => {
    expect(carrierFromItinerary(withText('成田空港発 エジプト航空XX便にて空路、カイロへ'))).toBe('MS')
  })

  it('reads Emirates', () => {
    expect(carrierFromItinerary(withText('成田空港発　エミレーツ航空XXX便にて空路　ドバイへ'))).toBe('EK')
  })

  it('returns null when the itinerary names BOTH', () => {
    // A document half-edited from another carrier's original is exactly the
    // case worth refusing to guess about.
    expect(carrierFromItinerary(withText('エジプト航空 ... エミレーツ航空'))).toBeNull()
  })

  it('returns null when the itinerary is silent', () => {
    expect(carrierFromItinerary(withText('カイロ市内観光'))).toBeNull()
  })
})

describe('documentCodeConflicts — with itinerary evidence', () => {
  const canonical = { airport: 'N', carrier: 'MS', days: 6 }
  const egyptair = { days: [{ description: '成田空港発 エジプト航空XX便にて空路、カイロへ' }] }

  it('clears a carrier disagreement the itinerary can settle', () => {
    // MSN-601 carries a stray NEK601 label, but flies EgyptAir from Narita
    // Terminal 1 with no Dubai transit. The label is stale, not the programme.
    expect(documentCodeConflicts('NEK601', canonical, egyptair)).toBe(false)
  })

  it('still conflicts when the itinerary does not back the code', () => {
    const silent = { days: [{ description: 'カイロ市内観光' }] }
    expect(documentCodeConflicts('NEK601', canonical, silent)).toEqual(['carrier'])
  })

  it('still conflicts when the itinerary names both carriers', () => {
    const both = { days: [{ description: 'エジプト航空 ... エミレーツ航空' }] }
    expect(documentCodeConflicts('NEK601', canonical, both)).toEqual(['carrier'])
  })

  it('does not let carrier evidence excuse a length disagreement', () => {
    expect(documentCodeConflicts('NMS1201-LND', canonical, egyptair)).toEqual(['length'])
  })
})
