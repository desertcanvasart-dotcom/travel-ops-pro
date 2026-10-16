// Concierge briefs belong to the company whose secret signed them
// (DEFERRED_GATES.md G1). Each organisation has its own webhook secret
// (CONCIERGE_WEBHOOK_SECRETS, keyed by organizations.slug); the legacy single
// CONCIERGE_WEBHOOK_SECRET still verifies and files under the default
// organisation. The brief, its client, its revisions and its Copilot thread
// are stamped with that company — and the same Concierge conversation reaching
// both companies is two leads, not one lead's revision.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'
import {
  buildSignatureHeader,
  parsePerOrgSecrets,
  verifyConciergeSignature,
} from '@/lib/concierge-webhook-auth'

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => createMockClient(),
}))

const ORG_T = 'org-t2e'
const ORG_A = 'org-ats'
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role'
process.env.DEFAULT_ORG_ID = ORG_T
process.env.CONCIERGE_WEBHOOK_SECRETS = JSON.stringify({ ats: 'whsec_ats', travel2egypt: ['whsec_t2e_new', 'whsec_t2e_old'], ghost: 'whsec_ghost' })
process.env.CONCIERGE_WEBHOOK_SECRET = 'whsec_legacy'
delete process.env.CONCIERGE_WEBHOOK_SECRET_PREVIOUS

let POST: (req: any) => Promise<Response>
let GET: (req: any) => Promise<Response>
beforeAll(async () => {
  const mod = await import('@/app/api/webhooks/concierge/route')
  POST = mod.POST as any
  GET = mod.GET as any
})

const NOW = Math.floor(Date.now() / 1000)
function send(payload: Record<string, unknown>, secret: string, extra: Record<string, string> = {}) {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-autoura-signature': buildSignatureHeader(secret, NOW, body),
    'x-autoura-timestamp': String(NOW),
    'x-request-id': `req-${Math.random()}`,
    ...extra,
  }
  return POST({
    url: 'http://localhost/api/webhooks/concierge',
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
  })
}
const brief = (conversation_id: string, revision = 1, email = 'jane@example.com') => ({
  conversation_id,
  brief_revision: revision,
  is_update: revision > 1,
  visitor: { name: 'Jane Doe', email },
  brief_summary: 'Seven days in Egypt',
})

let tables: Record<string, Record<string, unknown>[]>
beforeEach(() => {
  tables = {
    organizations: [{ id: ORG_T, slug: 'travel2egypt', created_at: '1' }, { id: ORG_A, slug: 'ats', created_at: '2' }],
    // The same customer is a client of both companies.
    clients: [
      { id: 'client-t', org_id: ORG_T, email: 'jane@example.com' },
      { id: 'client-a', org_id: ORG_A, email: 'jane@example.com' },
    ],
    concierge_briefs: [],
    concierge_brief_revisions: [],
    client_preferences: [],
    client_notes: [],
    communication_threads: [],
    communication_inbox: [],
  }
  setMockTables(tables)
})

describe('verifier: the secret names the company', () => {
  const body = '{"conversation_id":"c"}'
  const verify = (secret: string, secrets = parsePerOrgSecrets(process.env.CONCIERGE_WEBHOOK_SECRETS).secrets) =>
    verifyConciergeSignature({ rawBody: body, signatureHeader: buildSignatureHeader(secret, NOW, body), secrets, nowSeconds: NOW })

  it('a per-company secret, current or previous, returns its slug', () => {
    expect(verify('whsec_ats')).toMatchObject({ ok: true, orgSlug: 'ats', secretUsed: 'org:ats' })
    expect(verify('whsec_t2e_new')).toMatchObject({ ok: true, orgSlug: 'travel2egypt', secretUsed: 'org:travel2egypt' })
    expect(verify('whsec_t2e_old')).toMatchObject({ ok: true, orgSlug: 'travel2egypt', secretUsed: 'org:travel2egypt:previous' })
  })

  it('the legacy secret names no company (→ the default organisation)', () => {
    const r = verifyConciergeSignature({ rawBody: body, signatureHeader: buildSignatureHeader('whsec_legacy', NOW, body), nowSeconds: NOW })
    expect(r).toMatchObject({ ok: true, orgSlug: null, secretUsed: 'current' })
  })

  it('a per-company secret wins over an identical legacy one', () => {
    const r = verify('same', [{ label: 'current', secret: 'same', orgSlug: null }, { label: 'org:ats', secret: 'same', orgSlug: 'ats' }])
    expect(r).toMatchObject({ ok: true, orgSlug: 'ats' })
  })

  it('the same secret for two companies is refused, never guessed', () => {
    const { secrets } = parsePerOrgSecrets(JSON.stringify({ ats: 'dup', travel2egypt: 'dup' }))
    expect(verify('dup', secrets)).toMatchObject({ ok: false, code: 'ambiguous_secret' })
  })

  it('unparseable or wrongly shaped CONCIERGE_WEBHOOK_SECRETS is a configuration error', () => {
    expect(parsePerOrgSecrets('{ats: x}').error).toMatch(/not valid JSON/)
    expect(parsePerOrgSecrets('["x"]').error).toMatch(/JSON object/)
    expect(parsePerOrgSecrets('{"ats": 7}').error).toMatch(/non-empty string/)
    expect(parsePerOrgSecrets('{"ats": []}').error).toMatch(/non-empty string/)
    expect(parsePerOrgSecrets(undefined)).toEqual({ secrets: [], error: null })
  })
})

