import { describe, it, expect } from 'vitest'
import {
  applyDayLanguageVersions,
  assembleOperationsSheet,
  cityCode,
  type SourceDay,
} from '@/lib/documents/assemble-operations-sheet'
import { atsOperationsSheet } from '@/lib/documents/templates/ats-operations-sheet'
import type { OperationsSheetContext } from '@/lib/documents/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The fixture is the real NEK803-ABCR programme — an 8-day Nile cruise whose
// first night is the flight out, so the GROUND sheet starts at D2. Meals and
// overnights are as they appear on the sheet A.T.S sends Cairo today.
const DAYS: SourceDay[] = [
  {
    day_number: 2,
    date: '2026-10-04',
    city: 'Giza',
    title: 'Arrive Cairo international airport',
    description: 'Meet and assist inside airport\nSS Giza pyramids\nAfter SS, Check in the hotel',
    overnight_city: 'Giza',
    attractions: ['Entry of Khufu pyramid included', 'SS Sphinx and temple of valley'],
    lunch_included: false,
    dinner_included: true,
    hotel_included: true,
    flight_from: 'EK 319',
    hotel_check_in: '2026-10-04',
    hotel_check_out: null,
  },
  {
    day_number: 3,
    date: '2026-10-05',
    city: 'Abu Simbel',
    title: 'Fly to Aswan, proceed to Abu Simbel by car',
    description: 'check in at the hotel\nPM Sound & Light show at Abu Simbel Temple',
    overnight_city: 'Abu Simbel',
    attractions: [],
    lunch_included: true,
    dinner_included: true,
    hotel_included: true,
    flight_from: null,
    hotel_check_in: '2026-10-05',
    hotel_check_out: null,
  },
  {
    day_number: 4,
    date: '2026-10-06',
    city: 'Aswan',
    title: 'Sunrise at Abu Simbel temple',
    description: 'Back to Aswan by car\nAfter SS, check in at the Nile cruise',
    overnight_city: 'Aswan',
    attractions: ['SS High Dam & Unfinished obeleisk'],
    lunch_included: true,
    dinner_included: true,
    hotel_included: true,
    flight_from: null,
    hotel_check_in: '2026-10-06',
    hotel_check_out: null,
  },
  {
    day_number: 5,
    date: '2026-10-07',
    city: 'Aswan',
    title: 'Cruise sail to Kom Ombo',
    description: 'SS Kom Ombo temple & crocodile museum\nCruise sail to Luxor',
    overnight_city: 'Aswan',
    attractions: [],
    lunch_included: true,
    dinner_included: true,
    hotel_included: true,
    flight_from: null,
    hotel_check_in: null,
    hotel_check_out: null,
  },
  {
    day_number: 7,
    date: '2026-10-09',
    city: 'Cairo',
    title: 'Check out from cruise, fly to Cairo',
    description: 'SS GEM\nProceed to Cairo airport for final departure',
    overnight_city: null,
    attractions: [],
    lunch_included: true,
    dinner_included: false,
    hotel_included: false,
    flight_from: null,
    hotel_check_in: null,
    hotel_check_out: '2026-10-09',
  },
]

const ITINERARY = {
  itinerary_code: 'NEK803-ABCR',
  trip_name: 'Nile Cruise Highlights 8 Days',
  start_date: '2026-10-04',
  end_date: '2026-10-09',
  num_adults: 3,
  num_children: 0,
}

function build(overrides = {}): OperationsSheetContext {
  return assembleOperationsSheet({ itinerary: ITINERARY, days: DAYS, overrides })
}

describe('cityCode', () => {
  it('maps the cities this operator codes', () => {
    expect(cityCode('Giza')).toBe('GIZA')
    expect(cityCode('Abu Simbel')).toBe('ABS')
    expect(cityCode('aswan')).toBe('ASW')
    expect(cityCode('Kom Ombo')).toBe('KMB')
  })

  it('passes an unknown city through rather than dropping the overnight', () => {
    expect(cityCode('Siwa')).toBe('SIWA')
    expect(cityCode(null)).toBeNull()
  })
})

