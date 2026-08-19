import { describe, it, expect } from 'vitest'
import {
  assembleProgramItinerary,
  type SourceProgramDay,
  type SourceProgramHotel,
} from '@/lib/documents/assemble-program-itinerary'

// 利用ホテル check-in/check-out, derived from the departure date.
//
// The hotel rows the importer captured are in itinerary order, one per stay,
// so they pair positionally with the runs of consecutive overnights. Every
// fixture below is the real shape of a programme in the office's catalogue —
// the awkward ones (a cruise between two Cairo stays, a sleeper train listed
// as a hotel, a night in the air that is not) are the point.

function assemble(
  itinerary: SourceProgramDay[],
  hotels: SourceProgramHotel[],
  start_date: string | null,
  customer_name: string | null = null
) {
  return assembleProgramItinerary({
    template_code: 'TEST',
    itinerary,
    hotels,
    created_date: '17 August 2026',
    font_face_css: '',
    org: null,
    departure: { start_date, cairo_guide: null, south_guide: null, author: null, customer_name },
  })
}

/** The office writes check-in/out as M/D, so that is what the cells hold. */
const stays = (ctx: ReturnType<typeof assemble>) =>
  ctx.hotel_rows.map(h => `${h.hotel}:${h.check_in}→${h.check_out}`)

