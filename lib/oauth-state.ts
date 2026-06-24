import crypto from 'crypto'

/**
 * Signing/verification for OAuth `state` parameters.
 *
 * OAuth callbacks (Gmail, QuickBooks, Xero) previously trusted a raw user id
 * embedded in `state`, so an attacker could complete a flow with a victim's
 * user id and have tokens written to that account. We now sign the state at
 * connect time and verify the signature at the callback, so the embedded user
 * id cannot be forged.
 *
 * Secret falls back to the service-role key (server-only, high entropy) when a
 * dedicated OAUTH_STATE_SECRET isn't configured.
 */
const STATE_SECRET =
  process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function sign(payload: string): string {
  return crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url')
}

/** Returns `${payload}.${signature}` for use as an OAuth `state` parameter. */
export function signState(payload: string): string {
  return `${payload}.${sign(payload)}`
}

/**
 * Verifies a signed state and returns the original payload, or null if the
 * signature is missing or invalid. Use this to recover the user id at the callback.
 */
export function verifyState(state: string | null | undefined): string | null {
  if (!state) return null
  const idx = state.lastIndexOf('.')
  if (idx <= 0) return null
  const payload = state.slice(0, idx)
  const sig = state.slice(idx + 1)
  const expected = sign(payload)
  if (sig.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  return payload
}
