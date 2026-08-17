// ============================================
// ONE role system — organization_members
// ============================================
// A role is a relationship between a user and an organisation, not a property
// of the person. This app agreed with that everywhere except authorization:
// RLS and every data query hang off membership, while the middleware and the
// route gates read a GLOBAL user_profiles.role. Two systems, and they had
// already drifted — production had every member as membership-'owner' (a
// backfill artefact plus an invite bug), so the profile table was doing all the
// real work and the membership gates passed everyone.
//
// From this change on, `organization_members.role` is the only authority.
// user_profiles keeps the PROFILE — name, avatar, and is_active, which is
// account-level (a deactivated person is deactivated in every org). Its `role`
// column survives only as a display mirror until the client contexts are
// switched, and nothing may gate on it.

export const ORG_ROLES = ['owner', 'admin', 'manager', 'agent', 'viewer'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

/** Roles an invitation may carry. Ownership is transferred, never invited. */
export const INVITABLE_ROLES: readonly OrgRole[] = ['admin', 'manager', 'agent', 'viewer']

/**
 * Does this role clear a gate?
 *
 * The owner passes every gate without being named in it. The alternative —
 * adding 'owner' to every allowed-list in the codebase — is exactly the kind of
 * repetition that rots: the one list somebody forgets locks the owner out of a
 * feature on their own organisation.
 *
 * Fails closed: no role, or a role outside the vocabulary, clears nothing.
 */
export function roleAllows(
  role: string | null | undefined,
  allowed: readonly string[]
): boolean {
  if (!role || !ORG_ROLES.includes(role as OrgRole)) return false
  if (role === 'owner') return true
  return allowed.includes(role)
}