// NEK502-LND — two one-night stays in different cities, flights either end.
const NEK502: SourceProgramDay[] = [
  { day: 1, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
  { day: 2, description: null, attractions: null, meals: null, overnight_city: 'Cairo', overnight_kind: 'hotel' },
  { day: 3, description: null, attractions: null, meals: null, overnight_city: 'Luxor', overnight_kind: 'hotel' },
  { day: 4, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
  { day: 5, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'none' },
]
const NEK502_HOTELS: SourceProgramHotel[] = [
  { hotel: 'Steigenberger Cairo Pyramids', check_in: '/', check_out: '/' },
  { hotel: 'Sonesta ST.George', check_in: '/', check_out: '/' },
]

describe('利用ホテル stay dates — the common shape', () => {
  it('checks in on the night’s day and out the morning after the last night', () => {
    // Depart 5 Oct: day 2 = 10/6 (Cairo, one night, out 10/7),
    // day 3 = 10/7 (Luxor, one night, out 10/8).
    expect(stays(assemble(NEK502, NEK502_HOTELS, '2026-10-05'))).toEqual([
      'Steigenberger Cairo Pyramids:10/6→10/7',
      'Sonesta ST.George:10/7→10/8',
    ])
  })

  it('a multi-night stay checks out the morning after its LAST night', () => {
    // NEK504-LND — Giza, nights of day 2 and day 3, so out on day 4.
    const days: SourceProgramDay[] = [
      { day: 1, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
      { day: 2, description: null, attractions: null, meals: null, overnight_city: 'Giza', overnight_kind: 'hotel' },
      { day: 3, description: null, attractions: null, meals: null, overnight_city: 'Giza', overnight_kind: 'hotel' },
      { day: 4, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
      { day: 5, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'none' },
    ]
    const ctx = assemble(days, [{ hotel: 'Stay Inn Pyramids' }], '2026-10-05')
    expect(stays(ctx)).toEqual(['Stay Inn Pyramids:10/6→10/8'])
  })

  it('leaves the source blanks untouched with no departure date', () => {
    expect(stays(assemble(NEK502, NEK502_HOTELS, null))).toEqual([
      'Steigenberger Cairo Pyramids:/→/',
      'Sonesta ST.George:/→/',
    ])
  })
})

describe('利用ホテル stay dates — nights that are not a hotel', () => {
  it('cruise nights are a stay; the two Cairo stays around them stay separate', () => {
    // NMS1002-CR-ABS, the full shape: Cairo / Abu Simbel / cruise×3 / Luxor / Cairo.
    const days: SourceProgramDay[] = [
      { day: 1, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
      { day: 2, description: null, attractions: null, meals: null, overnight_city: 'Cairo', overnight_kind: 'hotel' },
      { day: 3, description: null, attractions: null, meals: null, overnight_city: 'Abu Simbel', overnight_kind: 'hotel' },
      { day: 4, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 5, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 6, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 7, description: null, attractions: null, meals: null, overnight_city: 'Luxor', overnight_kind: 'hotel' },
      { day: 8, description: null, attractions: null, meals: null, overnight_city: 'Cairo', overnight_kind: 'hotel' },
      { day: 9, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
      { day: 10, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'none' },
    ]
    const hotels: SourceProgramHotel[] = [
      { hotel: 'シュタイゲンベルガー ピラミッズ カイロ' },
      { hotel: 'セティ アブシンベル レイク リゾート' },
      { hotel: 'ナイル川クルーズ' },
      { hotel: 'ソネスタ セント ジョージ ホテル ルクソール' },
      { hotel: 'グランド ナイル タワー' },
    ]
    expect(stays(assemble(days, hotels, '2026-10-05'))).toEqual([
      'シュタイゲンベルガー ピラミッズ カイロ:10/6→10/7',
      'セティ アブシンベル レイク リゾート:10/7→10/8',
      'ナイル川クルーズ:10/8→10/11', // three nights aboard
      'ソネスタ セント ジョージ ホテル ルクソール:10/11→10/12',
      'グランド ナイル タワー:10/12→10/13',
    ])
  })

  it('a sleeper train is a stay, a night in the air is not', () => {
    // NMS801-LND-ABS-TRN — 寝台列車 (Nile Express) is a listed hotel row;
    // the day-1 flight is not.
    const days: SourceProgramDay[] = [
      { day: 1, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
      { day: 2, description: null, attractions: null, meals: null, overnight_city: 'Cairo', overnight_kind: 'hotel' },
      { day: 3, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'train' },
      { day: 4, description: null, attractions: null, meals: null, overnight_city: 'Abu Simbel', overnight_kind: 'hotel' },
      { day: 5, description: null, attractions: null, meals: null, overnight_city: 'Luxor', overnight_kind: 'hotel' },
      { day: 6, description: null, attractions: null, meals: null, overnight_city: 'Cairo', overnight_kind: 'hotel' },
      { day: 7, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
    ]
    const hotels: SourceProgramHotel[] = [
      { hotel: 'Steigenberger Pyramids Cairo' },
      { hotel: 'Nile Express' },
      { hotel: 'Azal Lagoons Resort' },
      { hotel: 'Sonesta St George Hotel' },
      { hotel: 'Hilton Grand Nile Tower' },
    ]
    expect(stays(assemble(days, hotels, '2026-11-01'))).toEqual([
      'Steigenberger Pyramids Cairo:11/2→11/3',
      'Nile Express:11/3→11/4',
      'Azal Lagoons Resort:11/4→11/5',
      'Sonesta St George Hotel:11/5→11/6',
      'Hilton Grand Nile Tower:11/6→11/7',
    ])
  })

  it('falls back to is_cruise_day on rows imported before overnight_kind existed', () => {
    const days: SourceProgramDay[] = [
      { day: 1, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', is_cruise_day: true },
      { day: 2, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', is_cruise_day: true },
    ]
    expect(stays(assemble(days, [{ hotel: 'ナイル川クルーズ船' }], '2026-10-05'))).toEqual([
      'ナイル川クルーズ船:10/5→10/7',
    ])
  })
})

describe('利用ホテル stay dates — refusing to guess', () => {
  it('fills NOTHING when the source lists fewer hotels than the programme has stays', () => {
    // NEK803-CR-ABS: four stays, but the source document lists only three
    // hotels — the final Cairo night was never captured. Pairing positionally
    // would put the cruise's dates on a Cairo hotel, so nothing is filled.
    const days: SourceProgramDay[] = [
      { day: 1, description: null, attractions: null, meals: null, overnight_city: null, overnight_kind: 'flight' },
      { day: 2, description: null, attractions: null, meals: null, overnight_city: 'Cairo', overnight_kind: 'hotel' },
      { day: 3, description: null, attractions: null, meals: null, overnight_city: 'Abu Simbel', overnight_kind: 'hotel' },
      { day: 4, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 5, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 6, description: null, attractions: null, meals: null, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 7, description: null, attractions: null, meals: null, overnight_city: 'Cairo', overnight_kind: 'hotel' },
    ]
    const hotels: SourceProgramHotel[] = [
      { hotel: 'シュタイゲンベルガー ピラミッズ カイロ', check_in: '/', check_out: '/' },
      { hotel: 'Azal Lagoons Resort', check_in: '/', check_out: '/' },
      { hotel: 'ナイル川クルーズ船', check_in: '/', check_out: '/' },
    ]
    expect(stays(assemble(days, hotels, '2026-10-05'))).toEqual([
      'シュタイゲンベルガー ピラミッズ カイロ:/→/',
      'Azal Lagoons Resort:/→/',
      'ナイル川クルーズ船:/→/',
    ])
  })

  it('fills nothing when the departure date is unparseable', () => {
    expect(stays(assemble(NEK502, NEK502_HOTELS, 'not-a-date'))).toEqual([
      'Steigenberger Cairo Pyramids:/→/',
      'Sonesta ST.George:/→/',
    ])
  })
})

describe('day dates — the column the stay dates are computed alongside', () => {
  it('numbers every day from the departure date, with its Japanese weekday', () => {
    // 5 Oct 2026 is a Monday. Day 1 = 10/5 (月), day 2 = 10/6 (火).
    const ctx = assemble(NEK502, NEK502_HOTELS, '2026-10-05')
    expect(ctx.days.map(d => `${d.day}:${d.date?.md} (${d.date?.wd})`)).toEqual([
      '1:10/5 (月)',
      '2:10/6 (火)',
      '3:10/7 (水)',
      '4:10/8 (木)',
      '5:10/9 (金)',
    ])
  })

  it('crosses a month boundary without drifting', () => {
    const ctx = assemble(NEK502, NEK502_HOTELS, '2026-10-30')
    expect(ctx.days.map(d => d.date?.md)).toEqual(['10/30', '10/31', '11/1', '11/2', '11/3'])
    expect(stays(ctx)).toEqual([
      'Steigenberger Cairo Pyramids:10/31→11/1',
      'Sonesta ST.George:11/1→11/2',
    ])
  })
})

describe('customer name — whose copy this is', () => {
  const name = (n: string | null) => assemble(NEK502, NEK502_HOTELS, '2026-10-05', n).customer_name

  it('adds 様 to a bare name', () => {
    expect(name('山田')).toBe('山田様')
    expect(name('Yamada')).toBe('Yamada様')
  })

  it('leaves a name that already carries an honorific alone', () => {
    // ご一行様 and 御中 are deliberate choices about a group or a company —
    // 山田ご一行様様 would be the cost of not checking.
    expect(name('山田様')).toBe('山田様')
    expect(name('山田ご一行様')).toBe('山田ご一行様')
    expect(name('株式会社エイチ・アイ・エス御中')).toBe('株式会社エイチ・アイ・エス御中')
    expect(name('やまださま')).toBe('やまださま')
  })

  it('trims, and prints nothing at all for a blank name', () => {
    expect(name('  山田  ')).toBe('山田様')
    expect(name('')).toBe('')
    expect(name('   ')).toBe('')
    expect(name(null)).toBe('')
  })

  it('leaves the rest of the document untouched', () => {
    // The name is the only thing that changes between a customer's copy and
    // the bare programme — same days, same hotels, same dates.
    const bare = assemble(NEK502, NEK502_HOTELS, '2026-10-05', null)
    const theirs = assemble(NEK502, NEK502_HOTELS, '2026-10-05', '山田')
    expect(theirs.days).toEqual(bare.days)
    expect(theirs.hotel_rows).toEqual(bare.hotel_rows)
    expect(bare.customer_name).toBe('')
  })
})
