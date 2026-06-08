import { describe, it, expect, beforeAll } from 'vitest'
import { buildSignatureHeader } from '@/lib/concierge-webhook-auth'

// Env must be set BEFORE importing the route (it builds a supabase client at
// module load). Dry-run / pre-ingest paths never touch the DB, so dummy
// Supabase creds are fine — we only exercise signature + validation + mapping.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role'
process.env.CONCIERGE_WEBHOOK_SECRET = 'secret_current'

let POST: (req: any) => Promise<Response>
let GET: (req: any) => Promise<Response>

beforeAll(async () => {
  const mod = await import('@/app/api/webhooks/concierge/route')
  POST = mod.POST as any
  GET = mod.GET as any
})

function makeReq(body: string, headers: Record<string, string>, url = 'http://localhost/api/webhooks/concierge') {
  // Minimal Request-like object the route uses: .text(), .headers.get(), .url
  return {
    url,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
  }
}

const NOW = Math.floor(Date.now() / 1000)

function signedHeaders(body: string, secret = 'secret_current', t = NOW, extra: Record<string, string> = {}) {
  return {
    'content-type': 'application/json',
    'x-autoura-signature': buildSignatureHeader(secret, t, body),
    'x-autoura-timestamp': String(t),
    'x-request-id': 'req-test-1',
    ...extra,
  }
}

describe('POST /api/webhooks/concierge (route wiring)', () => {
  it('dry-run: valid signature returns mapping preview, no write', async () => {
    const body = JSON.stringify({
      conversation_id: 'conv-1',
      language: 'es',
      visitor: { name: 'Jane Doe', email: 'jane@example.com' },
      trip: { nationality: 'American' },
      preferences: { comfort_level: 'luxury', interests: ['history', 'food'] },
    })
    const res = await POST(makeReq(body, signedHeaders(body, 'secret_current', NOW, { 'x-autoura-dry-run': 'true' })))
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.dry_run).toBe(true)
    expect(json.signature.valid).toBe(true)
    expect(json.mapping_preview.client.client_source).toBe('concierge')
    expect(json.mapping_preview.client.preferred_language).toBe('Spanish')
    expect(json.mapping_preview.preferences.preferred_tier).toBe('luxury')
    expect(json.mapping_preview.is_actionable).toBe(true)
  })

  it('dry-run: no-contact brief is accepted and flagged', async () => {
    const body = JSON.stringify({ conversation_id: 'conv-2', visitor: { name: 'Anon' } })
    const res = await POST(makeReq(body, signedHeaders(body, 'secret_current', NOW, { 'x-autoura-dry-run': 'true' })))
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.mapping_preview.flags).toContain('unactionable_no_contact')
    expect(json.mapping_preview.is_actionable).toBe(false)
  })

  it('rejects a bad signature with 401', async () => {
    const body = JSON.stringify({ conversation_id: 'conv-3' })
    const headers = signedHeaders(body, 'wrong_secret', NOW, { 'x-autoura-dry-run': 'true' })
    const res = await POST(makeReq(body, headers))
    expect(res.status).toBe(401)
  })

  it('rejects a missing signature with 401', async () => {
    const body = JSON.stringify({ conversation_id: 'conv-4' })
    const res = await POST(makeReq(body, { 'content-type': 'application/json' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for malformed JSON (with a valid signature over the raw text)', async () => {
    const body = 'this is not json'
    const res = await POST(makeReq(body, signedHeaders(body, 'secret_current', NOW, { 'x-autoura-dry-run': 'true' })))
    expect(res.status).toBe(400)
  })

  it('returns 422 for a missing conversation_id', async () => {
    const body = JSON.stringify({ visitor: { email: 'a@b.com' } })
    const res = await POST(makeReq(body, signedHeaders(body, 'secret_current', NOW, { 'x-autoura-dry-run': 'true' })))
    expect(res.status).toBe(422)
    const json: any = await res.json()
    expect(json.field).toBe('conversation_id')
  })
})

describe('GET /api/webhooks/concierge (health + test vector)', () => {
  it('publishes the canonicalization recipe and a reproducible test vector', async () => {
    const res = await GET(makeReq('', {}))
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.status).toBe('active')
    expect(json.secrets_configured).toBeGreaterThanOrEqual(1)
    expect(json.test_vector.expected_signature_header).toBe(
      't=1735732800,v1=3cc2e7aba5b04ecf03020484f1befcdb128b1cb83f38030550591b159334db5a'
    )
  })
})
