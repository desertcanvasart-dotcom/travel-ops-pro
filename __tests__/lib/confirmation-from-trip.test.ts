import { describe, it, expect } from 'vitest'
import {
  airportCode,
  findRouteTax,
  normaliseRouteTaxes,
  tourDays,
  tripChargeLines,
  tripPayments,
  tripRoute,
  type TripMoneyInput,
} from '@/lib/documents/confirmation-from-trip'
import { confirmationCharges, defaultRooms } from '@/lib/documents/booking-confirmation-doc'
import { determineTipRolesForDay, hasCombinedGuideDriverTip } from '@/lib/tipping-utils'
import { DEFAULT_PAYMENT_RULE } from '@/lib/payment-schedule'

// The operator's table, 2026-11-05.
const TABLE = normaliseRouteTaxes([
  { route: 'KIX-EK', airport_tax: 3160, overseas_tax: 10800 },
  { route: 'KIX-QR', airport_tax: 3160, overseas_tax: 24800 },
  { route: 'NRT-EK', airport_tax: 3160, overseas_tax: 10800 },
  { route: 'NRT-QR', airport_tax: 3160, overseas_tax: 24800 },
  { route: 'nrt-ms ', airport_tax: '3160', overseas_tax: 8650 },
  { route: 'bad', airport_tax: 1, overseas_tax: 1 },
])

// KEK802-ABS: nights on days 2–6, flies home on day 7's evening flight.
const KEK802_DAYS = [
  { day: 1, overnight_city: null, overnight_kind: 'flight' },
  { day: 2, overnight_city: 'Cairo' },
  { day: 3, overnight_city: 'Abu Simbel' },
  { day: 4, overnight_city: 'Luxor' },
  { day: 5, overnight_city: 'Cairo' },
  { day: 6, overnight_city: 'Cairo' },
  { day: 7, overnight_city: null, overnight_kind: 'flight' },
  { day: 8, overnight_city: null },
]

const base = (over: Partial<TripMoneyInput> = {}): TripMoneyInput => ({
  currency: 'JPY',
  travellers: 2,
  tourTotal: 978000,
  fuelPerPerson: 54600,
  route: 'KIX-EK',
  routeTax: findRouteTax(TABLE, 'KIX-EK'),
  guideDriverTip: { amount: 45, currency: 'USD' },
  days: tourDays(KEK802_DAYS),
  toTripCurrency: (amount, from) => (from === 'USD' ? amount * 150 : null),
  rule: DEFAULT_PAYMENT_RULE,
  bookedOn: '2026-11-05',
  departureDate: '2027-03-10',
  ...over,
})

describe('route taxes', () => {
  it('keeps clean routes only, upper-cased, once', () => {
    expect(TABLE.map(r => r.route)).toEqual(['KIX-EK', 'KIX-QR', 'NRT-EK', 'NRT-QR', 'NRT-MS'])
    expect(findRouteTax(TABLE, 'NRT-MS')?.overseas_tax).toBe(8650)
  })

  it('reads the route from the first flight, else from the programme code', () => {
    expect(airportCode('関西空港')).toBe('KIX')
    expect(tripRoute([{ from: '関西', flight_no: 'EK317' }], 'NEK803-ABCR')).toBe('KIX-EK')
    expect(tripRoute([], 'NEK803-ABCR')).toBe('NRT-EK')
    expect(tripRoute([], 'KEK802-ABS')).toBe('KIX-EK')
    expect(tripRoute([], 'MSN805-CR')).toBe('NRT-MS')
    expect(tripRoute([], 'ZZZ')).toBeNull()
  })
})

describe('tour days', () => {
  it('counts Egypt days from the first night on the ground to the flight home', () => {
    expect(tourDays(KEK802_DAYS)).toEqual({ egypt: 6, cruise: 0 })
  })
  it('counts days aboard as cruise nights plus the day the ship is left', () => {
    const days = [
      { day: 2, overnight_city: 'Cairo' },
      { day: 3, overnight_city: 'Abu Simbel' },
      { day: 4, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 5, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 6, overnight_city: 'Nile Cruise', overnight_kind: 'cruise' },
      { day: 7, overnight_city: null, overnight_kind: 'flight' },
    ]
    expect(tourDays(days).cruise).toBe(4)
  })
})

