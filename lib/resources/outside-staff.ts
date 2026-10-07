// ============================================
// Outside staff: a person hired for one trip
// ============================================
// Guides, airport staff and hotel staff are often hired case by case —
// someone who is not in the directory. They can be typed in on the
// assignment for this trip only: nothing is added to the directory, the
// assignment gets a fresh resource_id (itinerary_resources.resource_id has no
// foreign key), and the name carries the phone — "Ahmed Hassan · +20 100
// 000 0000 (outside)" — so it is on the trip for whoever reads it, and can be
// read back to reach them. Ported from autoura-saas (#578). Pure.

/** The assignment types a person can be typed in for. */
export const OUTSIDE_TYPES = new Set(['guide', 'airport_staff', 'hotel_staff'])

const MARK = ' (outside)'
const SEP = ' · '

/** The resource_name stored for a typed-in person. */
export function outsideResourceName(name: string, phone?: string | null): string {
  const n = name.trim()
  const p = (phone ?? '').trim()
  return `${n}${p ? `${SEP}${p}` : ''}${MARK}`
}

/** A typed-in person read back from their resource_name; null for anyone
 *  picked from the directory. */
export function readOutside(resourceName: string | null | undefined): { name: string; phone: string | null } | null {
  const s = String(resourceName ?? '')
  if (!s.endsWith(MARK)) return null
  const body = s.slice(0, -MARK.length)
  const at = body.lastIndexOf(SEP)
  if (at < 0) return { name: body.trim(), phone: null }
  const phone = body.slice(at + SEP.length).trim()
  // Only digits, spaces and phone punctuation count as a number.
  if (!/^\+?[\d\s().-]{5,}$/.test(phone)) return { name: body.trim(), phone: null }
  return { name: body.slice(0, at).trim(), phone }
}

/** The assignment as the office sends it from its own WhatsApp (wa.me):
 *  to a typed-in person, or anyone in the directory (assignment-contact.ts). */
export function assignmentMessage(a: {
  name: string
  tripName?: string | null
  clientName?: string | null
  startDate: string
  endDate?: string | null
  travelers?: number | null
  notes?: string | null
}): string {
  const first = a.name.split(/\s+/)[0] || a.name
  const dates = a.endDate && a.endDate.slice(0, 10) !== a.startDate.slice(0, 10)
    ? `${a.startDate.slice(0, 10)} – ${a.endDate.slice(0, 10)}`
    : a.startDate.slice(0, 10)
  return [
    `Hello ${first},`,
    '',
    `You are booked${a.tripName ? ` for "${a.tripName}"` : ''}:`,
    `Dates: ${dates}`,
    a.clientName ? `Client: ${a.clientName}` : null,
    a.travelers ? `Guests: ${a.travelers}` : null,
    a.notes ? `Notes: ${a.notes}` : null,
    '',
    'Please confirm. Thank you!',
  ].filter(l => l !== null).join('\n')
}
