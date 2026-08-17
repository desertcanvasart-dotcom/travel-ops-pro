import { describe, it, expect } from 'vitest'
import {
  addMonths,
  ageOn,
  validateManifest,
  validatePassenger,
  type PassengerInput,
  type TripContext,
} from '@/lib/passenger-validation'

const TRIP: TripContext = { departure_date: '2026-12-04' }

/** A traveller who has answered everything correctly. */
const complete: PassengerInput = {
  last_name: 'NAKAJIMA',
  first_name: 'SOTOO',
  family_name_kanji: '中嶋',
  given_name_kanji: '宗生',
  family_name_kana: 'ナカジマ',
  given_name_kana: 'ソトオ',
  date_of_birth: '1968-04-11',
  gender: 'male',
  nationality: 'Japan',
  postal_code: '106-0031',
  address: '東京都港区西麻布3-21-20',
  emergency_contact_name: '中嶋 花子',
  emergency_contact_phone: '03-0000-0001',
  emergency_contact_relationship: '妻',
  passport_number: 'TR9900001',
  passport_expiry: '2031-09-30',
  passport_status: 'held',
  passenger_type: 'adult',
  is_lead_passenger: true,
}

const codes = (p: PassengerInput, trip: TripContext = TRIP) =>
  validatePassenger(p, trip).issues.map(i => i.code)

describe('addMonths', () => {
  it('adds in UTC', () => {
    expect(addMonths('2026-12-04', 6)).toBe('2027-06-04')
  })

  it('clamps rather than rolling into the next month', () => {
    // Naively, 31 Aug + 6 months is 31 Feb, which JS turns into 3 March —
    // making the residual-validity check LENIENT by three days.
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('does not shift across a DST boundary', () => {
    expect(addMonths('2026-10-25', 1)).toBe('2026-11-25')
  })
})

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn('1968-04-11', '2026-12-04')).toBe(58)
  })

  it('does not count a birthday that has not happened yet', () => {
    expect(ageOn('1968-12-05', '2026-12-04')).toBe(57)
    expect(ageOn('1968-12-04', '2026-12-04')).toBe(58)
  })
})

describe('a complete traveller', () => {
  it('passes with nothing to report', () => {
    const result = validatePassenger(complete, TRIP)
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })
})

describe('the romanised name', () => {
  it('refuses Japanese typed into the romaji box', () => {
    // The common slip, and the one their invoice warns about: one character
    // wrong and the traveller does not board.
    expect(codes({ ...complete, last_name: '中嶋' })).toContain('romaji_not_latin')
  })

  it('accepts the punctuation a passport actually contains', () => {
    expect(codes({ ...complete, last_name: "O'BRIEN-SMITH" })).toEqual([])
  })

  it('refuses digits', () => {
    expect(codes({ ...complete, first_name: 'SOTOO2' })).toContain('romaji_not_latin')
  })

  it('requires both parts', () => {
    expect(codes({ ...complete, first_name: '   ' })).toContain('romaji_required')
  })
})

describe('kana and kanji', () => {
  it('requires furigana', () => {
    expect(codes({ ...complete, family_name_kana: null })).toContain('kana_required')
  })

  it('warns, but does not block, when furigana is not kana', () => {
    const result = validatePassenger({ ...complete, family_name_kana: 'Nakajima' }, TRIP)
    expect(result.issues.map(i => i.code)).toContain('kana_not_kana')
    expect(result.ok, 'a readable answer should not block submission').toBe(true)
  })

  it('accepts hiragana as well as katakana', () => {
    // A traveller writing their own name in hiragana has not made a mistake
    // worth blocking.
    expect(codes({ ...complete, family_name_kana: 'なかじま' })).toEqual([])
  })

  it('only warns when the kanji name is missing', () => {
    const result = validatePassenger(
      { ...complete, family_name_kanji: null, given_name_kanji: null },
      TRIP
    )
    expect(result.issues.map(i => i.code)).toContain('kanji_missing')
    expect(result.ok).toBe(true)
  })
})

describe('passport — the check this form exists for', () => {
  it('refuses a passport with under six months left on arrival', () => {
    // Departure 4 Dec 2026 needs validity to 4 Jun 2027. Egypt refuses entry
    // otherwise, and a fax cannot tell anyone that.
    const issues = validatePassenger({ ...complete, passport_expiry: '2027-05-01' }, TRIP).issues
    expect(issues.map(i => i.code)).toContain('passport_residual_validity')
    expect(issues[0].message).toContain('2027-06-04')
  })

  it('accepts a passport expiring exactly on the six-month boundary', () => {
    expect(codes({ ...complete, passport_expiry: '2027-06-04' })).toEqual([])
  })

  it('refuses one day inside the boundary', () => {
    expect(codes({ ...complete, passport_expiry: '2027-06-03' })).toContain(
      'passport_residual_validity'
    )
  })

  it('reports an already-expired passport as expired, not as short validity', () => {
    expect(codes({ ...complete, passport_expiry: '2026-11-01' })).toContain('passport_expired')
  })

  it('honours a destination with different rules', () => {
    // The SAME passport that fails Egypt's six months clears a three-month
    // rule: departure 4 Dec needs validity only to 4 Mar 2027.
    const passport = { ...complete, passport_expiry: '2027-05-01' }
    expect(codes(passport)).toContain('passport_residual_validity')
    expect(
      codes(passport, { departure_date: '2026-12-04', residual_validity_months: 3 })
    ).toEqual([])
  })

  it('cannot check validity without a departure date, and does not pretend to', () => {
    expect(codes({ ...complete, passport_expiry: '2020-01-01' }, { departure_date: null })).toEqual(
      []
    )
  })
})

