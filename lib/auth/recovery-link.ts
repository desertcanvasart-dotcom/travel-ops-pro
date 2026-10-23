// Reads a password-reset link as Supabase delivers it to /reset-password.
//
// The reset email links here with `?token_hash=…&type=recovery` (see the
// "Reset password" email template). That token is NOT tied to the browser that
// asked for the reset, unlike the PKCE `?code=` the default template sends,
// which only works in the browser holding the code verifier cookie — the reason
// links opened on a phone or in a mail app's browser all said "invalid link".
//
// When Supabase refuses a link (expired, already used — mail scanners such as
// Outlook Safe Links open links before the person does) it redirects with
// `error`/`error_code`/`error_description` in the hash or the query instead.
export interface RecoveryLink {
  tokenHash: string | null
  error: string | null
}

export function parseRecoveryLink(href: string): RecoveryLink {
  const url = new URL(href)
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const read = (key: string) => query.get(key) || hash.get(key) || null

  const tokenHash = read('token_hash')
  const type = read('type')
  const error = read('error_description') || read('error_code') || read('error')

  return {
    tokenHash: tokenHash && type === 'recovery' ? tokenHash : null,
    error,
  }
}
