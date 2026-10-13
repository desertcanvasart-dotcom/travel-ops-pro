// ============================================
// Which Hotel Assistants row prices a check-in / check-out
// ============================================
// The engine took the FIRST active row of the service type at the quote's
// category or "All" — whichever the unordered select returned. Two things
// the form lets the operator enter were never read:
//
//   - Rate Destination. "Check-in Assist / Standard / Aswan = 30" and
//     "… / Cairo = 15" both matched a Cairo check-in, and either could win.
//   - The Deluxe category. Deluxe quotes were mapped to Standard, so a row
//     filed under Deluxe was never priced.
//
// The order now, deterministic:
//   1. destination: the day's city exactly (case-insensitive), then a row
//      for all destinations (blank). A row for ANOTHER city never prices.
//   2. category: the quote's own (deluxe → Deluxe, then Standard), then All.
//   3. oldest row first (created_at, then id) — a stable tiebreak.
//
// Concierge rows are not looked up here: no itinerary event is a concierge
// event. They are offered in the Pricing Grid for manual picks.

type Row = Record<string, unknown>

/** The hotel categories a quote's preset tier reads, best first. */
export function hotelServiceCategories(preset: string): string[] {
  if (preset === 'budget') return ['budget']
  if (preset === 'luxury') return ['luxury']
  // A deluxe quote takes a Deluxe row when one exists; Standard has always
  // covered it, so it still does when none does.
  if (preset === 'deluxe') return ['deluxe', 'standard']
  return ['standard']
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** The row that prices `serviceType` in `city`, or undefined. */
export function pickHotelServiceRow<T extends Row>(
  rows: readonly T[],
  serviceType: string,
  categories: readonly string[],
  city: string | null | undefined
): T | undefined {
  const day = norm(city)
  const cats = [...categories, 'all']
  const ranked = rows
    .filter(r => r.service_type === serviceType)
    .map(r => {
      const dest = norm(r.destination)
      const destRank = dest === '' ? 1 : dest === day && day !== '' ? 0 : -1
      const catRank = cats.indexOf(String(r.hotel_category ?? ''))
      return { r, destRank, catRank }
    })
    .filter(x => x.destRank >= 0 && x.catRank >= 0)
    .sort((a, b) =>
      a.destRank - b.destRank
      || a.catRank - b.catRank
      || String(a.r.created_at ?? '').localeCompare(String(b.r.created_at ?? ''))
      || String(a.r.id ?? '').localeCompare(String(b.r.id ?? '')))
  return ranked[0]?.r
}