describe('the confirmation from the trip', () => {
  it('fills every row the sheet has from the trip, in the sheet\'s words', () => {
    const lines = tripChargeLines(base())
    expect(lines.map(l => [l.description, l.unit_price, l.quantity, l.amount])).toEqual([
      ['海外旅行代金', 489000, 2, 978000],
      ['燃油サーチャージ・航空保険料等', 54600, 2, 109200],
      ['関西空港使用税', 3160, 2, 6320],
      ['国際観光旅客税', 3000, 2, 6000],
      ['海外空港諸税等', 10800, 2, 21600],
      // US$45 a day × 6 days in Egypt, for the group.
      ['日本語ガイド・英語ドライバーへのチップ (一組）', 6750, 6, 40500],
    ])
    // Each lands on its own row of the printed table.
    const { rows, sum } = confirmationCharges(lines, 'JPY')
    expect(rows[0].description).toBe('海外旅行代金')
    expect(rows[2].description).toBe('関西空港使用税')
    expect(rows.find(r => r.description.startsWith('日本語ガイド'))?.amount).toContain('40,500')
    expect(sum).toBe(978000 + 109200 + 6320 + 6000 + 21600 + 40500)
  })

  it('a cruise adds US$5 × days aboard per traveller', () => {
    const lines = tripChargeLines(base({ days: { egypt: 8, cruise: 4 } }))
    expect(lines.find(l => l.description === 'ナイル川クルーズ船チップ')).toEqual({
      description: 'ナイル川クルーズ船チップ', unit_price: 3000, quantity: 2, amount: 6000,
    })
  })

  it('leaves a row out when its source is missing — never guessed', () => {
    const lines = tripChargeLines(base({ fuelPerPerson: null, routeTax: null, guideDriverTip: null }))
    expect(lines.map(l => l.description)).toEqual(['海外旅行代金', '国際観光旅客税'])
    const noRate = tripChargeLines(base({ toTripCurrency: () => null }))
    expect(noRate.some(l => l.description.startsWith('日本語ガイド'))).toBe(false)
  })

  it('申込金 is 20% within three days, the rest sixty days before departure', () => {
    const s = tripPayments(1000000, base())!
    expect(s.deposit_amount).toBe(200000)
    expect(s.deposit_due_date).toBe('2026-11-08')
    expect(s.balance_amount).toBe(800000)
    expect(s.balance_due_date).toBe('2027-01-09')
  })

  it('rooms default to two to a room', () => {
    expect(defaultRooms(2)).toEqual({ rooms: '1', type: 'ツイン' })
    expect(defaultRooms(3)).toEqual({ rooms: '2', type: 'ツイン・シングル' })
    expect(defaultRooms(1)).toEqual({ rooms: '1', type: 'シングル' })
    expect(defaultRooms(0)).toEqual({ rooms: '', type: '' })
  })
})

describe('Guide & Driver as one tip', () => {
  const day = { hasGuide: true, hasDriver: true, hasAirportService: false, airportServiceCount: 0, hasHotelNight: false, isCruiseDay: false, isTransferOnly: false, isFreeDay: false }

  it('replaces the separate guide and driver tips, once a day', () => {
    expect(determineTipRolesForDay(day).map(r => r.role)).toEqual(['guide', 'driver'])
    expect(determineTipRolesForDay({ ...day, combinedGuideDriver: true }).map(r => r.role)).toEqual(['guide_driver'])
    expect(determineTipRolesForDay({ ...day, hasGuide: false, isTransferOnly: true, combinedGuideDriver: true })).toEqual([
      { role: 'guide_driver', context: 'transfer', quantity: 1 },
    ])
    expect(determineTipRolesForDay({ ...day, hasGuide: false, hasDriver: false, combinedGuideDriver: true })).toEqual([])
  })

  it('applies only when the agency has a guide_driver rate', () => {
    expect(hasCombinedGuideDriverTip({ allRates: [{ role_type: 'guide', rate_eur: 25 }] })).toBe(false)
    expect(hasCombinedGuideDriverTip({ allRates: [{ role_type: 'guide_driver', rate_eur: 45 }] })).toBe(true)
    expect(hasCombinedGuideDriverTip({ allRates: [{ role_type: 'guide_driver', rate_eur: 0 }] })).toBe(false)
  })
})
