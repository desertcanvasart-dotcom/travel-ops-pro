import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normaliseTripFlights, airlineLegend } from '@/lib/itineraries/flights'
import { routeStopsFromDays, renderEgyptRouteMap } from '@/lib/maps/egypt-route-map'
import { confirmationPayments, jaDate } from '@/lib/documents/booking-confirmation-doc'
import { atsBookingConfirmation } from '@/lib/documents/templates/ats-booking-confirmation'
import { atsApplicationForm } from '@/lib/documents/templates/ats-application-form'
import { assembleProgramItinerary } from '@/lib/documents/assemble-program-itinerary'
import { atsDailyItinerary } from '@/lib/documents/templates/ats-daily-itinerary'
import { getTemplate } from '@/lib/documents/registry'
import { ORG_DOCUMENT_TEMPLATES } from '@/lib/documents/org-templates'

// The ATS paper pack (2026-11-02): 予約確認書兼請求書, the printed 参加申込書,
// the 日程表's tips page and route map, from the office's own files.

describe('trip flights', () => {
  it('keeps what was typed, drops empty rows, refuses a non-list', () => {
    expect(normaliseTripFlights('x')).toBeNull()
    expect(
      normaliseTripFlights([
        { date: '2026-09-29', from: '関西空港', to: 'ドバイ', flight_no: 'ek317', depart: '23:45', arrive: '04:35+1', status: 'ok' },
        { date: '', from: '', to: '' },
        { date: 'tomorrow', flight_no: 'EK927' },
      ])
    ).toEqual([
      { date: '2026-09-29', from: '関西空港', to: 'ドバイ', flight_no: 'EK317', depart: '23:45', arrive: '04:35+1', status: 'OK' },
      { date: '', from: '', to: '', flight_no: 'EK927', depart: '', arrive: '', status: '' },
    ])
  })

  it('spells out each carrier once, in the order flown', () => {
    const flights = normaliseTripFlights([{ flight_no: 'EK317' }, { flight_no: 'MS147' }, { flight_no: 'EK927' }])!
    expect(airlineLegend(flights)).toEqual(['EK＝エミレーツ航空', 'MS＝エジプト航空'])
  })
})

