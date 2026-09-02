// ============================================
// A programme's day plan → itinerary_days rows
// ============================================
// A tour template keeps its programme in `tour_templates.itinerary`, a JSONB
// list of days (the shape the tour-manager form and the B2B calculator's
// "Edit Itinerary" both write). Converting a quote into an itinerary has to
// copy that plan into itinerary_days, one dated row per day — the rows the
// ops sheet, the quote PDF, the vouchers and the portal all read.
//
// It used to read `tour_days` instead: a legacy table keyed by `tour_id` with
// no relationship to tour_templates at all. PostgREST refuses an embed with
// no foreign key (PGRST200) and fails the WHOLE query, so the convert route
// answered "Quote not found" for every quote in production while the page
// beside it displayed the quote perfectly well (lib/postgrest trap, again).
//
// Pure, so it is unit-tested; the route only fetches and inserts.

/** One day as stored on tour_templates.itinerary. Every field is optional —
 *  programmes were imported from documents and hand-edited since. */
export interface TemplateDay {
  day?: number
  day_number?: number
  city?: string | null
  title?: string | null
  description?: string | null
  overnight_city?: string | null
  attractions?: string[] | null
  /** e.g. ['lunch', 'dinner'] — breakfast is a hotel matter, not listed. */
  meals?: string[] | null
  is_cruise_day?: boolean | null
  /** 'hotel' | 'cruise' | 'train' | 'flight' | 'none' … — anything but
   *  'none'/'flight' means a bed is booked that night. */
  overnight_kind?: string | null
  services?: {
    guide_required?: boolean | null
    airport_arrival?: boolean | null
    airport_departure?: boolean | null
    hotel_checkin?: boolean | null
    hotel_checkout?: boolean | null
  } | null
}

/** The itinerary_days columns the conversion writes. */
export interface ItineraryDayRow {
  day_number: number
  date: string
  title: string
  description: string
  city: string
  overnight_city: string
  attractions: string[]
  lunch_included: boolean
  dinner_included: boolean
  hotel_included: boolean
  is_cruise_day: boolean
  guide_required: boolean
  airport_arrival: boolean
  airport_departure: boolean
}

/** YYYY-MM-DD for `start` plus `offset` days, computed on calendar parts so a
 *  timezone west of UTC does not shift the trip back a day. */
export function addDays(start: string, offset: number): string {
  const [y, m, d] = start.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offset))
  return dt.toISOString().slice(0, 10)
}

const NO_BED = new Set(['none', 'flight', 'in_flight', 'airport'])

/**
 * Build the dated day rows for a trip of `durationDays` starting `startDate`.
 *
 * A programme day is matched by its number; a day the programme does not
 * describe still gets a row (the trip is that long), titled "Day N" with
 * nothing invented for it. Meals are read from the programme's list; a night
 * counts as a hotel night unless the programme says the night is spent in the
 * air or nowhere. The last day never has an overnight.
 */
export function templateDaysToItineraryDays(
  programme: TemplateDay[] | null | undefined,
  startDate: string,
  durationDays: number
): ItineraryDayRow[] {
  const days = Array.isArray(programme) ? programme : []
  const byNumber = new Map<number, TemplateDay>()
  for (const d of days) {
    const n = Number(d.day ?? d.day_number)
    if (Number.isFinite(n) && n > 0 && !byNumber.has(n)) byNumber.set(n, d)
  }

  const total = Math.max(1, Math.floor(durationDays || 1))
  const rows: ItineraryDayRow[] = []
  for (let n = 1; n <= total; n++) {
    const src = byNumber.get(n)
    const meals = (src?.meals ?? []).map(m => String(m).toLowerCase())
    const last = n === total
    const kind = (src?.overnight_kind ?? '').toLowerCase()
    const isCruise = !!src?.is_cruise_day
    rows.push({
      day_number: n,
      date: addDays(startDate, n - 1),
      title: (src?.title ?? '').trim() || `Day ${n}`,
      description: src?.description ?? '',
      city: src?.city ?? '',
      overnight_city: last ? '' : (src?.overnight_city ?? src?.city ?? ''),
      attractions: Array.isArray(src?.attractions) ? src!.attractions!.filter(Boolean).map(String) : [],
      lunch_included: meals.includes('lunch'),
      dinner_included: meals.includes('dinner'),
      hotel_included: !last && !NO_BED.has(kind),
      is_cruise_day: isCruise,
      guide_required: src?.services?.guide_required ?? false,
      airport_arrival: src?.services?.airport_arrival ?? false,
      airport_departure: src?.services?.airport_departure ?? false,
    })
  }
  return rows
}

// ---------- package type ----------
// itineraries.package_type is a Postgres ENUM (day-trips | tours-only |
// land-package | full-package | cruise-land | shore-excursions |
// cruise-package). The convert route used to write 'custom' — not a member —
// so every template conversion died at the itinerary insert with a bare
// "Failed to create itinerary" (found by replaying the schema locally; the
// route logs nothing of the database's reason).
//
// Same signal the pricing engine reads (lib/auto-pricing-service.ts): a
// single-day tour_type is a day trip; a cruise programme is cruise + land;
// everything else keeps the engine's historical full-package assumption.

export const SINGLE_DAY_TOUR_TYPES = ['day_tour', 'half_day', 'stopover'] as const

export type ItineraryPackageType =
  | 'day-trips' | 'tours-only' | 'land-package' | 'full-package'
  | 'cruise-land' | 'shore-excursions' | 'cruise-package'

export function packageTypeForTemplate(
  template: { tour_type?: string | null; duration_days?: number | null } | null | undefined
): ItineraryPackageType {
  const type = (template?.tour_type ?? '').toLowerCase()
  if ((SINGLE_DAY_TOUR_TYPES as readonly string[]).includes(type)) return 'day-trips'
  if ((template?.duration_days ?? 0) === 1) return 'day-trips'
  if (type === 'cruise') return 'cruise-land'
  return 'full-package'
}
