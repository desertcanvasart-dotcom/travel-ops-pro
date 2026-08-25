// ============================================
// TOKEN CIPHER — AES-256-GCM at rest
// ============================================
// OAuth access/refresh tokens were stored as plaintext columns. This encrypts
// them with AES-256-GCM before they touch the database and decrypts on read, so
// a database leak (a dump, a backup, an RLS slip) does not hand out live
// credentials.
//
// Honest scope: the key lives in the same environment as the service-role key,
// so this defends the DATA store, not the ENV. That is exactly the threat model
// for "plaintext credentials in the database" and is standard practice; it is
// not protection against an attacker who already has the server's environment.
//
// FORMAT: `v1:<iv>:<tag>:<ciphertext>`, each part base64. The version prefix
// lets the algorithm change later without guessing.
//
// BACKWARD COMPATIBLE: decrypt() returns any value WITHOUT the `v1:` prefix
// unchanged — a legacy plaintext token still reads correctly, and re-encrypts
// itself the next time it is written. No migration has to run before the deploy.

import crypto from 'crypto'

const VERSION = 'v1'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12 // GCM standard nonce length

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. OAuth tokens cannot be encrypted/decrypted. ' +
        'Generate one with `openssl rand -base64 32` and set ENCRYPTION_KEY.'
    )
  }
  // Accept a 32-byte base64 key (the documented form). Fall back to hex, then to
  // a sha256 of the raw string so a mis-sized value still yields a 32-byte key
  // rather than throwing in production — but the base64 path is the intended one.
  let buf = tryDecode(raw, 'base64')
  if (buf?.length !== 32) buf = tryDecode(raw, 'hex')
  if (buf?.length !== 32) buf = crypto.createHash('sha256').update(raw).digest()
  cachedKey = buf
  return cachedKey
}

function tryDecode(s: string, enc: BufferEncoding): Buffer | null {
  try {
    return Buffer.from(s, enc)
  } catch {
    return null
  }
}

/** Test seam: forget the memoised key so a changed env is picked up. */
export function resetTokenKeyForTests(): void {
  cachedKey = null
}

/** Encrypt a token for storage. Returns the versioned envelope. */
export function encryptToken(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return plaintext ?? null
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGO, key(), iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

/**
 * Decrypt a stored token.
 *
 * A value that does not carry the `v1:` prefix is legacy plaintext and is
 * returned as-is — this is what lets the switch happen with no migration and no
 * downtime. A malformed `v1:` value throws (tampering or a wrong key), which is
 * the right failure: better to fail the call than to proceed with garbage.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return stored ?? null
  if (!stored.startsWith(`${VERSION}:`)) return stored // legacy plaintext

  const parts = stored.split(':')
  if (parts.length !== 4) throw new Error('Malformed encrypted token envelope')
  const [, ivB64, tagB64, dataB64] = parts
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return dec.toString('utf8')
}

/** True if a stored value is already in the encrypted envelope form. */
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(`${VERSION}:`)
}
