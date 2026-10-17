// ============================================
// Change password — Settings › Profile (/settings/profile)
// ============================================
// The page used to wait a second and announce "Password changed
// successfully!" without calling anything. Now the browser session does it:
// the current password is checked by signing in with it (Supabase's
// updateUser does not ask for it, and a session left open on a shared desk
// must not be enough to lock its owner out), then auth.updateUser sets the
// new one. Returns an i18n key under `settings` for whatever went wrong.

export type PasswordError =
  | 'passwordTooShort'
  | 'passwordMismatch'
  | 'passwordSameAsCurrent'
  | 'passwordCurrentWrong'
  | 'failedToSave'

export const MIN_PASSWORD_LENGTH = 8

export function validatePasswordChange(input: { current: string; next: string; confirm: string }): PasswordError | null {
  if (input.next.length < MIN_PASSWORD_LENGTH) return 'passwordTooShort'
  if (input.next !== input.confirm) return 'passwordMismatch'
  if (input.next === input.current) return 'passwordSameAsCurrent'
  return null
}

/** The two calls of supabase.auth this needs — the browser client fits. */
export interface PasswordAuth {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ error: unknown }>
  updateUser(attributes: { password: string }): Promise<{ error: unknown }>
}

export async function changePassword(
  auth: PasswordAuth,
  email: string,
  input: { current: string; next: string; confirm: string }
): Promise<{ ok: true } | { ok: false; error: PasswordError }> {
  const invalid = validatePasswordChange(input)
  if (invalid) return { ok: false, error: invalid }
  const { error: wrong } = await auth.signInWithPassword({ email, password: input.current })
  if (wrong) return { ok: false, error: 'passwordCurrentWrong' }
  const { error } = await auth.updateUser({ password: input.next })
  if (error) return { ok: false, error: 'failedToSave' }
  return { ok: true }
}
