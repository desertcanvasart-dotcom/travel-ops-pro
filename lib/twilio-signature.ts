// ============================================
// TWILIO WEBHOOK SIGNATURE VERIFICATION
// ============================================
// Twilio signs every webhook it sends with an HMAC over the exact URL it was
// configured with plus the sorted POST parameters. Verifying it is the ONLY
// thing standing between these endpoints and the open internet: they carry no
// session, they are on the middleware self-auth allowlist, and they run on the
// RLS-bypassing service-role client.
//
// This lived inline in the inbound-message webhook, where it was correct, while
// the status callback — reachable because the allowlist matched it by prefix —
// had no verification at all and happily accepted forged delivery receipts.
// One implementation, used by both.
//
// Behind Railway (and any other proxy) the public host arrives via
// x-forwarded-*, so the URL Twilio signed is not always the one Next.js sees.
// Both candidates are tried.
//
// Fails CLOSED: no auth token, no signature, or no match → rejected.

import twilio from 'twilio'
import type { NextRequest } from 'next/server'

export function verifyTwilioSignature(
  request: Pick<NextRequest, 'headers' | 'url'>,
  params: Record<string, string>,
  label = 'Twilio webhook'
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error(`🚫 TWILIO_AUTH_TOKEN not set — rejecting ${label} (fail closed)`)
    return false
  }

  const signature = request.headers.get('x-twilio-signature')
  if (!signature) {
    console.error(`🚫 Missing X-Twilio-Signature header on ${label}`)
    return false
  }

  const { pathname, search } = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const candidateUrls = [
    host ? `${proto}://${host}${pathname}${search}` : null,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}${pathname}${search}`
      : null,
  ].filter((u): u is string => !!u)

  const ok = candidateUrls.some(url => twilio.validateRequest(authToken, signature, url, params))
  if (!ok) {
    console.error(`🚫 Invalid Twilio signature on ${label}`, { triedUrls: candidateUrls })
  }
  return ok
}

/** Flatten a Twilio form-urlencoded body into the plain object the signature check needs. */
export function formDataToParams(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    params[key] = typeof value === 'string' ? value : ''
  })
  return params
}
