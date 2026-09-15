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

/**
 * The membership a request acts under.
 *
 * @param memberships this person's memberships, OLDEST FIRST
 * @param requestedOrgId the active-org cookie, if any
 */
export function pickActiveMembership<T extends { org_id: string }>(
  memberships: readonly T[],
  requestedOrgId: string | null | undefined,
): T | null {
  if (requestedOrgId) {
    const chosen = memberships.find(m => m.org_id === requestedOrgId)
    if (chosen) return chosen
  }
  return memberships[0] ?? null
}