describe('assembleOperationsSheet', () => {
  it("keeps the operator's own day numbering", () => {
    // The ground sheet starts at D2 because night one is the flight. Renumbering
    // from 1 would put every instruction one day out from the customer's copy.
    expect(build().days.map(d => d.label)).toEqual(['D2', 'D3', 'D4', 'D5', 'D7'])
  })

  it('gives no breakfast on the first ground day, and one after every hotel night', () => {
    const days = build().days
    expect(days[0].meals.breakfast).toBe(false)
    expect(days[1].meals.breakfast).toBe(true)
    expect(days[4].meals.breakfast).toBe(true)
  })

  it('reads lunch and dinner as booked', () => {
    const [first] = build().days
    expect(first.meals.lunch).toBe(false)
    expect(first.meals.dinner).toBe(true)
  })

  it('codes the overnight city, and leaves the last day without one', () => {
    const codes = build().days.map(d => d.accommodation_code)
    expect(codes).toEqual(['GIZA', 'ABS', 'ASW', 'ASW', null])
  })

  it('orders the instructions title → description → attractions', () => {
    expect(build().days[0].lines).toEqual([
      'Arrive Cairo international airport',
      'Meet and assist inside airport',
      'SS Giza pyramids',
      'After SS, Check in the hotel',
      'Entry of Khufu pyramid included',
      'SS Sphinx and temple of valley',
    ])
  })

  it('collapses consecutive nights in one city into a single stay', () => {
    // Two nights in Aswan is one booking, not two.
    expect(build().hotels).toEqual([
      { city: 'GIZA', hotel: null, check_in: '2026-10-04', check_out: null, nights: 1, room: null, remarks: null },
      { city: 'ABS', hotel: null, check_in: '2026-10-05', check_out: null, nights: 1, room: null, remarks: null },
      { city: 'ASW', hotel: null, check_in: '2026-10-06', check_out: null, nights: 2, room: null, remarks: null },
    ])
  })

  it('counts pax and nights from the trip', () => {
    const ctx = build()
    expect(ctx.pax_count).toBe(3)
    expect(ctx.nights).toBe(4)
    expect(ctx.arrival_flight).toBe('EK 319')
  })

  it('invents nothing the office has not supplied', () => {
    const ctx = build()
    expect(ctx.file_no).toBeNull()
    expect(ctx.group_ref).toBeNull()
    expect(ctx.room_count).toBeNull()
    expect(ctx.departure_flight).toBeNull()
    expect(ctx.guides).toEqual([])
  })

  it('takes office-held facts when they are supplied', () => {
    const ctx = build({
      file_no: 'ATS-2026-118',
      room_count: 2,
      remarks: 'Visa & all Tips paid in Japan',
      guides: [{ role: 'CAI. GUIDE', name: 'Ismail', mobile: '+20 10 2656 6622' }],
    })
    expect(ctx.file_no).toBe('ATS-2026-118')
    expect(ctx.room_count).toBe(2)
    expect(ctx.guides[0].mobile).toBe('+20 10 2656 6622')
  })
})

describe('atsOperationsSheet template', () => {
  it('renders a standalone A4 document', () => {
    const html = atsOperationsSheet.render(build())
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('@page { size: A4 portrait')
    expect(atsOperationsSheet.page).toEqual({
      size: 'A4',
      orientation: 'portrait',
      margin: '10mm',
      // Room for the running footer, drawn in the margin (see the footer test).
      footerHeight: '16mm',
    })
  })

  it('carries the programme onto the page', () => {
    const html = atsOperationsSheet.render(build())
    expect(html).toContain('NEK803-ABCR')
    expect(html).toContain('SS Kom Ombo temple &amp; crocodile museum')
    expect(html).toContain('GIZA')
    expect(html).toContain('HOTELS')
  })

  it('marks meals the way the ground team reads them', () => {
    const html = atsOperationsSheet.render(build())
    expect(html).toContain('○')
    expect(html).toContain('X')
  })

  it('leaves a ruled blank where the office writes by hand', () => {
    // Their own template is blank here too. A sheet that omits the field
    // entirely loses the ground team's place on the page.
    expect(atsOperationsSheet.render(build())).toContain('<span class="blank">')
  })

  it('labels both guide postings even when neither is filled', () => {
    const html = atsOperationsSheet.render(build())
    expect(html).toContain('CAI. GUIDE')
    expect(html).toContain('UPP. GUIDE')
  })

  it('escapes trip data rather than letting it become markup', () => {
    const ctx = build({ remarks: '<script>alert("x")</script> & co' })
    const html = atsOperationsSheet.render(ctx)
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; co')
  })

  it('keeps the footer out of the printed flow — it is drawn in the page margin', () => {
    // Seen on DEMO-PORTAL-001 (9 days): the sheet filled page one exactly, and
    // the footer line was the only thing on page two. A footer in the flow is
    // a footer that can be the only thing on a second page; in the margin it
    // takes no flow space at all.
    const html = atsOperationsSheet.render(build())
    expect(html).toMatch(/@media print \{ \.foot \{ display: none; \} \}/)
    expect(atsOperationsSheet.page.footerHeight).toBeTruthy()
    const footer = atsOperationsSheet.footer!(build())
    expect(footer).toContain(build().tour_code!)
    expect(footer).toContain('to be confirmed by the office')
    // Chromium renders a footer template in its own document: no stylesheet,
    // so the styling has to travel inline with an explicit size.
    expect(footer).toMatch(/font-size:\s*\d/)
  })

  // ============================================
  // The Japanese has to travel with the document
  // ============================================
  // Operator, 2026-09-19: the whole Itinerary column of ITN-26-009 printed as
  // tofu boxes. The sheet asked for "Hiragino Sans"/"Yu Gothic"/"Noto Sans JP"
  // — SYSTEM fonts. Locally that works (macOS has Hiragino); the deploy
  // container ships no CJK font at all, so Chromium had nothing to draw the
  // office's day text with. Proven with pdffonts: before the fix the Japanese
  // runs resolved to HiraginoSans-W3, after it to NotoSansJP-Regular.
  it('embeds the Japanese font in the document instead of trusting the container', () => {
    const marker = '@font-face{font-family:MARKER;src:url(data:font/ttf;base64,AAAA)}'
    const html = atsOperationsSheet.render({ ...build(), font_face_css: marker })
    expect(html).toContain(marker)
    // Declared BEFORE the rules that use it, and inside the document's style.
    expect(html.indexOf(marker)).toBeLessThan(html.indexOf('font-family: "Helvetica Neue"'))
    expect(html).toMatch(/font-family: "Helvetica Neue", Arial, 'NotoSansJP'/)
  })

  it('keeps CJK out of the running footer, which the @font-face never reaches', () => {
    // Chromium renders footerTemplate in its own document — the page's
    // @font-face does not apply there, so a CJK glyph in this line would tofu
    // in the container however well the body is served. The note therefore
    // describes the office's brackets rather than printing them.
    const footer = atsOperationsSheet.footer!(build())
    expect(footer).not.toMatch(/[\u3000-\u303f\u3040-\u30ff\u4e00-\u9fff\uff00-\uffef]/)
  })

  it('the route hands the template a real font, not an empty string', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/documents/operations-sheet/route.ts'),
      'utf8'
    )
    expect(src).toContain("getJapaneseFontFace")
    expect(src).toMatch(/font_face_css:\s*await getJapaneseFontFace\(\)/)
  })
})

