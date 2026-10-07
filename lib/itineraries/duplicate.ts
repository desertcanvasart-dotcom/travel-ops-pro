// ============================================
// Duplicating an itinerary — what the copy keeps and what it leaves behind
// ============================================
// The copy is a new DRAFT of the same trip: its days, its services and their
// prices, the client and travellers, and every language's text (the trip,
// day and service versions). What belongs to the original trip's life stays
// behind:
//
//   · its identity — id, code, timestamps, the AI run and thread that made
//     it (an idempotency key or thread id would collide or mislead);
//   · where it got to — status, cancelled, payments, revenue, warnings;
//   · who was assigned — the assigned_* resource columns and their notes
//     (assignments are itinerary_resources, keyed to the original);
//   · the exchange rates frozen at confirmation (fx_frozen): the copy is
//     priced afresh when it is confirmed.
//
// The columns copied are LISTED, not "all but": a column added later (a
// token, a status) is not carried into copies until someone decides it
// should be. __tests__/lib/itinerary-duplicate.test.ts holds each list to the
// database types. Bookings, invoices, payments, resources, tasks, expenses,
// trip events and share links are separate tables keyed to the original;
// nothing here touches them. Pure: the route and the tests share it.
//
// Ported from autoura-saas (lib/itineraries/duplicate.ts), adapted to this
// app's columns and its language versions.

type Row = Record<string, unknown>

export const ITINERARY_COPY_COLUMNS = [
  'client_id', 'client_name', 'client_email', 'client_phone', 'trip_name',
  'start_date', 'end_date', 'total_days', 'num_adults', 'num_children', 'num_infants', 'num_travelers',
  'package_type', 'tier', 'total_cost', 'supplier_cost', 'profit', 'margin_percent',
  'currency', 'cost_mode', 'notes', 'source', 'pickup_location', 'pickup_time', 'destinations',
  'partner_id', 'partner_commission_percent', 'partner_commission_amount', 'cabin_allocation',
  'inclusions', 'exclusions', 'assigned_to', 'template_id', 'destination_id',
] as const

export const DAY_COPY_COLUMNS = [
  'day_number', 'date', 'city', 'title', 'description', 'overnight_city', 'attractions',
  'guide_required', 'lunch_included', 'dinner_included', 'hotel_included', 'flight_from',
  'is_cruise_day', 'transport_type', 'skip_arrival_checkin', 'extras', 'day_type', 'overnight',
  'has_sightseeing', 'airport_arrival', 'airport_departure', 'hotel_check_in', 'hotel_check_out',
  'intercity', 'leg_from', 'leg_to', 'leg_assist',
] as const

/** commission_status is left out: back to its default, the copy has earned nothing yet. */
export const SERVICE_COPY_COLUMNS = [
  'service_type', 'service_code', 'service_name', 'quantity', 'rate_eur', 'rate_non_eur', 'total_cost',
  'supplier_name', 'notes', 'client_price', 'supplier_id', 'is_preferred_supplier', 'commission_rate',
  'commission_amount', 'vehicle_type', 'pickup_location', 'dropoff_location', 'pickup_time',
  'supplier_currency', 'supplier_cost_original', 'exchange_rate_used', 'sold_by_supplier_id',
] as const

/** The trip's text in each language. The staff notes go with the staff. */
export const VERSION_COPY_COLUMNS = [
  'language', 'trip_name', 'notes', 'pickup_location', 'inclusions', 'exclusions',
] as const

/** A day's text in each language, with how it was translated and from what
 *  source text, so a reviewed translation stays reviewed. */
export const DAY_VERSION_COPY_COLUMNS = [
  'language', 'title', 'description', 'city', 'overnight_city', 'status', 'source_hash', 'translated_at',
] as const

export const SERVICE_VERSION_COPY_COLUMNS = ['language', 'service_name', 'notes'] as const

/** The select lists: what is copied, plus the ids the copy is wired by. */
export const ITINERARY_SELECT = ['id', 'itinerary_code', ...ITINERARY_COPY_COLUMNS].join(', ')
export const DAY_SELECT = ['id', ...DAY_COPY_COLUMNS].join(', ')
export const SERVICE_SELECT = ['id', 'itinerary_day_id', ...SERVICE_COPY_COLUMNS].join(', ')
export const VERSION_SELECT = VERSION_COPY_COLUMNS.join(', ')
export const DAY_VERSION_SELECT = ['itinerary_day_id', ...DAY_VERSION_COPY_COLUMNS].join(', ')
export const SERVICE_VERSION_SELECT = ['itinerary_service_id', ...SERVICE_VERSION_COPY_COLUMNS].join(', ')

const pick = (row: Row, columns: readonly string[]): Row => {
  const out: Row = {}
  for (const c of columns) if (c in row) out[c] = row[c]
  return out
}

/** A new code in the original's style: "ITN-2026-8987" → "ITN-<this year>-<4 digits>". */
export function copyCode(original: string | null | undefined, year: number, random: number): string {
  const m = String(original ?? '').match(/^([A-Z]+(?:-[A-Z]+)?)-\d{4}-\d+$/)
  const prefix = m ? m[1] : 'ITN'
  return `${prefix}-${year}-${random}`
}

/** A new draft, its name marked "(copy)" so the two are told apart in lists. */
export function copyItinerary(row: Row, code: string): Row {
  return {
    ...pick(row, ITINERARY_COPY_COLUMNS),
    itinerary_code: code,
    status: 'draft',
    trip_name: `${String(row.trip_name ?? 'Itinerary').trim()} (copy)`,
  }
}

/** Ids the copy's rows are given up front, so translations can follow their day and line. */
export type IdMap = ReadonlyMap<string, string>

export function copyDay(row: Row, itineraryId: string, newId: string): Row {
  return { ...pick(row, DAY_COPY_COLUMNS), id: newId, itinerary_id: itineraryId }
}

/**
 * A service, on the copy's day. A line whose day is not among the copied
 * days is left out (null), rather than attached to the wrong one.
 */
export function copyService(row: Row, dayIds: IdMap, newId: string): Row | null {
  const newDay = dayIds.get(String(row.itinerary_day_id ?? ''))
  if (!newDay) return null
  return { ...pick(row, SERVICE_COPY_COLUMNS), id: newId, itinerary_day_id: newDay }
}

export function copyVersion(row: Row, itineraryId: string): Row {
  return { ...pick(row, VERSION_COPY_COLUMNS), itinerary_id: itineraryId }
}

/** A day's translation, on the copy's day; null when its day was not copied. */
export function copyDayVersion(row: Row, dayIds: IdMap): Row | null {
  const day = dayIds.get(String(row.itinerary_day_id ?? ''))
  return day ? { ...pick(row, DAY_VERSION_COPY_COLUMNS), itinerary_day_id: day } : null
}

/** A service line's translation, on the copy's line; null when the line was not copied. */
export function copyServiceVersion(row: Row, serviceIds: IdMap): Row | null {
  const service = serviceIds.get(String(row.itinerary_service_id ?? ''))
  return service ? { ...pick(row, SERVICE_VERSION_COPY_COLUMNS), itinerary_service_id: service } : null
}
