// ============================================
// OPERATIONS SHEET — turning stored rows into a document context
// ============================================
// Pure. Takes the rows a route has already fetched and returns the context the
// template renders. Kept out of the route so the mapping — which day counts as
// D2, where breakfast comes from, how the hotel block is derived — is testable
// against a fixture without a database.
//
// The guiding rule: NEVER invent a fact. A field the office has not filled
// stays null and renders as a blank to write into. A sheet that quietly guesses
// a guide's mobile or a flight number is worse than one with a gap, because the
// ground team cannot tell the difference between a guess and a fact.

import type {
  OperationsSheetContext,
  OperationsSheetDay,
  OperationsSheetHotel,
  StaffContact,
} from './types'

/** The itinerary_days columns this mapping reads. */
export interface SourceDay {
  day_number: number | null
  date: string | null
  city: string | null
  title: string | null
  description: string | null
  overnight_city: string | null
  attractions: string[] | null
  lunch_included: boolean | null
  dinner_included: boolean | null
  hotel_included: boolean | null
  flight_from: string | null
  hotel_check_in: string | null
  hotel_check_out: string | null
}

export interface SourceItinerary {
  itinerary_code: string | null
  trip_name: string | null
  start_date: string | null
  end_date: string | null
  num_adults: number | null
  num_children: number | null
}

export interface AssembleInput {
  itinerary: SourceItinerary
  days: SourceDay[]
  /** Facts the office holds that are not on the itinerary. All optional — an
   *  absent one becomes a blank on the sheet, exactly as on their paper. */
  overrides?: {
    file_no?: string | null
    group_ref?: string | null
    operator?: string | null
    confirmed_date?: string | null
    final_date?: string | null
    room_count?: number | null
    remarks?: string | null
    arrival_flight?: string | null
    departure_flight?: string | null
    guides?: StaffContact[]
    hotels?: OperationsSheetHotel[]
    /** @font-face CSS for NotoSansJP. Read from disk by the route, never
     *  here: this function stays pure so a sheet can be asserted as a string. */
    font_face_css?: string
  }
}

/** One day's text in one language, as stored in itinerary_day_versions. */
export interface DayLanguageVersion {
  itinerary_day_id: string
  title: string | null
  description: string | null
  city: string | null
  overnight_city: string | null
}

/**
 * Overlay the ground team's language onto the canonical days.
 *
 * The canonical itinerary_days row is written in the language the office SOLD
 * in — Japanese, for the Tokyo desk. That is the right text for the customer's
 * 日程表 and the wrong text for Cairo. Translations live in
 * itinerary_day_versions, one row per day per language, and this applies them
 * with the same precedence /api/itineraries/[id]/days uses: a version wins
 * where it has text, the canonical row shows through where it does not.
 *
 * A day with no version keeps its canonical text. An instruction in the wrong
 * language is still an instruction; a blank line on a ground sheet is a day the
 * team drives into with nothing.
 */
export function applyDayLanguageVersions<T extends { id: string } & Partial<SourceDay>>(
  days: T[],
  versions: DayLanguageVersion[]
): T[] {
  const byDay = new Map<string, DayLanguageVersion>()
  for (const version of versions) byDay.set(version.itinerary_day_id, version)

  return days.map(day => {
    const version = byDay.get(day.id)
    if (!version) return day
    return {
      ...day,
      title: version.title || day.title,
      description: version.description || day.description,
      city: version.city || day.city,
      overnight_city: version.overnight_city || day.overnight_city,
    }
  })
}

/** Short codes the ground team writes for an overnight city. */
const CITY_CODES: Record<string, string> = {
  cairo: 'CAI',
  giza: 'GIZA',
  'abu simbel': 'ABS',
  aswan: 'ASW',
  luxor: 'LXR',
  'kom ombo': 'KMB',
  edfu: 'EDF',
  alexandria: 'ALX',
  hurghada: 'HRG',
}

