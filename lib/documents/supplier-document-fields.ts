// ============================================
// Supplier documents: what a request may write, and when one may be deleted
// ============================================
// PUT /api/supplier-documents/[id] kept a whitelist of columns; POST inserted
// the request body as it came, so a caller could create a voucher already
// 'confirmed' (with confirmed_by, sent_at, payment_status, completed_at, even
// its id) that nobody had sent. PUT took any string as the status, and a
// status no screen knows showed as "Draft". Both routes now read the body
// through these lists.

/** The statuses a supplier document moves through (the list page's order). */
export const SUPPLIER_DOCUMENT_STATUSES = ['draft', 'sent', 'confirmed', 'completed', 'cancelled'] as const
export type SupplierDocumentStatus = (typeof SUPPLIER_DOCUMENT_STATUSES)[number]

export function isSupplierDocumentStatus(value: unknown): value is SupplierDocumentStatus {
  return typeof value === 'string' && (SUPPLIER_DOCUMENT_STATUSES as readonly string[]).includes(value)
}

/** What a voucher's content is: supplier, guests, dates, lines, money, notes. */
const CONTENT_FIELDS = [
  'supplier_id', 'document_type', 'document_number',
  'supplier_name', 'supplier_contact_name', 'supplier_contact_email',
  'supplier_contact_phone', 'supplier_address', 'supplier_whatsapp',
  'client_name', 'client_nationality', 'num_adults', 'num_children',
  'services', 'selected_attractions', 'selected_routes', 'selected_meals', 'selected_guides',
  'city', 'service_date', 'check_in', 'check_out',
  'pickup_time', 'pickup_location', 'dropoff_location',
  'vehicle_type', 'driver_name',
  'currency', 'total_cost', 'payment_terms',
  'special_requests', 'internal_notes',
] as const

/** PUT: the content, and the status with its timestamps. Not itinerary_id or
 *  org_id — a voucher stays on its trip, and its org comes from that trip
 *  (migrations/20261113_supplier_documents_org.sql). */
export const SUPPLIER_DOCUMENT_UPDATE_FIELDS: readonly string[] = [
  ...CONTENT_FIELDS,
  'status', 'sent_at', 'confirmed_at', 'completed_at', 'sent_via',
]

/** POST: the content and the trip it goes on. A new document is always a
 *  draft: sending and confirming are what make it anything else. */
export const SUPPLIER_DOCUMENT_CREATE_FIELDS: readonly string[] = [...CONTENT_FIELDS, 'itinerary_id']

/** Only the listed keys of a request body. */
export function pickFields(body: unknown, fields: readonly string[]): Record<string, unknown> {
  const src = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const f of fields) if (f in src) out[f] = src[f]
  return out
}

/**
 * Why a document may not be deleted, or null when it may. A voucher that has
 * gone to the supplier (sent, confirmed, completed — or sent once and put back
 * to draft) is what the supplier holds: deleting it would leave them holding a
 * booking we no longer have any record of. Cancel it instead; a cancelled
 * document, or a draft that never went out, can be deleted.
 */
export function deleteBlockReason(doc: { status?: string | null; sent_at?: string | null }): string | null {
  const status = doc.status ?? 'draft'
  if (status === 'cancelled') return null
  if (status === 'draft' && !doc.sent_at) return null
  return status === 'draft'
    ? 'This document was already sent to the supplier. Set its status to Cancelled (Edit), then delete it.'
    : `This document is ${status}: the supplier has it. Set its status to Cancelled (Edit), then delete it.`
}
