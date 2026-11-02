// ============================================
// A trip's own flights (itineraries.flights, migration 20270114)
// ============================================
// The tickets the customer flies on — booked in Japan, so never priced here —
// in the order flown. The booking confirmation prints them as the office's
// フライトスケジュール table. Everything is a string the office typed, blanks
// allowed: times firm up after the booking, and a half-filled row is still the
// row the office wants printed.

export interface TripFlight {
  /** YYYY-MM-DD, or '' while unknown. */
  date: string
  from: string
  to: string
  flight_no: string
  /** "23:45" as the ticket says it, local time. */
  depart: string
  /** "04:35", or "04:35+1" for next-day arrival — the office's own notation. */
  arrive: string
  /** 予約状況 — OK, RQ, WL … */
  status: string
}

export const MAX_TRIP_FLIGHTS = 12

const FIELDS: Array<keyof TripFlight> = ['date', 'from', 'to', 'flight_no', 'depart', 'arrive', 'status']

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * The stored shape from whatever arrived — the PUT body or a row read back.
 * Rows with nothing typed in are dropped; anything else is kept as typed.
 * Returns null when the input is not a list at all, so the route can refuse it
 * rather than silently clearing the trip's flights.
 */
export function normaliseTripFlights(input: unknown): TripFlight[] | null {
  if (!Array.isArray(input)) return null
  return input
    .slice(0, MAX_TRIP_FLIGHTS)
    .map(row => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
      const date = text(r.date, 10)
      return {
        date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
        from: text(r.from, 60),
        to: text(r.to, 60),
        flight_no: text(r.flight_no, 20).toUpperCase(),
        depart: text(r.depart, 10),
        arrive: text(r.arrive, 10),
        status: text(r.status, 10).toUpperCase(),
      }
    })
    .filter(f => FIELDS.some(k => f[k] !== ''))
}

/** Airline codes the ATS paper spells out under the table (略語説明). */
const AIRLINES: Record<string, string> = {
  EK: 'エミレーツ航空',
  MS: 'エジプト航空',
  QR: 'カタール航空',
  TK: 'ターキッシュ エアラインズ',
  EY: 'エティハド航空',
  NH: '全日空',
  JL: '日本航空',
}

/** 「EK＝エミレーツ航空」 for each carrier the flights use, in first-flown order. */
export function airlineLegend(flights: TripFlight[]): string[] {
  const seen: string[] = []
  for (const f of flights) {
    const code = f.flight_no.replace(/\s+/g, '').slice(0, 2)
    if (AIRLINES[code] && !seen.includes(code)) seen.push(code)
  }
  return seen.map(code => `${code}＝${AIRLINES[code]}`)
}
