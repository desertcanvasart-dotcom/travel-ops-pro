// Internal trusted-identity header: middleware verifies the session once via
// supabase.auth.getUser() (a network round-trip to the Auth server), then
// forwards the verified user id to route handlers in this header so they
// don't have to repeat the round-trip in getCurrentOrgId()/getCurrentUserId().
//
// The value is HMAC-SHA256 signed with a server-only secret
// (SUPABASE_SERVICE_ROLE_KEY, never shipped to clients), so a client cannot
// forge it — even if a future middleware-matcher change ever let a
// client-supplied copy of this header through unstripped, verification would
// reject it. Consumers still FALL BACK to auth.getUser() whenever the header
// is missing or invalid, so nothing depends on middleware for correctness.
//
// Web Crypto only (crypto.subtle): works in both the edge middleware runtime
// and Node route handlers.

export const VERIFIED_USER_HEADER = 'x-tops-verified-user'

function getSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Build the signed header value for a verified user id. Returns null when the
// signing secret isn't configured (callers then simply don't set the header).
export async function signVerifiedUserHeader(userId: string): Promise<string | null> {
  const secret = getSecret()
  if (!secret || !userId) return null
  return `${userId}.${await hmacHex(secret, userId)}`
}

// Parse + verify a header value. Returns the user id when the signature is
// valid, null otherwise (malformed, missing secret, or signature mismatch).
export async function verifyVerifiedUserHeader(value: string | null | undefined): Promise<string | null> {
  const secret = getSecret()
  if (!secret || !value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = value.slice(0, dot)
  const givenSig = value.slice(dot + 1)
  const expectedSig = await hmacHex(secret, userId)
  // Constant-time-ish comparison: compare digests of equal length
  if (givenSig.length !== expectedSig.length) return null
  let diff = 0
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= givenSig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
  }
  return diff === 0 ? userId : null
}
