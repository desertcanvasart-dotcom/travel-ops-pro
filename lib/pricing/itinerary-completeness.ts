// ============================================
// Is an itinerary fully priced?
// ============================================
// An itinerary's services are its own editable rows (itinerary_services), not
// a snapshot, so completeness is read from those rows: a service with no rate
// AND no cost is a gap. That is the app's standing rule — a blank rate is an
// unpriced hole, never a free service, and the rate forms refuse 0
// ([[unpriced-rates-model]]) — and it is what a quote's unpriced lines become
// when it converts (lib/itineraries/template-days). Included meals and free
// sites never convert into rows (lib/pricing/breakdown-order isBookableLine),
// so a zero row is always a gap. Filling in the cost on the itinerary clears it.
//
// Checked against production on 2026-09-16: no itinerary service row had a
// zero rate and cost, so no existing itinerary starts blocking.

import type { SupabaseClient } from '@supabase/supabase-js'
import { quoteCompleteness, type QuoteCompleteness } from './quote-completeness'

export interface ItineraryServiceRow {
  service_name?: string | null
  rate_eur?: number | string | null
  total_cost?: number | string | null
  notes?: string | null
}

export interface ItineraryDayRow {
  day_number?: number | null
  services?: ItineraryServiceRow[] | null
}

const NO_COST = 'No cost entered. Fill it in on the itinerary before sending.'

/** The itinerary's rows in the saved-line shape quoteCompleteness reads. */
export function itineraryServiceLines(days: readonly ItineraryDayRow[] | null | undefined) {
  const lines: Array<{ service_name: string; day_number: number | null; unpriced?: true; issue?: string }> = []
  for (const day of days ?? []) {
    for (const s of day.services ?? []) {
      const unpriced = (Number(s.rate_eur) || 0) === 0 && (Number(s.total_cost) || 0) === 0
      lines.push({
        service_name: String(s.service_name ?? 'Service'),
        day_number: day.day_number ?? null,
        ...(unpriced ? { unpriced: true as const, issue: s.notes?.trim() ? `${NO_COST} ${s.notes.trim()}` : NO_COST } : {}),
      })
    }
  }
  return lines
}

export function itineraryCompleteness(days: readonly ItineraryDayRow[] | null | undefined): QuoteCompleteness {
  return quoteCompleteness(itineraryServiceLines(days))
}

/**
 * The itinerary's lines, loaded from the database — never from a request
 * body, which a caller controls. Null when the itinerary is not in this org.
 */
export async function loadItineraryServiceLines(
  supabase: SupabaseClient,
  itineraryId: string,
  orgId: string | null,
) {
  if (!itineraryId || !orgId) return null
  const { data: owned } = await supabase
    .from('itineraries')
    .select('id')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!owned) return null
  const { data: days, error } = await supabase
    .from('itinerary_days')
    .select('day_number, services:itinerary_services(service_name, rate_eur, total_cost, notes)')
    .eq('itinerary_id', itineraryId)
  if (error) return null
  return itineraryServiceLines((days ?? []) as ItineraryDayRow[])
}
