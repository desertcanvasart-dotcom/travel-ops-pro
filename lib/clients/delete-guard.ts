// What stops a client from being deleted.
//
// Deleting used to be allowed with a "force" option that removed the client's
// trips one table at a time (half-destroying a trip when an invoice linked to
// it by another client id stopped the last step), erased payments recorded
// against a trip (payments.itinerary_id cascades), and removed conversations
// without saying so. There is no force path now: a client with anything
// attached is refused, with the counts, and "Mark inactive" is offered instead.
import type { SupabaseClient } from '@supabase/supabase-js'
import { listClientTrips } from './trips'

export interface ClientAttachments {
  trips: number
  bookings: number
  invoices: number
  payments: number
  conversations: number
  documents: number
}

const LABELS: Array<[keyof ClientAttachments, string, string]> = [
  ['trips', 'trip', 'trips'],
  ['bookings', 'booking', 'bookings'],
  ['invoices', 'invoice', 'invoices'],
  ['payments', 'payment', 'payments'],
  ['conversations', 'conversation', 'conversations'],
  ['documents', 'document', 'documents'],
]

export function isDeletable(counts: ClientAttachments): boolean {
  return LABELS.every(([key]) => counts[key] === 0)
}

/** "2 trips, 1 booking and 3 invoices", for the refusal message. */
export function describeAttachments(counts: ClientAttachments): string {
  const parts = LABELS
    .filter(([key]) => counts[key] > 0)
    .map(([key, one, many]) => `${counts[key]} ${counts[key] === 1 ? one : many}`)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function refusalMessage(counts: ClientAttachments): string {
  return `This client cannot be deleted: it has ${describeAttachments(counts)}. Mark the client inactive instead.`
}

// A count that failed is not zero: reading it as zero would let a delete through
// on the strength of a query that never ran.
const countOf = (r: { count: number | null; error: unknown }) => {
  if (r.error) throw r.error
  return r.count ?? 0
}

/** Every row attached to a client of this company that deleting it would orphan or erase. */
export async function countClientAttachments(
  db: SupabaseClient,
  orgId: string,
  clientId: string,
  email: string | null | undefined,
): Promise<ClientAttachments> {
  // The trips the Bookings tab shows: linked by client, or by the same email.
  const { data: trips, error: tripsError } = await listClientTrips(db, orgId, clientId, email)
  if (tripsError) throw tripsError
  const tripIds = trips.map(t => t.id)

  const head = { count: 'exact' as const, head: true }
  const [bookings, invoices, payments, whatsapp, mail, documents] = await Promise.all([
    tripIds.length
      ? db.from('bookings').select('id', head).eq('org_id', orgId).in('itinerary_id', tripIds)
      : Promise.resolve({ count: 0, error: null }),
    db.from('invoices').select('id', head).eq('org_id', orgId).eq('client_id', clientId),
    tripIds.length
      ? db.from('payments').select('id', head).eq('org_id', orgId).in('itinerary_id', tripIds)
      : Promise.resolve({ count: 0, error: null }),
    db.from('whatsapp_conversations').select('id', head).eq('org_id', orgId).eq('client_id', clientId),
    db.from('email_conversations').select('id', head).eq('org_id', orgId).eq('client_id', clientId),
    // client_documents has no org_id: it hangs off the client, already verified.
    db.from('client_documents').select('id', head).eq('client_id', clientId),
  ])

  return {
    trips: trips.length,
    bookings: countOf(bookings),
    invoices: countOf(invoices),
    payments: countOf(payments),
    conversations: countOf(whatsapp) + countOf(mail),
    documents: countOf(documents),
  }
}
