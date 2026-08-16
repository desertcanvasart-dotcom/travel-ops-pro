import { describe, it, expect } from 'vitest'
// Import tooling, deliberately plain JS and outside the app bundle.
import {
  codeFromFilename,
  extractTables,
  mealFromToken,
  parseDays,
  parseHotels,
  parseMealsLine,
  parseProgram,
  resolveOvernight,
} from '../../scripts/lib/parse-program.mjs'

describe('mealFromToken', () => {
  it('reads both circles that mean "included"', () => {
    // ○ is U+25CB, 〇 is U+3007. They look identical and both appear in the
    // catalogue; treating one as unknown would misread half the programmes.
    expect(mealFromToken('○').included).toBe(true)
    expect(mealFromToken('〇').included).toBe(true)
  })

  it('reads all four crosses that mean "not included"', () => {
    for (const token of ['×', 'X', 'x', '✕']) {
      expect(mealFromToken(token).included, token).toBe(false)
    }
  })

  it('treats a meal in the air as not provided, but records it', () => {
    expect(mealFromToken('機内')).toEqual({ included: false, note: 'in flight' })
  })

  it('treats a named dish as included and keeps the dish', () => {
    // The "with Menu" editions write what is served instead of ticking a box.
    expect(mealFromToken('モロヘイヤ＆チキン')).toEqual({
      included: true,
      note: 'モロヘイヤ＆チキン',
    })
  })

  it('survives the stray leading colon one file contains', () => {
    expect(mealFromToken('：X').included).toBe(false)
  })
})

describe('parseMealsLine', () => {
  it('reads a full three-slot line', () => {
    const meals = parseMealsLine(['朝：○　　昼：✕　　夜：○'])
    expect(meals?.breakfast.included).toBe(true)
    expect(meals?.lunch.included).toBe(false)
    expect(meals?.dinner.included).toBe(true)
  })

  it('reads a departure day that states only dinner', () => {
    // Day one flies out of Narita: the only meal is aboard.
    const meals = parseMealsLine(['【00:00】成田国際空港', '夜：機内'])
    expect(meals).not.toBeNull()
    expect(meals?.dinner.note).toBe('in flight')
    expect(meals?.breakfast.included).toBe(false)
  })

  it('does not mistake prose for a meal mark', () => {
    // 朝食後 means "after breakfast" and is an instruction, not an inclusion.
    expect(parseMealsLine(['朝食後、クルーズ船を下船（チェックアウト）'])).toBeNull()
  })

  it('returns null when a day states no meals at all', () => {
    expect(parseMealsLine(['カイロ市内観光'])).toBeNull()
  })
})

describe('resolveOvernight', () => {
  it('maps the places the catalogue actually uses', () => {
    expect(resolveOvernight('カイロ')).toMatchObject({ city: 'Cairo', kind: 'hotel' })
    expect(resolveOvernight('船中泊')).toMatchObject({ city: 'Nile Cruise', kind: 'cruise' })
    expect(resolveOvernight('ペトラ')).toMatchObject({ city: 'Petra', kind: 'hotel' })
  })

  it('treats both spellings of an overnight flight as the same non-place', () => {
    // 機中泊 and 機内泊 both mean the night is spent in the air, and neither is
    // a city anyone visits — putting them in cities_covered would advertise
    // "In flight" as a destination.
    expect(resolveOvernight('機中泊')).toMatchObject({ city: null, kind: 'flight' })
    expect(resolveOvernight('機内泊')).toMatchObject({ city: null, kind: 'flight' })
  })

  it('recovers a city broken across a line break', () => {
    // One cell contains アブ・シ\nンベル.
    expect(resolveOvernight('アブ・シ\nンベル')).toMatchObject({ city: 'Abu Simbel' })
  })

  it('accepts both spellings of Abu Simbel', () => {
    expect(resolveOvernight('アブシンベル').city).toBe('Abu Simbel')
    expect(resolveOvernight('アブ・シンベル').city).toBe('Abu Simbel')
  })

  it('reports an unknown place rather than dropping the night', () => {
    const result = resolveOvernight('シワオアシス')
    expect(result.known).toBe(false)
    expect(result.city).toBe('シワオアシス')
  })
})

describe('codeFromFilename', () => {
  it('reads the code out of a Japanese filename', () => {
    expect(codeFromFilename('日本語日程表NEK803-ABCR with Menu.docx')).toBe('NEK803-ABCR')
    expect(codeFromFilename('7. 日程表NEK601 with Menu.docx')).toBe('NEK601')
    expect(codeFromFilename('MSN-605-ABS.docx')).toBe('MSN-605-ABS')
  })

  it('normalises a full-width dash', () => {
    // 日程表 MSN1002－ABCR — an ASCII-only pattern drops the suffix and turns
    // this into a different programme entirely.
    expect(codeFromFilename('日程表 MSN1002－ABCR with Menu.docx')).toBe('MSN1002-ABCR')
  })

  it('returns null when there is no code to read', () => {
    expect(codeFromFilename('notes.docx')).toBeNull()
  })
})

// --- whole-document behaviour ----------------------------------------------

