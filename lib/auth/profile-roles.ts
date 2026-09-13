// ============================================
// The members list shows the ROLE THAT GATES, not the mirror
// ============================================
// user_profiles.role is a display mirror of organization_members.role, the
// one authority (lib/auth/roles.ts). The Users page listed profiles and put
// the mirror in its role dropdown — so when the two disagreed, the operator
// saw "Manager", picked "Manager", and nothing happened: a <select> whose
// value already matches fires no change. The membership stayed at the
// viewer the person was invited as, and every gate treated them as one,
// while the screen that exists to fix that insisted they were a manager.
//
// So the list stitches the membership role over the mirror. The mirror only
// stands in for a profile with no membership in this organisation (an
// account that has not accepted an invitation yet, or a stranded one).

import type { OrgRole } from './roles'

export interface ProfileRow {
  id: string
  role?: string | null
  [key: string]: unknown
}

export interface MembershipRow {
  user_id: string
  role: string
}

export interface ListedProfile extends ProfileRow {
  /** The role every gate reads — the membership's, or null without one. */
  membership_role: OrgRole | null
}

/** Replace each profile's `role` with its membership role for this
 *  organisation; keep the mirror only where there is no membership. */
export function withMembershipRoles<T extends ProfileRow>(
  profiles: readonly T[],
  memberships: readonly MembershipRow[]
): Array<T & ListedProfile> {
  const byUser = new Map<string, string>()
  for (const m of memberships) {
    // The middleware resolves a user's role from their EARLIEST membership;
    // the first row wins here too, so callers must order by created_at.
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, m.role)
  }
  return profiles.map(p => {
    const membership = byUser.get(p.id) ?? null
    return {
      ...p,
      role: membership ?? p.role ?? null,
      membership_role: (membership as OrgRole | null) ?? null,
    }
  })
}
