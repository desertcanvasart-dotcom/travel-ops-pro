// ============================================
// Two-factor login (authenticator app, TOTP)
// ============================================
// Supabase Auth issues a session at assurance level aal1 after the password
// and raises it to aal2 once the person enters a code from an authenticator
// app (supabase.auth.mfa.challengeAndVerify). Route handlers trust the user
// the middleware forwards, so the middleware is where the level is enforced
// (twoFactorGate below):
//
//   * Anyone who HAS set up an authenticator must enter a code before any
//     page or API answers — whatever their role. A password alone is not
//     enough once a second factor exists.
//   * When the company requires it (organizations.require_two_factor, the
//     owner's switch under Settings → Organization), an owner, administrator
//     or manager with no authenticator is sent to set one up first.
//
// Lost phone: an owner or administrator resets a colleague's authenticators
// (DELETE /api/organization/members/[userId]/two-factor); for the owner's own,
// the server operator runs `node --env-file=.env.local scripts/reset-two-factor.mjs <email>`.

export const TWO_FACTOR_ROLES = ['owner', 'admin', 'manager'] as const

/** Pages a person waiting on two-factor may still open: the code and set-up screens. */
export const TWO_FACTOR_PAGE = '/two-factor'
export const TWO_FACTOR_SETUP_PAGE = '/two-factor/setup'

export type TwoFactorGate = 'ok' | 'verify' | 'setup'

export interface TwoFactorState {
  /** The session's assurance level (aal1 after the password, aal2 after a code). */
  currentLevel: string | null | undefined
  /** The person has at least one verified authenticator. */
  hasVerifiedFactor: boolean
  /** Their role in the active company (organization_members). */
  role: string | null | undefined
  /** The company requires two-factor for owners, administrators and managers. */
  companyRequires: boolean
}

/** What the request must do before it goes on: nothing, enter a code, or set one up. */
export function twoFactorGate(s: TwoFactorState): TwoFactorGate {
  if (s.hasVerifiedFactor) return s.currentLevel === 'aal2' ? 'ok' : 'verify'
  if (s.companyRequires && (TWO_FACTOR_ROLES as readonly string[]).includes(String(s.role ?? ''))) return 'setup'
  return 'ok'
}

/** A user object's verified authenticators (Supabase `user.factors`). */
export function verifiedFactors<F extends { status?: string | null }>(user: { factors?: F[] | null } | null | undefined): F[] {
  return (user?.factors ?? []).filter(f => f?.status === 'verified')
}

/** Where the two-factor screens send the person afterwards: a path on this
 *  site only (never another origin), else the dashboard. */
export function safeNextPath(next: string | null | undefined): string {
  const n = String(next ?? '')
  if (!n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\') || n.startsWith(TWO_FACTOR_PAGE)) return '/dashboard'
  return n
}
