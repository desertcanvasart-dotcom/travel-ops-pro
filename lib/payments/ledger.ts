// ============================================
// One ledger per trip: once it has an invoice, money goes against the invoice
// ============================================
// Money from a client can be recorded in two places: against the TRIP
// (payments, New Payment › Itinerary) or against an INVOICE
// (invoice_payments). Nothing linked the two, so a deposit entered on the trip
// and again on the invoice was counted twice by the Payments and Receipts
// totals.
//
// The rule, for every screen and route:
//
//   * A trip that has a non-cancelled invoice takes its money on the invoice.
//     POST /api/payments for such a trip is refused, and New Payment steers the
//     user to the invoice.
//   * Trips that already have BOTH (recorded before this rule) are not
//     counted twice: totals count the invoice payments and skip the trip
//     payments of a trip that has a non-cancelled invoice. The skipped rows
//     stay visible (and can be deleted) — they are just not added again.
//
// A cancelled invoice does not count: the trip is back to taking its payments
// itself until a new invoice is raised.

export interface TripInvoiceLike {
  itinerary_id?: string | null
  status?: string | null
  invoice_number?: string | null
}

/** The trip ids that have a non-cancelled invoice. */
export function invoicedTripIds(invoices: TripInvoiceLike[]): Set<string> {
  const ids = new Set<string>()
  for (const inv of invoices) {
    if (inv.itinerary_id && inv.status !== 'cancelled') ids.add(String(inv.itinerary_id))
  }
  return ids
}

/** Is this trip payment on a trip whose money is recorded on its invoice? */
export function isOnInvoicedTrip(payment: { itinerary_id?: string | null }, invoiced: Set<string>): boolean {
  return !!payment.itinerary_id && invoiced.has(String(payment.itinerary_id))
}

/** The trip payments that count towards totals: those of trips without a live invoice. */
export function countableTripPayments<T extends { itinerary_id?: string | null }>(payments: T[], invoices: TripInvoiceLike[]): T[] {
  const invoiced = invoicedTripIds(invoices)
  return payments.filter(p => !isOnInvoicedTrip(p, invoiced))
}

/** The refusal for a payment recorded on the trip when it has an invoice. */
export function tripHasInvoiceMessage(invoiceNumbers: Array<string | null | undefined>): string {
  const numbers = invoiceNumbers.filter(Boolean).join(', ')
  return (
    `This trip already has an invoice${numbers ? ` (${numbers})` : ''}. Record the payment against the invoice ` +
    '(Invoices › open the invoice › Record Payment) so the same money is not counted twice. ' +
    'An invoice that has not been sent yet must be marked as sent first.'
  )
}

/**
 * The invoices that make a trip take its money on the invoice (lib/payments/
 * ledger): non-cancelled ones of this company. Empty when the trip has none.
 */
export async function liveInvoicesOfTrip(
  supabase: { from: (table: string) => any },
  orgId: string,
  itineraryId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('invoices')
    .select('invoice_number, status')
    .eq('org_id', orgId)
    .eq('itinerary_id', itineraryId)
    .neq('status', 'cancelled')
  return ((data ?? []) as Array<{ invoice_number: string | null }>).map(i => i.invoice_number || 'invoice')
}
