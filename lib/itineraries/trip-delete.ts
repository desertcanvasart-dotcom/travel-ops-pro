// ============================================
// When a trip may be deleted — and what goes with it
// ============================================
// DELETE /api/itineraries/[id] refused only a trip with invoices. Everything
// else hangs off the trip with ON DELETE CASCADE — the booking (and through
// it the recorded customer payments, travellers and passport rows),
// payments, quotes, supplier vouchers, share links — so one click on the
// list's bin wiped a confirmed, booked and paid trip and its money. A trip
// that has been sold or has had money or paperwork move is cancelled instead
// (the Cancel trip dialog), never deleted. What remains deletable is a trip
// nobody has acted on: its days, services and translations go with it by
// cascade, and the PDFs this app stored for it (contracts and draft supplier
// documents sent by WhatsApp) are removed from storage first, so nothing is
// left behind with a customer's name on it.

import { safeKeySegment } from '@/lib/storage-key'
import { OUTBOUND_DOCS_BUCKET } from '@/lib/storage/outbound-documents'

export interface TripDeleteFacts {
  status: string | null
  booking: { booking_code: string | null } | null
  invoices: number
  /** Customer payments recorded against the trip or its booking. */
  payments: number
  /** Supplier documents that have left the building (not draft / cancelled). */
  sentSupplierDocuments: number
}

/** Why this trip may not be deleted — empty when it may. */
export function tripDeleteBlockers(f: TripDeleteFacts): string[] {
  const reasons: string[] = []
  if (f.booking) reasons.push(`it has a booking (${f.booking.booking_code ?? 'no code'})`)
  if (f.payments > 0) reasons.push(`${f.payments} payment(s) are recorded against it`)
  if (f.invoices > 0) reasons.push(`it has ${f.invoices} invoice(s)`)
  if (f.sentSupplierDocuments > 0) reasons.push(`${f.sentSupplierDocuments} supplier document(s) have been sent`)
  if (f.status === 'confirmed' || f.status === 'completed') reasons.push(`it is ${f.status}`)
  return reasons
}

export function tripDeleteRefusal(reasons: string[]): string {
  return `This trip cannot be deleted: ${reasons.join('; ')}. Cancel the trip instead (Cancel trip on the itinerary page) — that keeps its booking, payments and documents on record.`
}

// What a row in each table is, for a delete the database itself refused
// (23503). The message names the table: 'violates foreign key constraint
// "…" on table "invoices"'. Most links clear themselves since migration
// 20270112; whatever still blocks is named, not guessed at.
const BLOCKING_TABLE_LABELS: Record<string, string> = {
  invoices: 'an invoice',
  payments: 'a payment',
  bookings: 'a booking',
  tour_quotes: 'a quote',
  client_documents: 'a client document',
  client_followups: 'a client follow-up',
  communication_history: 'a logged message',
}

export function tripDeleteForeignKeyRefusal(error: { message?: string | null; details?: string | null }): string {
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  const table = text.match(/on table "([^"]+)"/g)?.map(m => m.slice(10, -1)).find(t => t !== 'itineraries')
  const what = table ? (BLOCKING_TABLE_LABELS[table] ?? `a record in ${table.replace(/_/g, ' ')}`) : 'another record'
  return `This trip cannot be deleted: ${what} still refers to it. Remove that first, or cancel the trip instead (Cancel trip on the itinerary page).`
}

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

const countOf = async (q: PromiseLike<{ count: number | null; error: { code?: string } | null }>): Promise<number> => {
  const { count, error } = await q
  // A table this deployment has not got cannot hold anything that blocks.
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return 0
    throw error
  }
  return count ?? 0
}

export async function loadTripDeleteFacts(db: DbClient, itineraryId: string, orgId: string, status: string | null): Promise<TripDeleteFacts> {
  const { data: booking } = await db
    .from('bookings')
    .select('id, booking_code')
    .eq('itinerary_id', itineraryId)
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle()
  const [invoices, payments, bookingPayments, sentSupplierDocuments] = await Promise.all([
    countOf(db.from('invoices').select('id', { count: 'exact', head: true }).eq('itinerary_id', itineraryId).eq('org_id', orgId)),
    countOf(db.from('payments').select('id', { count: 'exact', head: true }).eq('itinerary_id', itineraryId).eq('org_id', orgId)),
    booking
      ? countOf(db.from('booking_payments').select('id', { count: 'exact', head: true }).eq('booking_id', booking.id))
      : Promise.resolve(0),
    countOf(db.from('supplier_documents').select('id', { count: 'exact', head: true }).eq('itinerary_id', itineraryId).eq('org_id', orgId).not('status', 'in', '(draft,cancelled)')),
  ])
  return {
    status,
    booking: booking ? { booking_code: booking.booking_code ?? null } : null,
    invoices,
    payments: payments + bookingPayments,
    sentSupplierDocuments,
  }
}

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      list: (folder: string, opts: { search?: string; limit?: number }) => Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>
    }
  }
}

/** The storage keys this app writes for a trip (see app/api/whatsapp/send-contract and send-supplier-document). */
export function tripFilePrefixes(itineraryId: string, documentNumbers: string[]): Array<{ folder: string; search: string }> {
  return [
    { folder: 'contracts', search: `contract-${safeKeySegment(itineraryId, 'trip')}-` },
    ...documentNumbers.map(n => ({ folder: 'supplier-documents', search: `${safeKeySegment(n, 'document')}-` })),
  ]
}

/** Remove them. Returns an error message, or null. A missing bucket holds nothing. */
export async function removeTripFiles(db: StorageClient, itineraryId: string, documentNumbers: string[]): Promise<string | null> {
  const bucket = db.storage.from(OUTBOUND_DOCS_BUCKET)
  for (const { folder, search } of tripFilePrefixes(itineraryId, documentNumbers)) {
    const { data, error } = await bucket.list(folder, { search, limit: 1000 })
    if (error) {
      if (/not.?found/i.test(error.message)) continue
      return error.message
    }
    // `search` is a substring match: keep only the keys that START with the prefix.
    const paths = (data ?? []).filter(f => f.name.startsWith(search)).map(f => `${folder}/${f.name}`)
    for (let i = 0; i < paths.length; i += 100) {
      const { error: removeError } = await bucket.remove(paths.slice(i, i + 100))
      if (removeError) return removeError.message
    }
  }
  return null
}
