// ============================================
// tour_templates row → 日程表 context
// ============================================
// The decision half: which Japanese label each overnight gets, what each meal
// slot prints, how the schedule text splits into lines. Pure — the route does
// the I/O. NEVER invents: a fact the import did not capture renders as a blank
// or an ×, not as a guess.

import type { DailyItineraryContext, DailyItineraryDay } from './templates/ats-daily-itinerary'

/** The reverse of the importer's OVERNIGHT map — city back to the label the
 *  office writes in the 宿泊地 column. */
const CITY_JA: Record<string, string> = {
  Cairo: 'カイロ',
  Giza: 'ギザ',
  Aswan: 'アスワン',
  Luxor: 'ルクソール',
  'Abu Simbel': 'アブ・シンベル',
  Hurghada: 'ハルガダ',
  'Bahariya Oasis': 'バハレヤオアシス',
  Alexandria: 'アレキサンドリア',
  'Dead Sea': '死海',
  Petra: 'ペトラ',
  Amman: 'アンマン',
}

const KIND_JA: Record<string, string> = {
  cruise: '船中泊',
  flight: '機中泊',
  train: '列車泊',
  vehicle: '車中泊',
}

export interface SourceProgramDay {
  day: number
  description: string | null
  attractions: string[] | null
  meals: string[] | null
  meals_in_flight?: string[] | null
  menu?: { breakfast?: string; lunch?: string; dinner?: string } | null
  overnight_city: string | null
  overnight_kind?: string | null
  is_cruise_day?: boolean
}

function overnightLabel(day: SourceProgramDay): string {
  // Nights not spent in a bed ashore carry their kind, exactly as the office
  // writes them. Older rows imported before overnight_kind was stored fall
  // back to what can be said without guessing.
  const kind = day.overnight_kind ?? (day.is_cruise_day ? 'cruise' : null)
  if (kind && kind !== 'hotel' && KIND_JA[kind]) return KIND_JA[kind]
  if (day.overnight_city) return CITY_JA[day.overnight_city] ?? day.overnight_city
  return ''
}

function mealSlot(day: SourceProgramDay, slot: 'breakfast' | 'lunch' | 'dinner'): string {
  const dish = day.menu?.[slot]
  if (dish) return dish
  if (day.meals?.includes(slot)) return '〇'
  if (day.meals_in_flight?.includes(slot)) return '機内'
  return '×'
}

export interface OrgOffice {
  label?: string | null
  postal_code?: string | null
  address?: string | null
  tel?: string | null
  fax?: string | null
}

export interface OrgBranding {
  name: string | null
  logo_url: string | null
  company_phone: string | null
  contact_email: string | null
  company_website: string | null
  company_address: string | null
  document_contacts: Record<string, string> | null
  offices?: OrgOffice[] | null
}

export interface SourceProgramHotel {
  hotel?: string | null
  check_in?: string | null
  check_out?: string | null
  phone?: string | null
  address?: string | null
}