describe('POST /api/webhooks/concierge files the brief in the signing company', () => {
  it("ATS's secret: brief, client match, revision and Copilot thread are ATS's", async () => {
    const res = await send(brief('conv-1'), 'whsec_ats')
    expect(res.status).toBe(201)
    const json: any = await res.json()
    expect(json.data.client_id).toBe('client-a')
    expect(tables.concierge_briefs).toHaveLength(1)
    expect(tables.concierge_briefs[0]).toMatchObject({ org_id: ORG_A, client_id: 'client-a', conversation_id: 'conv-1' })
    expect(tables.concierge_brief_revisions).toEqual([expect.objectContaining({ brief_id: json.data.brief_id, brief_revision: 1 })])
    expect(tables.communication_threads).toEqual([expect.objectContaining({ org_id: ORG_A, brief_id: json.data.brief_id })])
  })

  it("Travel2Egypt's (previous, mid-rotation) secret files in Travel2Egypt", async () => {
    const res = await send(brief('conv-2'), 'whsec_t2e_old')
    expect(res.status).toBe(201)
    expect(tables.concierge_briefs[0]).toMatchObject({ org_id: ORG_T, client_id: 'client-t' })
    expect(tables.communication_threads[0]).toMatchObject({ org_id: ORG_T })
  })

  it('the legacy single secret still works and files under the default organisation', async () => {
    const res = await send(brief('conv-3'), 'whsec_legacy')
    expect(res.status).toBe(201)
    expect(tables.concierge_briefs[0]).toMatchObject({ org_id: ORG_T })
  })

  it("the same conversation reaching both companies is two leads; a revision updates only the signer's", async () => {
    expect((await send(brief('conv-9'), 'whsec_ats')).status).toBe(201)
    // Travel2Egypt's first brief of the same conversation is NEW, not an update of ATS's.
    expect((await send(brief('conv-9'), 'whsec_t2e_new')).status).toBe(201)
    expect(tables.concierge_briefs.map(b => b.org_id).sort()).toEqual([ORG_A, ORG_T].sort())

    const res = await send(brief('conv-9', 2), 'whsec_ats')
    const json: any = await res.json()
    expect(json.data.status).toBe('updated')
    const byOrg = Object.fromEntries(tables.concierge_briefs.map(b => [b.org_id as string, b]))
    expect(byOrg[ORG_A]).toMatchObject({ brief_revision: 2 })
    expect(byOrg[ORG_T]).toMatchObject({ brief_revision: 1 })
    expect(json.data.brief_id).toBe(byOrg[ORG_A].id)
    expect(tables.communication_threads.map(t => t.org_id).sort()).toEqual([ORG_A, ORG_T].sort())
  })

  it('a slug that names no organisation is refused (500) and nothing is written', async () => {
    const res = await send(brief('conv-4'), 'whsec_ghost')
    expect(res.status).toBe(500)
    expect(((await res.json()) as any).code).toBe('unknown_org_slug')
    expect(tables.concierge_briefs).toEqual([])
    expect(tables.clients).toHaveLength(2)
  })

  it('a dry run says which company, without writing', async () => {
    const res = await send(brief('conv-5'), 'whsec_ats', { 'x-autoura-dry-run': 'true' })
    expect(res.status).toBe(200)
    const json: any = await res.json()
    expect(json.organization).toEqual({ slug: 'ats', resolved_by: 'per-organisation secret' })
    expect(tables.concierge_briefs).toEqual([])
    const legacy: any = await (await send(brief('conv-5'), 'whsec_legacy', { 'x-autoura-dry-run': 'true' })).json()
    expect(legacy.organization.slug).toBeNull()
  })

  it('an unknown secret is 401; the health check counts secrets without naming companies', async () => {
    expect((await send(brief('conv-6'), 'whsec_nope')).status).toBe(401)
    const health: any = await (await GET({ url: 'http://localhost/api/webhooks/concierge', headers: { get: () => null } })).json()
    expect(health.secrets_configured).toBe(5)
    expect(JSON.stringify(health)).not.toContain('travel2egypt')
  })
})
