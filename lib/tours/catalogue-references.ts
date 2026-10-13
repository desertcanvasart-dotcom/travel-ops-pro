// ============================================
// What still uses this programme?
// ============================================
// A template (or one of its variations) is catalogue. Quotes, departures,
// trips and partner prices are sales records that point INTO the catalogue,
// and the foreign keys do not protect them: deleting a variation cascades
// b2b_partner_pricing away and sets tour_departures / itineraries links to
// NULL, and the template delete used to delete the company's tour_quotes
// outright, whatever their status. So a catalogue delete now asks here first
// and is refused (409) while anything at all refers to it — the office
// deactivates the programme instead. No sales record is ever deleted by a
// catalogue delete.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface CatalogueReferences {
  /** tour_quotes on these variations — any status. */
  quotes: number
  /** tour_departures of this template or these variations — any status. */
  departures: number
  /** itineraries (trips) built from this template. */
  itineraries: number
  /** b2b_partner_pricing rows for these variations. */
  partner_prices: number
  /** departure_bookings (seat holds) on those departures, not cancelled. */
  holds: number
}

export const NO_REFERENCES: CatalogueReferences = { quotes: 0, departures: 0, itineraries: 0, partner_prices: 0, holds: 0 }

export function referenceTotal(r: CatalogueReferences): number {
  return r.quotes + r.departures + r.itineraries + r.partner_prices + r.holds
}

const WORDS: Array<[keyof CatalogueReferences, string, string]> = [
  ['quotes', 'quote', 'quotes'],
  ['departures', 'departure', 'departures'],
  ['itineraries', 'trip', 'trips'],
  ['partner_prices', 'partner price', 'partner prices'],
  ['holds', 'seat hold', 'seat holds'],
]

/** "used by 3 quotes, 2 departures" — the kinds that are not zero. */
export function describeReferences(r: CatalogueReferences): string {
  return WORDS
    .filter(([k]) => r[k] > 0)
    .map(([k, one, many]) => `${r[k]} ${r[k] === 1 ? one : many}`)
    .join(', ')
}

/** The 409 message the delete dialog shows. */
export function refusalMessage(what: 'template' | 'variation', name: string | null, r: CatalogueReferences): string {
  const label = name ? `"${name}"` : `This ${what}`
  return `${label} is used by ${describeReferences(r)}, so it cannot be deleted. Deactivate it instead: it leaves the catalogue and pickers, and those records keep it.`
}

const countOf = (res: { count?: number | null; data?: unknown[] | null }) =>
  typeof res.count === 'number' ? res.count : (res.data?.length ?? 0)

/**
 * Count what refers to a template (templateId + all its variationIds) or to
 * single variations (templateId null). The caller's company's rows only —
 * the template / variations were checked to be the caller's first. A failed
 * read is returned as `error`: the delete must not go ahead on a guess.
 */
export async function countCatalogueReferences(
  db: Db,
  orgId: string,
  target: { templateId: string | null; variationIds: string[] }
): Promise<{ counts: CatalogueReferences; error: { message?: string } | null }> {
  const counts = { ...NO_REFERENCES }
  const { templateId, variationIds } = target
  const head = { count: 'exact' as const, head: true }

  if (variationIds.length > 0) {
    const quotes = await db.from('tour_quotes').select('id', head).eq('org_id', orgId).in('variation_id', variationIds)
    if (quotes.error) return { counts, error: quotes.error }
    counts.quotes = countOf(quotes)

    // b2b_partner_pricing carries no org_id: its variation is ours (checked).
    const prices = await db.from('b2b_partner_pricing').select('id', head).in('variation_id', variationIds)
    if (prices.error) return { counts, error: prices.error }
    counts.partner_prices = countOf(prices)
  }

  const clauses = [
    ...(templateId ? [`template_id.eq.${templateId}`] : []),
    ...(variationIds.length > 0 ? [`variation_id.in.(${variationIds.join(',')})`] : []),
  ]
  if (clauses.length > 0) {
    const deps = await db.from('tour_departures').select('id').eq('org_id', orgId).or(clauses.join(','))
    if (deps.error) return { counts, error: deps.error }
    const depIds = ((deps.data ?? []) as Array<{ id: string }>).map(d => d.id)
    counts.departures = depIds.length
    if (depIds.length > 0) {
      const holds = await db.from('departure_bookings').select('id', head)
        .eq('org_id', orgId).in('departure_id', depIds).neq('status', 'cancelled')
      if (holds.error) return { counts, error: holds.error }
      counts.holds = countOf(holds)
    }
  }

  if (templateId) {
    const trips = await db.from('itineraries').select('id', head).eq('org_id', orgId).eq('template_id', templateId)
    if (trips.error) return { counts, error: trips.error }
    counts.itineraries = countOf(trips)
  }

  return { counts, error: null }
}
