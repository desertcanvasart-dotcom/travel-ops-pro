// ============================================
// INTEGRATION CREDENTIALS — outbound API keys, inbound HMAC
// ============================================
// Two directions, two mechanisms, deliberately different:
//
//   OUTBOUND  we ISSUE a key. We store only its SHA-256 hash, so a dump of this
//             database yields no working credential. The plaintext is returned
//             exactly once, at creation.
//
//   INBOUND   the partner signs their request body with a secret WE generated
//             and both sides hold. We must keep the plaintext, because
//             verifying an HMAC requires re-computing it.
//
// Both comparisons are constant-time. A fast-failing string compare on a
// credential leaks its prefix to anyone who can time the endpoint.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

/** Prefix on issued keys — makes a leaked key identifiable in logs and greppable. */
const KEY_PREFIX = 'tops_live_'

export interface IssuedKey {
  /** Shown to the operator ONCE. Never stored. */
  plaintext: string
  hash: string
  /** Stored so the UI can identify which key is installed. */
  prefix: string
}

/**
 * Mint an outbound API key.
 *
 * 32 random bytes, base64url: 256 bits of entropy, so guessing is not a threat
 * model we need to defend beyond rate limiting.
 */
export function issueApiKey(): IssuedKey {
  const secret = randomBytes(32).toString('base64url')
  const plaintext = `${KEY_PREFIX}${secret}`
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    // Enough to recognise, far too little to reconstruct.
    prefix: plaintext.slice(0, 18),
  }
}

/**
 * Hash a key for storage and lookup.
 *
 * Plain SHA-256, NOT bcrypt/argon2 — deliberately. This is a 256-bit random
 * token, not a human password: there is no dictionary to attack and no
 * meaningful brute force, and the outbound API must look a key up by hash on
 * every request. A deliberately slow KDF here would cost every call and buy
 * nothing.
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext.trim()).digest('hex')
}

/** Pull a Bearer token out of an Authorization header. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/** Generate the shared secret a partner signs inbound webhooks with. */
export function generateInboundSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`
}

/**
 * The opaque token in a connection's inbound webhook URL.
 *
 * Replaces sending our org id in a header. A partner should never hold an
 * internal identifier: the org id is the same value across every connection, it
 * ends up in their logs and config, and it invites probing other endpoints with
 * it. A per-connection token reveals nothing about us, and revoking one
 * partner's endpoint leaves every other partner untouched.
 *
 * NOT the credential — the HMAC signature authenticates. This only routes. It
 * is still 128 bits of entropy, because a guessable endpoint would let anyone
 * enumerate which connections exist.
 */
export function generateEndpointToken(): string {
  return `ep_${randomBytes(16).toString('base64url')}`
}

/** Constant-time compare of two strings of arbitrary length. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on length mismatch, and the throw itself is a timing
  // signal. Hash both first so the comparison is always over 32 equal bytes.
  const ha = createHash('sha256').update(ba).digest()
  const hb = createHash('sha256').update(bb).digest()
  return timingSafeEqual(ha, hb)
}

export interface SignatureCheck {
  valid: boolean
  reason?: string
}

/**
 * Verify an inbound webhook signature over the RAW body.
 *
 * Raw, not re-serialized JSON: `JSON.stringify(JSON.parse(body))` reorders keys
 * and drops whitespace, so it produces a different digest than the partner
 * signed. The caller must pass the exact bytes received.
 *
 * Accepts `sha256=<hex>` (the GitHub/Stripe convention) as well as a bare hex
 * digest, because partners send both and rejecting one costs an integration.
 *
 * @param timestamp optional; when the partner sends one and `toleranceSeconds`
 *   is set, an old signature is refused so a captured delivery cannot be
 *   replayed forever.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
  options: { timestamp?: string | null; toleranceSeconds?: number; now?: number } = {}
): SignatureCheck {
  if (!secret) {
    // Fails CLOSED. An integration with no secret cannot be verified, and
    // accepting unverified writes to a shared departures calendar is worse than
    // a broken integration.
    return { valid: false, reason: 'This integration has no inbound secret configured' }
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'Missing signature header' }
  }

  const provided = signatureHeader.trim().replace(/^sha256=/i, '')
  if (!/^[a-f0-9]{64}$/i.test(provided)) {
    return { valid: false, reason: 'Signature is not a SHA-256 hex digest' }
  }

  const { timestamp, toleranceSeconds, now = Date.now() } = options

  if (timestamp && toleranceSeconds) {
    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) {
      return { valid: false, reason: 'Timestamp header is not a number' }
    }
    // Seconds or milliseconds — partners send both.
    const tsMs = ts > 1e12 ? ts : ts * 1000
    const ageSeconds = Math.abs(now - tsMs) / 1000
    if (ageSeconds > toleranceSeconds) {
      return { valid: false, reason: `Signature timestamp is ${Math.round(ageSeconds)}s old` }
    }
  }

  // When a timestamp is present it is part of the signed payload, so a captured
  // body cannot be replayed with a fresh timestamp.
  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody
  const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')

  return safeEqual(expected, provided.toLowerCase())
    ? { valid: true }
    : { valid: false, reason: 'Signature does not match' }
}

/** Build a signature the way we expect to receive it — for docs and tests. */
export function signWebhookBody(
  rawBody: string,
  secret: string,
  timestamp?: string | null
): string {
  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody
  return `sha256=${createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')}`
}
