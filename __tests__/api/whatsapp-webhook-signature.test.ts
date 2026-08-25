import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// The route module builds a Supabase client at import; mock it so we can import
// the pure verifier in isolation.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({}) }) }),
}))

import { verifyTwilioSignature } from '@/lib/twilio-signature'

const URL_STR = 'https://www.autoura.net/api/whatsapp/webhook'

function req(headers: Record<string, string>, url = URL_STR) {
  return { headers: new Headers(headers), url } as any
}

// Twilio's documented signing algorithm: HMAC-SHA1 over (url + sorted key+value
// concatenation), base64. Used to mint a genuine signature for the positive control.
function twilioSig(token: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url)
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
}

const PARAMS = { From: 'whatsapp:+201234567890', Body: 'hello', MessageSid: 'SM123' }

describe('verifyTwilioSignature — fails closed', () => {
  beforeEach(() => { delete process.env.TWILIO_AUTH_TOKEN })

  it('rejects when TWILIO_AUTH_TOKEN is not configured', () => {
    expect(verifyTwilioSignature(req({ 'x-twilio-signature': 'anything' }), PARAMS)).toBe(false)
  })

  it('rejects when the X-Twilio-Signature header is missing', () => {
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    expect(verifyTwilioSignature(req({ host: 'www.autoura.net' }), PARAMS)).toBe(false)
  })

  it('rejects a forged / incorrect signature', () => {
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    expect(verifyTwilioSignature(
      req({ 'x-twilio-signature': 'ZGVhZGJlZWY=', host: 'www.autoura.net' }), PARAMS,
    )).toBe(false)
  })

  it('rejects a valid signature if the body params are tampered with', () => {
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    const sig = twilioSig('test-token', URL_STR, PARAMS)
    const tampered = { ...PARAMS, Body: 'malicious' }
    expect(verifyTwilioSignature(
      req({ 'x-twilio-signature': sig, host: 'www.autoura.net', 'x-forwarded-proto': 'https' }), tampered,
    )).toBe(false)
  })
})

describe('verifyTwilioSignature — accepts a genuine Twilio request', () => {
  it('validates a correctly-signed request via the proxy-derived URL', () => {
    process.env.TWILIO_AUTH_TOKEN = 'test-token'
    const sig = twilioSig('test-token', URL_STR, PARAMS)
    expect(verifyTwilioSignature(
      req({ 'x-twilio-signature': sig, host: 'www.autoura.net', 'x-forwarded-proto': 'https' }), PARAMS,
    )).toBe(true)
  })
})