describe('a passport that does not exist yet', () => {
  const applying = {
    ...complete,
    passport_status: 'applying',
    passport_number: null,
    passport_expiry: null,
  }

  it('accepts 現在申請中 with an expected date', () => {
    // Their own form allows this, so it is an answer rather than a gap.
    expect(codes({ ...applying, passport_expected_date: '2026-10-01' })).toEqual([])
  })

  it('requires the expected date', () => {
    expect(codes(applying)).toContain('passport_expected_required')
  })

  it('refuses an expected date after departure', () => {
    expect(codes({ ...applying, passport_expected_date: '2026-12-20' })).toContain(
      'passport_expected_after_departure'
    )
  })

  it('does not also demand a passport number', () => {
    expect(codes({ ...applying, passport_expected_date: '2026-10-01' })).not.toContain(
      'passport_number_required'
    )
  })
})

describe('the emergency contact left behind in Japan', () => {
  it('requires the relationship, which their form marks 必須', () => {
    // A phone number without 続柄 does not say whether you are calling a
    // spouse or an employer.
    expect(codes({ ...complete, emergency_contact_relationship: null })).toContain(
      'emergency_relationship_required'
    )
  })

  it('requires a name and a number', () => {
    const issues = codes({
      ...complete,
      emergency_contact_name: null,
      emergency_contact_phone: null,
    })
    expect(issues).toContain('emergency_name_required')
    expect(issues).toContain('emergency_phone_required')
  })
})

describe('address', () => {
  it('requires it of the lead, who receives the posted documents', () => {
    expect(codes({ ...complete, address: null })).toContain('address_required')
  })

  it('does NOT require it of a companion', () => {
    // Their form says the final itinerary goes to the 代表者's address unless
    // told otherwise, so a blank here is not an unanswered question.
    const companion = { ...complete, is_lead_passenger: false, address: null, postal_code: null }
    expect(codes(companion)).toEqual([])
  })

  it('warns on a malformed postcode without blocking', () => {
    const result = validatePassenger({ ...complete, postal_code: '1060' }, TRIP)
    expect(result.issues.map(i => i.code)).toContain('postal_format')
    expect(result.ok).toBe(true)
  })
})

describe('age against the declared type', () => {
  it('flags an adult who is a child on the day of departure', () => {
    const result = validatePassenger(
      { ...complete, date_of_birth: '2018-01-01', passenger_type: 'adult' },
      TRIP
    )
    expect(result.issues.map(i => i.code)).toContain('age_type_mismatch')
    // Flagged, not blocked — the operator decides, not the form.
    expect(result.ok).toBe(true)
  })

  it('says nothing when the type matches', () => {
    expect(codes({ ...complete, date_of_birth: '2018-01-01', passenger_type: 'child' })).toEqual([])
  })

  it('leaves a tour leader alone', () => {
    expect(codes({ ...complete, passenger_type: 'tour_leader' })).toEqual([])
  })

  it('refuses a birth date after departure', () => {
    expect(codes({ ...complete, date_of_birth: '2027-01-01' })).toContain('dob_after_departure')
  })
})

describe('validateManifest', () => {
  const companion: PassengerInput = { ...complete, is_lead_passenger: false }

  it('passes a complete party', () => {
    expect(validateManifest([complete, companion], TRIP).ok).toBe(true)
  })

  it('refuses a party with no lead', () => {
    const result = validateManifest([companion, companion], TRIP)
    expect(result.ok).toBe(false)
    expect(result.byPassenger.at(-1)?.issues[0].code).toBe('lead_missing')
  })

  it('refuses two leads — the documents would have no single destination', () => {
    const result = validateManifest([complete, { ...complete }], TRIP)
    expect(result.byPassenger.at(-1)?.issues[0].code).toBe('lead_duplicate')
  })

  it('reports issues against the traveller they belong to', () => {
    const result = validateManifest(
      [complete, { ...companion, passport_expiry: '2027-05-01' }],
      TRIP
    )
    expect(result.ok).toBe(false)
    expect(result.byPassenger[0].issues).toEqual([])
    expect(result.byPassenger[1].issues.map(i => i.code)).toContain('passport_residual_validity')
  })
})