export interface AssembleProgramInput {
  template_code: string
  itinerary: SourceProgramDay[] | null
  hotels: SourceProgramHotel[] | null
  created_date: string
  font_face_css: string
  org: OrgBranding | null
  /** Departure-specific facts, all optional — absent renders the blank
   *  template exactly as before. Dates are computed as departure + (day-1). */
  departure?: {
    start_date: string | null
    cairo_guide: string | null
    south_guide: string | null
    author: string | null
  }
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

/** "10/5" over "(月)" — the two lines of the date cell, as the office writes
 *  them. Computed in UTC so the label never shifts a day by server timezone. */
function dateLabel(startDate: string, dayNumber: number): { md: string; wd: string } | null {
  const base = new Date(`${startDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return null
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + (dayNumber - 1))
  return {
    md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
    wd: WEEKDAYS_JA[d.getUTCDay()],
  }
}

/** A stretch of consecutive nights spent in one place — one hotel's stay.
 *
 *  `overnight_city` on day N means the night AFTER day N is spent there, so a
 *  run ending on day 3 checks out on the morning of day 4.
 *
 *  Nights not spent in a bed ashore split two ways: a cruise cabin, a sleeper
 *  train or a coach IS a stay the office lists in 利用ホテル (ナイル川クルーズ船,
 *  寝台列車), while a night in the air is not. Consecutive nights merge only
 *  when they are the same place — two Cairo stays either side of a cruise are
 *  two separate hotel rows, and the office lists them as two.
 */
function overnightRuns(days: SourceProgramDay[]): Array<{ startDay: number; endDay: number }> {
  const runs: Array<{ key: string; startDay: number; endDay: number }> = []
  for (const day of days) {
    const kind = day.overnight_kind ?? (day.is_cruise_day ? 'cruise' : null)
    if (kind === 'flight' || kind === 'none') continue
    const key = day.overnight_city || (kind ? `KIND:${kind}` : '')
    if (!key) continue
    const last = runs[runs.length - 1]
    if (last && last.key === key && last.endDay === day.day - 1) last.endDay = day.day
    else runs.push({ key, startDay: day.day, endDay: day.day })
  }
  return runs.map(({ startDay, endDay }) => ({ startDay, endDay }))
}

/** Fill 利用ホテル check-in/check-out from the departure date.
 *
 *  The hotel rows the importer captured are in itinerary order, one per stay,
 *  so they pair positionally with the overnight runs. That pairing is the whole
 *  basis for the dates, which makes its arity the thing to check: if the source
 *  document listed a different number of hotels than the programme has stays,
 *  the rows no longer line up and every date after the discrepancy would land
 *  on the wrong hotel. A customer document with confidently wrong dates is
 *  worse than one with blanks the office fills by hand, so a mismatch fills
 *  nothing — same rule as the rest of this file.
 */
function withStayDates<T extends { check_in: string; check_out: string }>(
  hotelRows: T[],
  days: SourceProgramDay[],
  startDate: string | null
): T[] {
  if (!startDate) return hotelRows
  const runs = overnightRuns(days)
  if (runs.length !== hotelRows.length) return hotelRows

  return hotelRows.map((row, i) => {
    const checkIn = dateLabel(startDate, runs[i].startDay)
    const checkOut = dateLabel(startDate, runs[i].endDay + 1)
    if (!checkIn || !checkOut) return row
    return { ...row, check_in: checkIn.md, check_out: checkOut.md }
  })
}

export function assembleProgramItinerary(input: AssembleProgramInput): DailyItineraryContext {
  const days = [...(input.itinerary ?? [])].sort((a, b) => (a.day ?? 0) - (b.day ?? 0))

  const startDate = input.departure?.start_date ?? null
  const contextDays: DailyItineraryDay[] = days.map(day => ({
    day: day.day,
    date: startDate ? dateLabel(startDate, day.day) : null,
    overnight_label: overnightLabel(day),
    schedule_lines: String(day.description ?? '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean),
    attractions: (day.attractions ?? []).map(a => String(a).trim()).filter(Boolean),
    meals: {
      breakfast: mealSlot(day, 'breakfast'),
      lunch: mealSlot(day, 'lunch'),
      dinner: mealSlot(day, 'dinner'),
    },
  }))

  // The programme's standard hotels, exactly as the source document lists
  // them: names/phones/addresses filled. Check-in/out are per-departure — the
  // source holds only the office's blank mark ("/") — so they are computed
  // from the departure date, and left exactly as found without one.
  const hotelRows = withStayDates(
    (input.hotels ?? [])
      .filter(h => (h.hotel ?? '').trim())
      .map(h => ({
        hotel: (h.hotel ?? '').trim(),
        check_in: (h.check_in ?? '').trim(),
        check_out: (h.check_out ?? '').trim(),
        phone: (h.phone ?? '').trim(),
        address: (h.address ?? '').trim(),
      })),
    days,
    startDate
  )

  const org = input.org
  const contacts = org?.document_contacts ?? {}

  return {
    program_code: input.template_code,
    created_date: input.created_date,
    days: contextDays,
    hotel_rows: hotelRows,
    font_face_css: input.font_face_css,
    letterhead: {
      logo_url: org?.logo_url ?? null,
      company_name: org?.name ?? '',
      offices: (org?.offices ?? [])
        .map(o => ({
          label: (o.label ?? '').trim(),
          postal_code: (o.postal_code ?? '').trim(),
          address: (o.address ?? '').trim(),
          tel: (o.tel ?? '').trim(),
          fax: (o.fax ?? '').trim(),
        }))
        .filter(o => o.label || o.address || o.tel),
      lines: [
        org?.company_address,
        [org?.company_phone, org?.contact_email].filter(Boolean).join(' · '),
        org?.company_website,
      ]
        .map(l => (l ?? '').trim())
        .filter(Boolean),
    },
    office_contacts: {
      // The guide cells are PER-TRIP: blank on the bare programme document,
      // filled when the office generates for a departure.
      cairo_guide: input.departure?.cairo_guide ?? '',
      south_guide: input.departure?.south_guide ?? '',
      emergency_japan: contacts.emergency_japan ?? '',
      cairo_office: contacts.cairo_office ?? '',
    },
    author: input.departure?.author ?? '',
  }
}
