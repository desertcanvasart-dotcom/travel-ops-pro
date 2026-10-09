// ============================================
// Facts a travel contract states about its trip
// ============================================
// Shared by the contract page (app/documents/contract/[id]) and the WhatsApp
// send (app/api/whatsapp/send-contract), which disagreed: the send printed
// "Cairo, Luxor, Aswan" for every trip, "Egypt Tour" for an unnamed one and a
// 2025 contract number forever, and both crashed on a trip with no price.

/** Destinations as one line, whatever shape the column holds. */
export function describeDestinations(d: string | string[] | null | undefined): string {
  if (Array.isArray(d)) return d.filter(Boolean).join(', ')
  return (d ?? '').toString().trim()
}

/** TC-<year>-<trip code>, the number the contract page shows. */
export function contractNumberFor(itin: { id: string; itinerary_code?: string | null }, now = new Date()): string {
  return `TC-${now.getFullYear()}-${itin.itinerary_code || itin.id.slice(0, 8).toUpperCase()}`
}

/** "To be confirmed" for a trip with no price — never a crash, "NaN" or 0.00. */
export function contractPrice(total: number | null | undefined, currency: string | null | undefined): string {
  if (typeof total !== 'number' || !Number.isFinite(total)) return 'To be confirmed'
  return `${currency ? `${currency} ` : ''}${total.toLocaleString()}`
}

/** Per person, or null when there is no price or nobody to divide by. */
export function contractPricePerPerson(total: number | null | undefined, travellers: number): number | null {
  if (typeof total !== 'number' || !Number.isFinite(total) || !(travellers > 0)) return null
  return total / travellers
}
