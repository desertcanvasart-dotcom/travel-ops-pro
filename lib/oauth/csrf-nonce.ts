// ============================================
// OAUTH CONNECT-FLOW CSRF — a session-bound nonce
// ============================================
// Signing the state proves the user id inside it was not forged, but it does
// NOT tie the flow to the browser that started it: an attacker can begin their
// own (validly signed) connect flow, hand the consent URL to a victim, and the
// callback then attaches the VICTIM's provider account to the ATTACKER's app
// account. The signed state does not help — it is the attacker's own.
//
// The fix is a random nonce minted at connect, stored in an httpOnly cookie AND
// embedded in the signed state. At the callback the two must match. An attacker
// cannot set the victim's cookie, so a flow the victim did not start fails.
//
// SameSite=Lax so the cookie survives the top-level redirect back from the
// provider; httpOnly + Secure so script cannot read it and it only travels over
// TLS; short-lived because a connect flow completes in seconds to minutes.

import crypto from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

export const OAUTH_NONCE_COOKIE = 'oauth_state_nonce'
const MAX_AGE_SECONDS = 600 // 10 minutes

/** Mint a nonce to embed in the signed state. */
export function newNonce(): string {
  return crypto.randomBytes(16).toString('base64url')
}

/** Set the nonce cookie on a connect response (which returns the auth URL). */
export function setNonceCookie(res: NextResponse, nonce: string): void {
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/**
 * At the callback: does the nonce carried in the (verified) state match the
 * cookie the browser presents? Constant-time compare; false if either is absent.
 */
export function nonceMatches(request: NextRequest, stateNonce: string | undefined | null): boolean {
  const cookieNonce = request.cookies.get(OAUTH_NONCE_COOKIE)?.value
  if (!cookieNonce || !stateNonce) return false
  const a = Buffer.from(cookieNonce)
  const b = Buffer.from(stateNonce)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Clear the one-time nonce cookie on the callback's redirect response. */
export function clearNonceCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_NONCE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
}
