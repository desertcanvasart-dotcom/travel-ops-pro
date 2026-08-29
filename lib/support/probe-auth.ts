// ============================================
// Who may ask an install how it is
// ============================================
// On the sibling, /api/health is an exempt middleware prefix and this function
// is the ONLY thing in front of the deep probe. Verified 2026-08-29: this app's
// middleware does not exempt /api/health, so the route is also behind the
// session gate here.
//
// It still fails closed — with no secret configured, nothing authenticates.
// Relying on middleware coverage that is not stated in the route is how a
// refactor quietly opens a door.
//
// A monitor cannot hold a session, which is why a bearer token exists at all.

import crypto from 'crypto'

/**
 * Constant-time bearer comparison.
 *
 * The length check leaks the secret's length, which is not worth defending; the
 * byte comparison does not leak where the first difference is, which is.
 */
export function bearerMatches(header: string | null | undefined, secret: string | undefined): boolean {
  if (typeof secret !== 'string' || secret.trim() === '') return false
  if (typeof header !== 'string') return false

  const expected = `Bearer ${secret}`
  const given = Buffer.from(header)
  const want = Buffer.from(expected)
  if (given.length !== want.length) return false
  return crypto.timingSafeEqual(given, want)
}