// ============================================
// The sheet is written in the GROUND TEAM's language
// ============================================
// Operator, 2026-09-19: the sheet came out in Japanese. It is read in Cairo.
// The canonical itinerary_days rows carry the language the office sold in;
// itinerary_day_versions carries the translations. The sheet takes the
// version, English by default.
describe('applyDayLanguageVersions', () => {
  const day = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    day_number: 1,
    date: '2026-12-06',
    city: 'カイロ',
    title: 'ナイルクルーズ',
    description: 'ホテルで朝食',
    overnight_city: 'ルクソール',
    ...extra,
  })

  it('lets the requested language override the canonical text', () => {
    const [merged] = applyDayLanguageVersions(
      [day('d1')],
      [{
        itinerary_day_id: 'd1',
        title: 'Nile Cruise',
        description: 'Breakfast at the hotel',
        city: 'Cairo',
        overnight_city: 'Luxor',
      }]
    )
    expect(merged.title).toBe('Nile Cruise')
    expect(merged.description).toBe('Breakfast at the hotel')
    expect(merged.city).toBe('Cairo')
    expect(merged.overnight_city).toBe('Luxor')
  })

  it('keeps the canonical text for a day with no version', () => {
    // An instruction in the wrong language is still an instruction. A blank
    // line is a day the ground team drives into with nothing.
    const [merged] = applyDayLanguageVersions([day('d1')], [])
    expect(merged.title).toBe('ナイルクルーズ')
    expect(merged.description).toBe('ホテルで朝食')
  })

  it('shows the canonical text through a version field that is empty', () => {
    const [merged] = applyDayLanguageVersions(
      [day('d1')],
      [{
        itinerary_day_id: 'd1',
        title: 'Nile Cruise',
        description: null,
        city: '',
        overnight_city: null,
      }]
    )
    expect(merged.title).toBe('Nile Cruise')
    expect(merged.description).toBe('ホテルで朝食')
    expect(merged.city).toBe('カイロ')
  })

  it('matches versions by day, never by position', () => {
    const merged = applyDayLanguageVersions(
      [day('d1'), day('d2', { title: 'X' })],
      [{ itinerary_day_id: 'd2', title: 'Second day', description: null, city: null, overnight_city: null }]
    )
    expect(merged[0].title).toBe('ナイルクルーズ')
    expect(merged[1].title).toBe('Second day')
  })

  it('the route asks for English by default and reads the version table', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/documents/operations-sheet/route.ts'),
      'utf8'
    )
    expect(src).toContain('itinerary_day_versions')
    expect(src).toMatch(/params\.get\('language'\) \|\| 'en'/)
    expect(src).toContain('applyDayLanguageVersions')
    // The merged days are what the sheet renders — not the raw rows.
    expect(src).toMatch(/days:\s*translatedDays/)
  })
})