const DOC = `
<table>
  <tr><td><p>カイロガイド</p></td><td><p></p></td><td><p>作成日</p></td><td><p>1 July 2026</p></td></tr>
</table>
<table>
  <tr><td><p></p></td><td><p>日</p></td><td><p>宿泊地</p></td><td><p>日程</p></td></tr>
  <tr><td><p>1</p></td><td><p>/</p></td><td><p>機中泊</p></td>
      <td><p>【00:00】成田国際空港</p><p>夜：機内</p></td></tr>
  <tr><td><p>2</p></td><td><p>/</p></td><td><p>ギザ</p></td>
      <td><p>カイロ到着後</p><p>◎クフ王のピラミッドに入場</p><p>朝：機内　昼：✕　夜：○</p></td></tr>
  <tr><td><p>3</p></td><td><p>/</p></td><td><p>船中泊</p></td>
      <td><p>クルーズ船へチェックイン</p><p>朝：〇　昼：〇　夜：魚タジン</p></td></tr>
</table>
<table>
  <tr><td><p>ホテル</p></td><td><p>イン</p></td><td><p>アウト</p></td><td><p>電話</p></td><td><p>住所</p></td></tr>
  <tr><td><p>シュタイゲンベルガー ピラミッズ カイロ</p></td><td><p></p></td><td><p></p></td>
      <td><p>+20 23 377 2555</p></td><td><p>Giza</p></td></tr>
</table>`

describe('parseProgram', () => {
  const program = parseProgram({ html: DOC, filename: 'TEST NEK303-CR.docx', folder: 'NRT EK' })

  it('reads the code, airline and duration', () => {
    expect(program.code).toBe('NEK303-CR')
    expect(program.airline).toBe('EK')
    expect(program.departure_airport).toBe('NRT')
    expect(program.duration_days).toBe(3)
    expect(program.duration_nights).toBe(2)
  })

  it('lists only real places as cities covered', () => {
    // Day 1 is an overnight flight; it is not a destination.
    expect(program.cities_covered).toEqual(['Giza', 'Nile Cruise'])
  })

  it('marks the cruise night', () => {
    expect(program.days[2].is_cruise_day).toBe(true)
    expect(program.days[2].accommodation_type).toBe('cruise')
    expect(program.days[1].is_cruise_day).toBe(false)
  })

  it('lifts ◎ lines out as attractions', () => {
    expect(program.days[1].attractions).toEqual(['クフ王のピラミッドに入場'])
    expect(program.days[1].description).not.toContain('クフ王')
  })

  it('keeps the meal line out of the description', () => {
    for (const day of program.days) {
      expect(day.description).not.toMatch(/朝\s*[：:]/)
      expect(day.description).not.toMatch(/夜\s*[：:]/)
    }
  })

  it('records the named dish as a menu without dropping the inclusion', () => {
    expect(program.days[2].meals).toEqual(['breakfast', 'lunch', 'dinner'])
    expect(program.days[2].menu).toEqual({ dinner: '魚タジン' })
    expect(program.has_menu).toBe(true)
  })

  it('counts an in-flight meal as not provided', () => {
    expect(program.days[0].meals).toEqual([])
    expect(program.days[1].meals).toEqual(['dinner'])
  })

  it('reads the hotel table', () => {
    expect(program.hotels).toHaveLength(1)
    expect(program.hotels[0].phone).toBe('+20 23 377 2555')
  })

  it('parses this document without problems', () => {
    expect(program.problems).toEqual([])
  })
})

describe('parseProgram — problems', () => {
  it('flags a code inside the document that contradicts the filename', () => {
    // Four real files do this; one is an EgyptAir programme carrying an
    // Emirates code. Which one is right is the operator's call, not ours.
    const html = DOC.replace('<p>日</p>', '<p>NEK999</p>')
    const program = parseProgram({ html, filename: 'NEK303-CR.docx', folder: 'NRT EK' })
    // Reported here, but judged in the importer: whether it is a real conflict
    // depends on what the two codes disagree ABOUT.
    expect(
      program.problems.some(p => p.kind === 'document_code_mismatch' && p.documentCode === 'NEK999')
    ).toBe(true)
  })

  it('flags a missing day rather than renumbering around it', () => {
    const html = DOC.replace('<tr><td><p>2</p>', '<tr><td><p>9</p>')
    const program = parseProgram({ html, filename: 'NEK303-CR.docx', folder: 'NRT EK' })
    expect(program.problems.some(p => /Day 2 is missing/.test(p.message))).toBe(true)
  })

  it('flags an unrecognised overnight location', () => {
    const html = DOC.replace('<p>ギザ</p>', '<p>シワオアシス</p>')
    const program = parseProgram({ html, filename: 'NEK303-CR.docx', folder: 'NRT EK' })
    expect(program.problems.some(p => /Unrecognised overnight/.test(p.message))).toBe(true)
  })
})

describe('extractTables / parseHotels', () => {
  it('splits cells into the lines the author typed', () => {
    const tables = extractTables('<table><tr><td><p>a</p><p>b<br />c</p></td></tr></table>')
    expect(tables[0][0][0]).toEqual(['a', 'b', 'c'])
  })

  it('reads the three-column hotel table one file uses', () => {
    const tables = extractTables(
      '<table><tr><td><p>Steigenberger</p></td><td><p>02 33772555</p></td><td><p>Giza</p></td></tr></table>'
    )
    const hotels = parseHotels(tables)
    expect(hotels).toEqual([
      { hotel: 'Steigenberger', check_in: null, check_out: null, phone: '02 33772555', address: 'Giza' },
    ])
  })

  it('gathers days from more than one table', () => {
    // One programme's days are split across two tables where the author broke
    // the page; reading only the first would lose half the itinerary.
    const html =
      '<table><tr><td><p>1</p></td><td><p>/</p></td><td><p>カイロ</p></td><td><p>x</p></td></tr></table>' +
      '<table><tr><td><p>2</p></td><td><p>/</p></td><td><p>ルクソール</p></td><td><p>y</p></td></tr></table>'
    const days = parseDays(extractTables(html), [])
    expect(days.map(d => d.day)).toEqual([1, 2])
  })
})
