// ============================================
// Team members (the Team page): roles, duplicates, login link, deactivation
// ============================================
// The Team page (/api/team-members) and WhatsApp Manage Agents write the same
// table. These helpers keep the Team page's writes to the same rules the
// agents screen already had: one person per email in a company, a login only
// of the same company, and one meaning for "deactivate".

import { orgLoginForEmail } from '@/lib/whatsapp-org'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/**
 * The job labels the Team page offers. Labels only — not access levels.
 *
 * No 'owner': the company's owner is a LOGIN role (organization_members), set
 * by transferring ownership. As a label any admin or manager could pick it, so
 * the roster could name someone owner who is not. The Team
 * page shows each person's real login role beside the label instead.
 */
export const TEAM_ROLES = ['manager', 'coordinator', 'sales', 'guide', 'driver', 'staff'] as const

export function isTeamRole(value: unknown): value is (typeof TEAM_ROLES)[number] {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value)
}

export const INVALID_TEAM_ROLE = `Role must be one of: ${TEAM_ROLES.join(', ')}`
export const DUPLICATE_TEAM_EMAIL = 'A team member with this email already exists'

/** Trimmed email, or null when blank / not a string. */
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v || null
}

/**
 * The row (other than `excludeId`) that already uses this email, compared
 * case-insensitively. Compared here rather than with ilike: "_" in an address
 * is an ilike wildcard.
 */
export function findDuplicateEmail<R extends { id: string; email: string | null }>(
  rows: readonly R[],
  email: string,
  excludeId?: string | null,
): R | null {
  const wanted = email.trim().toLowerCase()
  if (!wanted) return null
  return rows.find(r => r.id !== excludeId && (r.email ?? '').trim().toLowerCase() === wanted) ?? null
}

/** Does another team member of this company already have this email? */
export async function emailTakenInOrg(
  db: Db,
  orgId: string,
  email: string,
  excludeId?: string | null,
): Promise<boolean> {
  const { data, error } = await db.from('team_members').select('id, email').eq('org_id', orgId).not('email', 'is', null)
  if (error) throw error
  return !!findDuplicateEmail((data ?? []) as { id: string; email: string | null }[], email, excludeId)
}

/**
 * The login to link a member with this email to: a login that is a member of
 * THIS company (never another company's), is the only one with that address,
 * and is not already another member's login (team_members_org_user_key).
 */
export async function loginToLink(
  db: Db,
  orgId: string,
  email: string | null,
  excludeMemberId?: string | null,
): Promise<string | null> {
  if (!email) return null
  const userId = await orgLoginForEmail(db, orgId, email)
  if (!userId) return null
  const { data } = await db.from('team_members').select('id').eq('org_id', orgId).eq('user_id', userId).limit(1).maybeSingle()
  if (data && data.id !== excludeMemberId) return null
  return userId
}

/**
 * Deactivate a member the way WhatsApp Manage Agents does: not active, not
 * available, and none of the company's WhatsApp or email conversations stay
 * assigned to them. Trips and tasks keep the name. null when the member is not
 * this company's.
 */
export async function deactivateTeamMember(db: Db, orgId: string, id: string): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from('team_members')
    .update({ is_active: false, is_available: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id')
  if (error) throw error
  if (!data?.length) return null

  const wa = await db
    .from('whatsapp_conversations')
    .update({ assigned_team_member_id: null, assigned_agent_id: null, assigned_at: null })
    .eq('assigned_team_member_id', id)
    .eq('org_id', orgId)
  if (wa.error) throw wa.error
  const mail = await db
    .from('email_conversations')
    .update({ assigned_team_member_id: null, assigned_at: null })
    .eq('assigned_team_member_id', id)
    .eq('org_id', orgId)
  if (mail.error) throw mail.error
  return data[0]
}
