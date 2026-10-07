// ============================================
// Is this email address the agency's own?
// ============================================
// A client's email must never be the office's. In autoura-saas a client's
// itinerary carried the admin's own address (ITN-S-2026-8987): filled from
// the From of a message the office itself sent, and saved by the Pricing
// Grid as the client's. This app's grid save had the same gap.
//
// The office's addresses: the office rule (lib/email/office-addresses — the
// connected mailboxes, Settings → Email → Office addresses, and the mailbox's
// own domain unless a public one), plus every team member's and every member
// of the organisation's own login email. Ported from autoura-saas (#611).

import { bareAddress, isOfficeAddress, type OfficeRule } from './office-addresses'
import { loadOfficeRule } from './office-addresses-server'

export interface OwnAddresses {
  rule: OfficeRule
  /** Team members' and logins' own addresses. */
  people: readonly string[]
}

export function isOwnAddress(own: OwnAddresses, value: string | null | undefined): boolean {
  const a = bareAddress(value)
  if (!a.includes('@')) return false
  if (own.people.some(p => bareAddress(p) === a)) return true
  return isOfficeAddress(own.rule, a)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any }

/** The office's addresses for an organisation. A read that fails adds nothing. */
export async function loadOwnAddresses(db: Db, orgId: string | null): Promise<OwnAddresses> {
  const [rule, team, members] = await Promise.all([
    loadOfficeRule(db),
    db.from('team_members').select('email'),
    orgId ? db.from('organization_members').select('user_id').eq('org_id', orgId) : Promise.resolve({ data: [] }),
  ])
  const ids = ((members?.data ?? []) as { user_id: string | null }[]).map(m => m.user_id).filter(Boolean) as string[]
  const profiles = ids.length > 0 ? await db.from('user_profiles').select('email').in('id', ids) : { data: [] }
  const people = [
    ...((team?.data ?? []) as { email: string | null }[]).map(m => m.email ?? ''),
    ...((profiles?.data ?? []) as { email: string | null }[]).map(p => p.email ?? ''),
  ].filter(Boolean)
  return { rule, people }
}
