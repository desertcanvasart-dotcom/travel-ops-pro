// ============================================
// STAFF TAP-LINK — the no-login boundary
// ============================================
// A staff link is a credential-in-a-URL for one assignment: the driver or
// guide opens it, sees their trip, and taps checkpoints. Everything that
// crosses to that page goes through toStaffView below — the same allowlist
// discipline as the customer portal/share pages, because "staff" here means
// "anyone holding the link".
//
// What staff DO see: the trip's name and dates, their own assignment window,
// their own name, and the checkpoints already logged for their assignment.
// What staff do NOT see: prices, costs, internal notes, customer contact
// details, other assignments, or anything else on the itinerary.
//
// Ported from the sibling SaaS (lib/staff-link.ts); org-scoped, and the
// contact/actor resolvers query defensively so they never error on a schema
// difference between the two apps.

import { generateShareToken, isValidShareToken } from '@/lib/itinerary-share'

export const generateStaffToken = generateShareToken
export const isValidStaffToken = isValidShareToken

/** Trim a value to a non-empty string, or null. */
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

/** The kinds a tap-link can log. 'note' is office-internal and excluded. */
export const STAFF_EVENT_KINDS = [
  'departed', 'en_route', 'arrived', 'picked_up', 'dropped_off',
  'checked_in', 'checked_out', 'completed', 'delayed',
] as const
export type StaffEventKind = (typeof STAFF_EVENT_KINDS)[number]

export interface StaffView {
  operatorName: string
  tripTitle: string
  tripStart: string | null
  tripEnd: string | null
  memberName: string
  assignmentStart: string | null
  assignmentEnd: string | null
  events: Array<{ kind: StaffEventKind; occurredAt: string }>
}

export function toStaffView(
  org: Record<string, unknown>,
  itinerary: Record<string, unknown>,
  resource: Record<string, unknown>,
  events: Array<Record<string, unknown>>
): StaffView {
  const out: StaffView = {
    operatorName: str(org.name) ?? str(org.company_name) ?? 'Your agency',
    tripTitle: str(itinerary.trip_name) ?? 'Trip',
    tripStart: str(itinerary.start_date),
    tripEnd: str(itinerary.end_date),
    memberName: str(resource.resource_name) ?? 'Team member',
    assignmentStart: str(resource.start_date),
    assignmentEnd: str(resource.end_date),
    events: [],
  }
  for (const e of events ?? []) {
    const kind = STAFF_EVENT_KINDS.includes(e.event_kind as StaffEventKind)
      ? (e.event_kind as StaffEventKind)
      : null
    const occurredAt = str(e.occurred_at)
    if (!kind || !occurredAt) continue
    out.events.push({ kind, occurredAt })
  }
  out.events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return out
}

// ============================================
// ASSIGNEE CONTACT — who holds this link's phone
// ============================================
// The office hands a tap-link to a person; the natural rail is their own
// WhatsApp (wa.me deep link — the OFFICE's phone sends, never our API, so
// there is no template approval and no auto-send risk). Best-effort: a null
// phone just means "copy the link yourself". Selects '*' and reads by presence
// so a column that only exists in one app can never 400 the whole request.

type ContactClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }
    }
  }
}

function phoneOf(row: Record<string, unknown> | null): string | null {
  if (!row) return null
  return str(row.whatsapp) ?? str(row.phone) ?? str(row.contact_phone) ?? str(row.default_driver_phone)
}

export async function resolveAssigneeContact(
  supabase: ContactClient,
  resource: { resource_type?: string | null; resource_id?: string | null; resource_name?: string | null }
): Promise<{ name: string | null; phone: string | null } | null> {
  try {
    const type = resource?.resource_type
    const rid = resource?.resource_id
    if (!type || !rid) return null
    const fallbackName = str(resource.resource_name)

    // Person-types only — a hotel or restaurant is a venue, not a link-holder.
    const tableFor: Record<string, string | undefined> = {
      driver: 'team_members',
      guide: 'suppliers',          // guides are suppliers (supplier_type='guide') here
      vehicle: 'vehicles',
      airport_staff: 'airport_staff',
      hotel_staff: 'hotel_staff',
    }
    const table = tableFor[type]
    if (!table) return null

    const { data } = await supabase.from(table).select('*').eq('id', rid).maybeSingle()
    if (!data) return null
    return { name: str(data.name) ?? str(data.default_driver_name) ?? fallbackName, phone: phoneOf(data) }
  } catch {
    return null
  }
}