/** A city as the ground team codes it. Unknown cities pass through upper-cased
 *  rather than being dropped — a code nobody recognises is still a place, and
 *  losing it would silently remove the overnight from the sheet. */
export function cityCode(city: string | null | undefined): string | null {
  if (!city) return null
  const key = city.trim().toLowerCase()
  return CITY_CODES[key] ?? city.trim().toUpperCase()
}

/** The instructions for one day, in the order they happen. */
function dayLines(day: SourceDay): string[] {
  const lines: string[] = []
  if (day.title) lines.push(day.title)
  for (const line of (day.description ?? '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed) lines.push(trimmed)
  }
  for (const attraction of day.attractions ?? []) {
    const trimmed = String(attraction ?? '').trim()
    if (trimmed) lines.push(trimmed)
  }
  return lines
}

export function assembleOperationsSheet(input: AssembleInput): OperationsSheetContext {
  const { itinerary, days, overrides = {} } = input
  const ordered = [...days].sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0))

  const mappedDays: OperationsSheetDay[] = ordered.map((day, index) => {
    const previous = ordered[index - 1]
    return {
      // The operator's own numbering, preserved. A trip whose first night is in
      // the air has no ground day 1, and renumbering from 1 here would put every
      // instruction on the wrong day relative to the customer's itinerary.
      label: `D${day.day_number ?? index + 1}`,
      date: day.date,
      lines: dayLines(day),
      meals: {
        // itinerary_days has no breakfast column because breakfast is not
        // arranged, it is a consequence: you get one if you slept somewhere
        // last night. The first ground day therefore has none.
        breakfast: Boolean(previous?.hotel_included),
        lunch: Boolean(day.lunch_included),
        dinner: Boolean(day.dinner_included),
      },
      accommodation_code: day.hotel_included
        ? cityCode(day.overnight_city ?? day.city)
        : null,
    }
  })

  // The hotel block, derived from consecutive nights in the same place — the
  // ground team books one stay, not three separate nights.
  const hotels: OperationsSheetHotel[] = overrides.hotels ?? deriveHotels(ordered)

  const pax =
    (itinerary.num_adults ?? 0) + (itinerary.num_children ?? 0) || null

  return {
    tour_code: itinerary.itinerary_code ?? null,
    file_no: overrides.file_no ?? null,
    group_ref: overrides.group_ref ?? null,
    operator: overrides.operator ?? null,
    confirmed_date: overrides.confirmed_date ?? null,
    final_date: overrides.final_date ?? null,

    pax_count: pax,
    room_count: overrides.room_count ?? null,
    remarks: overrides.remarks ?? null,

    arrival_date: itinerary.start_date ?? null,
    departure_date: itinerary.end_date ?? null,
    nights: countNights(ordered),
    arrival_flight: overrides.arrival_flight ?? ordered[0]?.flight_from ?? null,
    departure_flight: overrides.departure_flight ?? null,

    guides: overrides.guides ?? [],
    days: mappedDays,
    hotels,
    font_face_css: overrides.font_face_css ?? '',
  }
}

function countNights(days: SourceDay[]): number | null {
  const nights = days.filter(d => d.hotel_included).length
  return nights || null
}

/** Collapse consecutive nights in one city into a single stay. */
function deriveHotels(days: SourceDay[]): OperationsSheetHotel[] {
  const stays: OperationsSheetHotel[] = []

  for (const day of days) {
    if (!day.hotel_included) continue
    const code = cityCode(day.overnight_city ?? day.city)
    const last = stays[stays.length - 1]

    if (last && last.city === code) {
      last.nights = (last.nights ?? 0) + 1
      last.check_out = day.hotel_check_out ?? last.check_out
      continue
    }

    stays.push({
      city: code,
      hotel: null,
      check_in: day.hotel_check_in ?? day.date,
      check_out: day.hotel_check_out ?? null,
      nights: 1,
      room: null,
      remarks: null,
    })
  }

  return stays
}
