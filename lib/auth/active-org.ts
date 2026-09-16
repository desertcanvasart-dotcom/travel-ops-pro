// The active workspace, as a pure rule — no request, no database.
//
// ONE IDENTITY, MANY WORKSPACES. organization_members is keyed (org_id,
// user_id), so one person can belong to several agencies, and their ROLE is
// per membership: admin in one, viewer in another. Every decision about "which
// workspace is this request in" and "what may this person do in it" has to
// start from the same membership, or the two drift apart — data scoped to the
// workspace the cookie names while the gate reads the role from a different
// one. That drift is a real privilege escalation: an admin in their first
// agency who is a viewer in a second could switch to the second and clear
// every admin-only gate there.
//
// So the rule lives here, once, and both lib/auth/current-org.ts (data scope)
// and middleware.ts (the role gate) call it with the same inputs.
//
// The cookie is a PREFERENCE, never a claim: it only selects among memberships
// the person already holds. An unrecognised or absent value falls back to the
// oldest membership, which is what every single-workspace user has always had.
export const ACTIVE_ORG_COOKIE = 'active_org_id'

/** A membership, as much of one as the rule needs. */
export interface OrderableMembership {
  org_id: string
  /** When the person joined. NOT unique: two memberships written in one
   *  transaction share it to the microsecond. */
  created_at?: string | null
}

/**
 * Oldest first, org_id breaking ties.
 *
 * The tie-break is the whole point. `created_at` is not unique, and an SQL
 * ORDER BY on a non-unique column alone may return equal rows in any order —
 * so middleware and getCurrentOrgId(), which issue SEPARATE queries, could
 * each take a different "first" membership. Middleware would then authorise
 * with one workspace's role while the route scoped its service-role reads and
 * writes to another: the same divergence pickActiveMembership exists to stop,
 * reached by a different road.
 */
export function byOldestMembership(a: OrderableMembership, b: OrderableMembership): number {
  const at = a.created_at ?? ''
  const bt = b.created_at ?? ''
  if (at !== bt) return at < bt ? -1 : 1
  return a.org_id < b.org_id ? -1 : a.org_id > b.org_id ? 1 : 0
}

/**
 * The membership a request acts under.
 *
 * @param memberships this person's memberships, in ANY order — the rule sorts
 *   them itself, so no caller can make two layers disagree by querying
 *   differently
 * @param requestedOrgId the active-org cookie, if any
 */
export function pickActiveMembership<T extends OrderableMembership>(
  memberships: readonly T[],
  requestedOrgId: string | null | undefined,
): T | null {
  if (requestedOrgId) {
    const chosen = memberships.find(m => m.org_id === requestedOrgId)
    if (chosen) return chosen
  }
  return [...memberships].sort(byOldestMembership)[0] ?? null
}
