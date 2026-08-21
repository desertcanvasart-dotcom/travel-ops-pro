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
 *
 * It does NOT fall back to the empty string, which is what it used to do. An
 * empty HMAC key is a key anyone can guess: the signature becomes computable
 * by the attacker, `verifyState` accepts a forged payload, and the module
 * silently stops providing the single protection it exists for. A
 * misconfigured deployment must refuse to sign, not sign forgeably.
 *
 * Resolved lazily, not at module scope: these functions are imported by route
 * modules that `next build` evaluates during prerender, where the variables
 * are absent by design.
 */
let cachedSecret: string | null = null

function stateSecret(): string {
  if (cachedSecret) return cachedSecret

  const secret = process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!secret) {
    throw new Error(
      'OAuth state cannot be signed: set OAUTH_STATE_SECRET (or SUPABASE_SERVICE_ROLE_KEY). ' +
        'Refusing to sign with an empty key — that would let anyone forge the user id in `state`.'
    )
  }

  cachedSecret = secret
  return cachedSecret
}

/** Test seam: forget the memoised secret so a changed env is picked up. */
export function resetStateSecretForTests(): void {
  cachedSecret = null
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url')
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

  // A missing secret means nothing legitimate was ever signed, so every state
  // is unverifiable. Reject rather than throw: the callback should read as
  // "invalid state", not crash with a stack trace containing config details.
  let expected: string
  try {
    expected = sign(payload)
  } catch {
    return null
  }
  if (sig.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  return payload
}
