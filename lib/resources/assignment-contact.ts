// ============================================
// Who an assignment goes to, and their number
// ============================================
// "Send via my WhatsApp" opens the office's own WhatsApp (wa.me) with the
// assignment typed in. Meta lets the agency's API number start a chat only
// with an approved template, so the automatic notice can fail for someone
// who has not written recently; the office's own phone has no such rule.
// Ported from autoura-saas (#578).
//
// The number comes from the assigned person's row in the picker's list —
// WhatsApp first — or, for a vehicle or a restaurant, from its supplier; for
// someone typed in for one trip, from the name it was saved with. Pure.

import { readOutside } from './outside-staff'

/** The assignment types that are a person (or a supplier's person) to message. */
export const MESSAGEABLE_TYPES = new Set(['guide', 'vehicle', 'restaurant', 'airport_staff', 'hotel_staff'])

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function assignmentContact(
  assignment: { resource_type: string; resource_id: string; resource_name?: string | null },
  listed: readonly Record<string, any>[],
): { name: string; phone: string } | null {
  if (!MESSAGEABLE_TYPES.has(assignment.resource_type)) return null
  const outside = readOutside(assignment.resource_name)
  if (outside) return outside.phone ? { name: outside.name, phone: outside.phone } : null

  // Restaurants are listed once per place (one-per-place.ts), so an
  // assignment may hold another of that place's rows: match the saved name.
  const saved = (assignment.resource_name ?? '').toLowerCase()
  const row = listed.find(r => r.id === assignment.resource_id)
    ?? (assignment.resource_type === 'restaurant'
      ? listed.find(r => { const n = str(r.name)?.toLowerCase(); return !!n && saved.startsWith(n) })
      : undefined)
  if (!row) return null
  const supplier = (row.supplier ?? {}) as Record<string, unknown>
  const viaSupplier = assignment.resource_type === 'vehicle' || assignment.resource_type === 'restaurant'
  const phone = viaSupplier
    ? str(supplier.whatsapp) ?? str(supplier.contact_phone) ?? str(supplier.phone2) ?? str(row.whatsapp) ?? str(row.phone)
    : str(row.whatsapp) ?? str(row.phone) ?? str(row.contact_phone) ?? str(row.phone2)
  if (!phone) return null
  const name = viaSupplier
    ? str(supplier.name) ?? str(row.supplier_name) ?? str(row.name)
    : str(row.name)
  return { name: name ?? str(assignment.resource_name) ?? '', phone }
}
