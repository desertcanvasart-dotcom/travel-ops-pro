// ============================================
// Twilio webhook signature validation
// ============================================
// Twilio signs every webhook request with an X-Twilio-Signature header computed
// from the request URL + POST params and the account Auth Token. Validating it
// ensures inbound requests genuinely came from Twilio (the webhook routes run
// without a user session, so this is their only authentication).
// ============================================

import twilio from 'twilio'
import type { NextRequest } from 'next/server'

/**
 * Convert Twilio's form-encoded body into the flat string map validateRequest expects.
 */
export function formDataToParams(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') params[key] = value
  }
  return params
}

/**
 * Validate that an incoming request was signed by Twilio.
 *
 * Returns true when the X-Twilio-Signature header matches one of the candidate
 * public URLs. If TWILIO_AUTH_TOKEN is not configured, validation is skipped
 * (returns true) so setups without the token are not blocked — set the token to
 * enforce. Behind proxies the request's own host can differ from the public URL
 * Twilio signed, so we try the likely candidates and accept any match.
 */
export function validateTwilioRequest(
  request: NextRequest,
  params: Record<string, string>
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.warn('⚠️ TWILIO_AUTH_TOKEN not set — skipping Twilio signature validation')
    return true
  }

  const signature = request.headers.get('x-twilio-signature')
  if (!signature) return false

  const pathWithQuery = request.nextUrl.pathname + (request.nextUrl.search || '')
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = request.headers.get('host')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')

  const candidates = new Set<string>()
  if (appUrl) candidates.add(`${appUrl}${pathWithQuery}`)
  if (forwardedHost) candidates.add(`${proto}://${forwardedHost}${pathWithQuery}`)
  if (host) candidates.add(`${proto}://${host}${pathWithQuery}`)

  for (const url of candidates) {
    try {
      if (twilio.validateRequest(authToken, signature, url, params)) return true
    } catch {
      // try next candidate
    }
  }

  console.warn('⛔ Twilio signature did not match any candidate URL', { candidates: [...candidates] })
  return false
}