describe('route map', () => {
  // KEK802-ABS as the office wrote it: Aswan is visited on day 3 but never
  // slept in — it is only in the text.
  const KEK802 = [
    { day: 1, description: '関西空港発 エミレーツ航空', overnight_city: null },
    { day: 2, description: 'カイロ到着。ギザの3大ピラミッド', overnight_city: 'Cairo' },
    { day: 3, description: 'カイロ発、空路アスワンへ\nアブ・シンベルへ', overnight_city: 'Abu Simbel' },
    { day: 4, description: 'アスワン駅から列車にてルクソールへ', overnight_city: 'Luxor' },
    { day: 5, description: 'ルクソール西岸観光\n空路カイロへ', overnight_city: 'Cairo' },
    { day: 6, description: 'ダハシュール、サッカラ、メンフィス', overnight_city: 'Cairo' },
    { day: 7, description: 'カイロ発、エミレーツ航空', overnight_city: null },
  ]

  it('follows the text as well as the overnights, and closes back on Cairo', () => {
    expect(routeStopsFromDays(KEK802)).toEqual(['Cairo', 'Aswan', 'Abu Simbel', 'Aswan', 'Luxor', 'Cairo'])
  })

  it('numbers each place once, labels in Japanese, and draws nothing it fetched', () => {
    const map = renderEgyptRouteMap(routeStopsFromDays(KEK802), { language: 'ja' })!
    expect(map.legend).toEqual([
      { n: 1, label: 'カイロ' },
      { n: 2, label: 'アスワン' },
      { n: 3, label: 'アブ・シンベル' },
      { n: 4, label: 'ルクソール' },
    ])
    expect(map.svg).toMatch(/^<svg/)
    expect(map.svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  })

  it('draws no map for a single place or places outside Egypt', () => {
    expect(renderEgyptRouteMap(['Cairo'])).toBeNull()
    expect(renderEgyptRouteMap(['Cairo', 'Petra'])).toBeNull()
  })

  it('prints on the 日程表, with the tips page unless switched off', () => {
    const ctx = (tips?: boolean) =>
      assembleProgramItinerary({
        template_code: 'KEK802-ABS', itinerary: KEK802 as never, hotels: null, created_date: '', font_face_css: '', org: null,
        departure: { start_date: null, cairo_guide: null, south_guide: null, author: null, tips_prepaid: tips },
      })
    const html = atsDailyItinerary.render(ctx())
    expect(html).toContain('ルートマップ')
    expect(html).toContain('チップは日本払い済です。')
    expect(html).toContain('Tips have already been paid in Japan.')
    expect(atsDailyItinerary.render(ctx(false))).not.toContain('チップについて')
  })

  it('the Arabic tips line ships as an image the renderer can inline', () => {
    const png = readFileSync('public/documents/tips-paid-ar.png')
    expect(png.subarray(1, 4).toString()).toBe('PNG')
  })
})

describe('予約確認書兼請求書', () => {
  it('a deposit invoice prints deposit and balance that add up to the trip price', () => {
    const { total, payments } = confirmationPayments(
      { invoice_type: 'deposit', total_amount: 370873, deposit_percent: 20, full_trip_cost: 1854367, due_date: '2026-07-05', balance_due_date: '2026-07-31' },
      'JPY'
    )
    expect(total).toBe(1854367)
    expect(payments).toEqual([
      { label: '旅行代金申込金', amount: '¥370,873', due: '2026年7月5日' },
      { label: '旅行代金残金', amount: '¥1,483,494', due: '2026年7月31日' },
    ])
  })

  it('a standard invoice is one amount', () => {
    const { payments } = confirmationPayments({ invoice_type: 'standard', total_amount: 600000, due_date: '2026-08-01' }, 'JPY')
    expect(payments).toEqual([{ label: '旅行代金', amount: '¥600,000', due: '2026年8月1日' }])
  })

  it('dates read as calendar dates, weekday in Japanese', () => {
    expect(jaDate('2026-09-29', true)).toBe('2026年9月29日（火）')
    expect(jaDate(null)).toBe('')
  })

  it('renders the office sheet with names, flights, hotels, charges and the bank, escaping input', () => {
    const html = atsBookingConfirmation.render({
      font_face_css: '',
      letterhead: { logo_url: null, company_name: '株式会社 エイ・ティ・エス', lines: [], offices: [], email: 'info@ats-hj.com', website: '' },
      representative: '山田 太郎', staff: 'Nada', created_date: '2026年7月2日', phone: '', email: '',
      departure_date: '2026年9月29日（火）', tour_code: 'KEK802-ABS', tour_name: '<b>エジプト8日間</b>',
      travellers: ['YAMADA TARO'],
      flights: [{ date: '9/29', weekday: '火', from: '関西空港', to: 'ドバイ', flight_no: 'EK317', depart: '23:45', arrive: '04:35+1', status: 'OK' }],
      airline_legend: ['EK＝エミレーツ航空'],
      hotels: [{ city: 'カイロ', check_in: '9/30', check_out: '10/1', nights: '1', rooms: '1', room_type: 'ツイン', hotel: 'ラムセス ヒルトン' }],
      remarks: ['※乗継地での搭乗手続きはお客様ご自身で'],
      charges: [{ description: '海外旅行代金', unit_price: '¥229,000', quantity: '2', amount: '¥458,000' }],
      total: '¥458,000', bank_lines: ['三菱UFJ銀行　六本木支店'],
      payments: [{ label: '旅行代金', amount: '¥458,000', due: '2026年8月1日' }],
    })
    for (const text of ['予約確認書兼請求書', '山田 太郎　様', 'YAMADA TARO', 'EK317', '04:35+1', 'ラムセス ヒルトン', '1泊', '海外旅行代金', '¥458,000', '三菱UFJ銀行', '●旅行代金']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('&lt;b&gt;エジプト8日間&lt;/b&gt;')
  })
})

describe('参加申込書', () => {
  it('one page per traveller, the passport image where the copy was glued', () => {
    const traveller = {
      family_kana: 'ヤマダ', given_kana: 'タロウ', family_kanji: '山田', given_kanji: '太郎', romaji: 'YAMADA TARO', gender: '男',
      birth_date: '1980年4月1日', postal_code: '106-0031', address: '東京都港区', address_kana: '', home_phone: '', mobile: '', email: '',
      affiliation: '', emergency_name: '', emergency_relationship: '', emergency_phone: '', passport_number: 'TK1234567', passport_expiry: '',
      passport_image: 'data:image/png;base64,AAAA', passport_note: '',
    }
    const html = atsApplicationForm.render({
      font_face_css: '',
      letterhead: { logo_url: null, company_name: 'A.T.S', lines: [], offices: [], email: '', website: '' },
      staff: '', departure_date: '', tour_code: 'KEK802-ABS', days: '8', tour_name: '',
      travellers: [traveller, { ...traveller, romaji: 'YAMADA HANAKO', passport_image: null, passport_note: '画像形式（PDF・HEIC）のため印刷できません。' }],
    })
    expect(html.match(/<section class="pg">/g)).toHaveLength(2)
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).toContain('画像形式（PDF・HEIC）のため印刷できません。')
    expect(html).toContain('8日間')
  })
})

describe('registry and org documents', () => {
  it('both new documents are registered and grantable', () => {
    for (const slug of ['ats-booking-confirmation', 'ats-application-form'] as const) {
      expect(getTemplate(slug)?.slug).toBe(slug)
      expect(ORG_DOCUMENT_TEMPLATES).toContain(slug)
    }
  })

  it('the migration grants them to the orgs that already have the 日程表', () => {
    const sql = readFileSync('migrations/20270114_itinerary_flights_and_ats_documents.sql', 'utf8')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS flights JSONB NOT NULL DEFAULT '\[\]'/)
    expect(sql).toContain("'ats-daily-itinerary' = ANY(document_templates)")
  })
})
