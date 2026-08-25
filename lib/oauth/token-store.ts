// ============================================
// OAUTH TOKEN STORE — the one place that encrypts on write, decrypts on read
// ============================================
// gmail_tokens and accounting_tokens hold access/refresh tokens. Every write
// encrypts them (lib/crypto/token-cipher) and every read decrypts them, so the
// secrets are never at rest in plaintext. Routing all token I/O through here is
// what keeps that guarantee from depending on each call site remembering.
//
// Metadata columns (email, provider, company_name, expiry) are NOT encrypted —
// only the two secret token columns.

import { encryptToken, decryptToken } from '@/lib/crypto/token-cipher'

/** Encrypt the token fields of a row about to be written. Pass-through for the rest. */
export function encryptTokenFields<T extends { access_token?: string | null; refresh_token?: string | null }>(
  row: T
): T {
  const out: T = { ...row }
  if ('access_token' in row) out.access_token = encryptToken(row.access_token)
  if ('refresh_token' in row) out.refresh_token = encryptToken(row.refresh_token)
  return out
}

/** Decrypt the token fields of a row just read. Legacy plaintext passes through. */
export function decryptTokenFields<T extends { access_token?: string | null; refresh_token?: string | null }>(
  row: T | null
): T | null {
  if (!row) return row
  const out: T = { ...row }
  if ('access_token' in row) out.access_token = decryptToken(row.access_token)
  if ('refresh_token' in row) out.refresh_token = decryptToken(row.refresh_token)
  return out
}
