// ============================================
// The 予約確認書's money, read from the trip
// ============================================
// The operator, 2026-11-05: the confirmation should "read directly from the
// itinerary and the prices and the rules of deposit automatically instead of
// filling it manually". Until now its price table came ONLY from an invoice
// the office had typed; with none, every row printed ¥0.
//
// Each row and where it now comes from — never guessed; a source that is
// missing leaves its row at ¥0, exactly as the Excel looked before anybody
// typed it:
//
//   海外旅行代金          the trip's selling price (a website order's fare is
//                         final — lib/pricing/website-price)
//   燃油サーチャージ       the departure date's 燃油 per person (Departures ›
//                         Dates & prices) × travellers
//   ○○空港使用税          the ROUTE's airport tax × travellers
//   国際観光旅客税        ¥3,000 per traveller (the sheet's own amount)
//   海外空港諸税等        the ROUTE's overseas taxes × travellers
//   ガイド・ドライバーチップ  the "Guide & Driver" tip (Rates › Tipping, e.g.
//                         US$45 a day) × the days in Egypt, for the group
//   クルーズ船チップ       US$5 × days aboard, per traveller (the sheet's 備考)
//
// A ROUTE is departure airport + airline (KIX-EK, NRT-QR …), the operator's
// table in Company profile. It is read from the trip's first flight, else
// from the programme code (NEK803 = Narita + Emirates).
//
// 申込金 / 残金 follow the company's payment rule (20% within 3 days of the
// booking, the rest 60 days before departure — lib/payment-schedule).
//
// Pure: everything it needs is passed in. Travellers here are adults and
// children; an infant under two pays none of these per-person charges.

import { computePaymentSchedule, type PaymentRule } from '@/lib/payment-schedule'

export interface RouteTax {
  /** "KIX-EK": departure airport code, a dash, airline code. */
  route: string
  airport_tax: number
  overseas_tax: number
}

/** The sheet's 国際観光旅客税 per traveller. */
export const DEPARTURE_TAX_JPY = 3000
/** The sheet's 備考: 「ナイル川クルーズ船を含む場合はお一人様US＄5ｘ日数」. */
export const CRUISE_TIP_USD_PER_DAY = 5

const AIRPORT_ALIASES: Array<[RegExp, string]> = [
  [/\bKIX\b|関西|関空/i, 'KIX'],
  [/\bNRT\b|成田/i, 'NRT'],
  [/\bHND\b|羽田/i, 'HND'],
  [/\bNGO\b|中部|セントレア|名古屋/i, 'NGO'],
  [/\bFUK\b|福岡/i, 'FUK'],
]
const AIRPORT_JA: Record<string, string> = { KIX: '関西', NRT: '成田', HND: '羽田', NGO: '中部', FUK: '福岡' }

export function airportCode(text: string | null | undefined): string | null {
  const t = String(text ?? '')
  for (const [re, code] of AIRPORT_ALIASES) if (re.test(t)) return code
  return null
}

/** The route the trip flies: its first flight's airport and carrier, else
 *  the programme code (N/K + EK/MS/QR, either order). */
export function tripRoute(
  flights: Array<{ from: string; flight_no: string }>,
  programmeCode: string | null | undefined
): string | null {
  const first = flights.find(f => airportCode(f.from))
  if (first) {
    const carrier = first.flight_no.replace(/\s+/g, '').slice(0, 2).toUpperCase()
    if (/^[A-Z0-9]{2}$/.test(carrier)) return `${airportCode(first.from)}-${carrier}`
  }
  const code = String(programmeCode ?? '').toUpperCase()
  const m = code.match(/^([NK])-?(EK|MS|QR|TK|EY)/) ?? code.match(/^(EK|MS|QR|TK|EY)-?([NK])/)
  if (!m) return null
  const [airport, carrier] = /^[NK]$/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]
  return `${airport === 'N' ? 'NRT' : 'KIX'}-${carrier}`
}

export function findRouteTax(table: RouteTax[], route: string | null): RouteTax | null {
  if (!route) return null
  const key = route.toUpperCase().replace(/\s+/g, '')
  return table.find(r => r.route.toUpperCase().replace(/\s+/g, '') === key) ?? null
}

/** Clean the stored list: known fields, numbers ≥ 0, "AAA-BB" routes. */
export function normaliseRouteTaxes(value: unknown): RouteTax[] {
  if (!Array.isArray(value)) return []
  const out: RouteTax[] = []
  for (const row of value.slice(0, 50)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const route = String(r.route ?? '').toUpperCase().replace(/\s+/g, '')
    if (!/^[A-Z]{3}-[A-Z0-9]{2}$/.test(route)) continue
    const n = (v: unknown) => {
      const x = Number(v)
      return Number.isFinite(x) && x >= 0 ? Math.round(x) : 0
    }
    if (out.some(o => o.route === route)) continue
    out.push({ route, airport_tax: n(r.airport_tax), overseas_tax: n(r.overseas_tax) })
  }
  return out
}

export interface ProgrammeDay {
  day: number
  overnight_city?: string | null
  overnight_kind?: string | null
  is_cruise_day?: boolean
}

const isCruiseNight = (d: ProgrammeDay) =>
  Boolean(d.is_cruise_day || d.overnight_kind === 'cruise' || /cruise|船中/i.test(d.overnight_city ?? ''))
const isGroundNight = (d: ProgrammeDay) => Boolean(d.overnight_city) && d.overnight_kind !== 'flight'

/**
 * Days in Egypt and days aboard, from the programme's nights.
 *   - in Egypt: the first day with a night on the ground through the day
 *     after the last such night (the day the customer flies home). KEK802:
 *     nights on days 2–6, home on day 7's flight → 6 days.
 *   - aboard: the cruise nights plus the day the ship is left.
 */
export function tourDays(days: ProgrammeDay[]): { egypt: number; cruise: number } {
  const sorted = [...days].sort((a, b) => a.day - b.day)
  const ground = sorted.filter(isGroundNight)
  let egypt = 0
  if (ground.length) {
    const first = ground[0].day
    const last = ground[ground.length - 1].day
    const end = sorted.some(d => d.day === last + 1) ? last + 1 : last
    egypt = end - first + 1
  }
  const cruiseNights = sorted.filter(isCruiseNight).length
  return { egypt, cruise: cruiseNights ? cruiseNights + 1 : 0 }
}

export interface TripMoneyInput {
  currency: string
  /** Adults + children (infants pay none of the per-person rows). */
  travellers: number
  /** The trip's selling price for the party; null = unknown. */
  tourTotal: number | null
  fuelPerPerson: number | null
  route: string | null
  routeTax: RouteTax | null
  /** The Guide & Driver tip a day for the group, and its currency. */
  guideDriverTip: { amount: number; currency: string } | null
  days: { egypt: number; cruise: number }
  /** How many yen one US$ (or the tip's currency) buys; null = no rate. */
  toTripCurrency: (amount: number, from: string) => number | null
  rule: PaymentRule
  bookedOn: string
  departureDate: string | null
}

export interface TripLine {
  description: string
  unit_price: number | ''
  quantity: number | ''
  amount: number
}

const yen = (n: number) => Math.round(n)

/** The sheet's rows from the trip, in the words confirmationCharges matches. */
export function tripChargeLines(input: TripMoneyInput): TripLine[] {
  const pax = Math.max(0, Math.floor(input.travellers))
  const lines: TripLine[] = []
  if (input.tourTotal && input.tourTotal > 0) {
    lines.push({
      description: '海外旅行代金',
      unit_price: pax ? yen(input.tourTotal / pax) : '',
      quantity: pax || '',
      amount: yen(input.tourTotal),
    })
  }
  if (input.fuelPerPerson && input.fuelPerPerson > 0 && pax) {
    lines.push({ description: '燃油サーチャージ・航空保険料等', unit_price: yen(input.fuelPerPerson), quantity: pax, amount: yen(input.fuelPerPerson * pax) })
  }
  if (input.routeTax && pax) {
    const airport = input.route?.split('-')[0] ?? ''
    if (input.routeTax.airport_tax > 0) {
      lines.push({
        description: `${AIRPORT_JA[airport] ?? airport}空港使用税`,
        unit_price: input.routeTax.airport_tax,
        quantity: pax,
        amount: input.routeTax.airport_tax * pax,
      })
    }
  }
  if (pax) lines.push({ description: '国際観光旅客税', unit_price: DEPARTURE_TAX_JPY, quantity: pax, amount: DEPARTURE_TAX_JPY * pax })
  if (input.routeTax && input.routeTax.overseas_tax > 0 && pax) {
    lines.push({ description: '海外空港諸税等', unit_price: input.routeTax.overseas_tax, quantity: pax, amount: input.routeTax.overseas_tax * pax })
  }
  if (input.guideDriverTip && input.guideDriverTip.amount > 0 && input.days.egypt > 0) {
    const perDay = input.toTripCurrency(input.guideDriverTip.amount, input.guideDriverTip.currency)
    if (perDay !== null) {
      const unit = yen(perDay)
      lines.push({ description: '日本語ガイド・英語ドライバーへのチップ (一組）', unit_price: unit, quantity: input.days.egypt, amount: unit * input.days.egypt })
    }
  }
  if (input.days.cruise > 0 && pax) {
    const perPerson = input.toTripCurrency(CRUISE_TIP_USD_PER_DAY * input.days.cruise, 'USD')
    if (perPerson !== null) {
      const unit = yen(perPerson)
      lines.push({ description: 'ナイル川クルーズ船チップ', unit_price: unit, quantity: pax, amount: unit * pax })
    }
  }
  return lines
}

/** 申込金 and 残金 by the company's rule, over the whole of the lines. */
export function tripPayments(total: number, input: Pick<TripMoneyInput, 'currency' | 'rule' | 'bookedOn' | 'departureDate'>) {
  if (!(total > 0)) return null
  return computePaymentSchedule({
    total,
    currency: input.currency,
    booked_on: input.bookedOn,
    departure_date: input.departureDate,
    rule: input.rule,
  })
}
