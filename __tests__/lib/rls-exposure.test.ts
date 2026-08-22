// The old probe asked "are these 39 named things locked?" and so reported one
// exposure while 46 resources served rows to the anonymous key. These tests
// pin the inverted question: undeclared readability is a failure.
import { describe, it, expect } from 'vitest'
import {
  classifyExposure,
  countFromContentRange,
  probeAsAnon,
  resourcesFromOpenApi,
  OPEN_BY_DESIGN,
} from '@/lib/rls/exposure'

describe('classifyExposure', () => {
  it('fails on a resource nobody listed — the 2026-08-21 blind spot', () => {
    const report = classifyExposure([
      { resource: 'whatsapp_messages', count: 61 },
      { resource: 'organizations', count: 0 },
    ])
    expect(report.ok).toBe(false)
    expect(report.exposed).toEqual([{ table: 'whatsapp_messages', anonVisibleRows: 61 }])
  })

  it('reports the biggest leak first', () => {
    const report = classifyExposure([
      { resource: 'team_members', count: 7 },
      { resource: 'content_variations', count: 707 },
      { resource: 'whatsapp_messages', count: 61 },
    ])
    expect(report.exposed.map((e) => e.table)).toEqual([
      'content_variations',
      'whatsapp_messages',
      'team_members',
    ])
  })

  it('records a 42501 refusal as denied — the clean outcome, not an error', () => {
    // This is the expected shape AFTER the grants are revoked: Postgres refuses
    // the read. Until 2026-08-22 this landed in probeErrors alongside genuine
    // failures, so 168 clean denials read as 168 errors with empty text.
    const report = classifyExposure([
      { resource: 'guides', count: null, error: 'permission denied for view guides', code: '42501' },
    ])
    expect(report.ok).toBe(true)
    expect(report.exposed).toEqual([])
    expect(report.denied).toEqual(['guides'])
    expect(report.probeErrors).toEqual([])
  })

  it('still recognises a permission denial that only carried a message', () => {
    const report = classifyExposure([
      { resource: 'guides', count: null, error: 'permission denied for view guides' },
    ])
    expect(report.denied).toEqual(['guides'])
    expect(report.probeErrors).toEqual([])
  })

  it('keeps a non-permission failure as a probe error, code attached', () => {
    // A bad key, a missing table, a 5xx: "could not prove locked" is not the
    // same as "locked", and must never be hidden inside the denied list.
    const report = classifyExposure([
      { resource: 'clients', count: null, error: 'Invalid API key' },
      { resource: 'ghost', count: null, error: "Could not find the table 'public.ghost'", code: 'PGRST205' },
      { resource: 'blank', count: null, error: '' },
    ])
    expect(report.ok).toBe(true)
    expect(report.denied).toEqual([])
    expect(report.probeErrors).toEqual([
      { table: 'clients', error: 'Invalid API key' },
      { table: 'ghost', error: "Could not find the table 'public.ghost'", code: 'PGRST205' },
      { table: 'blank', error: 'unknown' },
    ])
  })

  it('separates empty-and-readable from proven-locked', () => {
    // accounting_tokens read 0 in the audit only because it was empty; calling
    // that "safe" is how a table leaks on its first insert.
    const report = classifyExposure([{ resource: 'accounting_tokens', count: 0 }])
    expect(report.ok).toBe(true)
    expect(report.unprovable).toEqual(['accounting_tokens'])
  })

  it('honours an explicit declaration without hiding the count', () => {
    const report = classifyExposure(
      [{ resource: 'public_prices', count: 12 }],
      ['public_prices']
    )
    expect(report.ok).toBe(true)
    expect(report.exposed).toEqual([])
    expect(report.openByDesign).toEqual({ public_prices: 12 })
  })

  it('ships with nothing declared open', () => {
    // A name here is a decision. If this ever fails, someone opened something
    // to the anonymous internet and owes the diff a comment explaining why.
    expect(OPEN_BY_DESIGN).toEqual([])
  })
})

describe('resourcesFromOpenApi', () => {
  it('reads table and view names from the PostgREST root', () => {
    expect(resourcesFromOpenApi({ definitions: { guides: {}, clients: {} } })).toEqual([
      'clients',
      'guides',
    ])
  })

  it('returns nothing when the spec is unusable, so the caller can fail loudly', () => {
    // The route turns an empty surface into overall:'fail' — a probe that
    // learned nothing must never read as a clean bill of health.
    expect(resourcesFromOpenApi(null)).toEqual([])
    expect(resourcesFromOpenApi({})).toEqual([])
    expect(resourcesFromOpenApi('nonsense')).toEqual([])
  })
})

describe('countFromContentRange', () => {
  it('reads the total from a PostgREST count header', () => {
    expect(countFromContentRange('0-0/47')).toBe(47)
    expect(countFromContentRange('*/0')).toBe(0)
  })

  it('returns null when there is nothing to read', () => {
    expect(countFromContentRange(null)).toBeNull()
    expect(countFromContentRange('')).toBeNull()
    expect(countFromContentRange('garbage')).toBeNull()
  })
})

describe('probeAsAnon', () => {
  // Response shapes captured from the live project on 2026-08-22.
  const respond = (status: number, body: string, contentRange?: string) => async () => ({
    status,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-range' ? contentRange ?? null : null) },
    text: async () => body,
  })

  it('sends the anon key, asks for an exact count, and reads one row at most', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const fetchImpl = async (url: string, init: RequestInit) => {
      seen = { url, init }
      return respond(200, '[]', '*/0')()
    }
    await probeAsAnon('https://x.supabase.co/', 'anon-key', 'clients', fetchImpl)
    expect(seen!.url).toBe('https://x.supabase.co/rest/v1/clients?select=*&limit=1')
    const h = seen!.init.headers as Record<string, string>
    expect(h.apikey).toBe('anon-key')
    expect(h.Authorization).toBe('Bearer anon-key')
    expect(h.Prefer).toBe('count=exact')
  })

  it('carries the SQLSTATE of a refused read so it can be classified as denied', async () => {
    const p = await probeAsAnon('https://x.supabase.co', 'k', 'clients', respond(
      401, '{"code":"42501","details":null,"hint":null,"message":"permission denied for table clients"}'
    ))
    expect(p).toEqual({ resource: 'clients', count: null, error: 'permission denied for table clients', code: '42501' })
    expect(classifyExposure([p]).denied).toEqual(['clients'])
  })

  it('reports a readable count from Content-Range', async () => {
    expect(await probeAsAnon('https://x.supabase.co', 'k', 'whatsapp_messages', respond(200, '[{}]', '0-0/61')))
      .toEqual({ resource: 'whatsapp_messages', count: 61 })
    expect(await probeAsAnon('https://x.supabase.co', 'k', 'empty', respond(200, '[]', '*/0')))
      .toEqual({ resource: 'empty', count: 0 })
  })

  it('does not mistake a bad key or a missing table for a denial', async () => {
    const badKey = await probeAsAnon('https://x.supabase.co', 'k', 'clients', respond(
      401, '{"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}'
    ))
    expect(badKey).toEqual({ resource: 'clients', count: null, error: 'Invalid API key' })
    const missing = await probeAsAnon('https://x.supabase.co', 'k', 'ghost', respond(
      404, '{"code":"PGRST205","details":null,"hint":null,"message":"Could not find the table"}'
    ))
    expect(missing.code).toBe('PGRST205')
    const report = classifyExposure([badKey, missing])
    expect(report.denied).toEqual([])
    expect(report.probeErrors.map((e) => e.table)).toEqual(['clients', 'ghost'])
  })

  it('turns a 200 without a count, a non-JSON error, or a thrown fetch into a probe error', async () => {
    expect((await probeAsAnon('https://x.supabase.co', 'k', 'a', respond(200, '[]'))).error)
      .toBe('HTTP 200 without a Content-Range count')
    expect((await probeAsAnon('https://x.supabase.co', 'k', 'b', respond(502, '<html>bad gateway</html>'))).error)
      .toBe('HTTP 502')
    const thrown = await probeAsAnon('https://x.supabase.co', 'k', 'c', async () => { throw new Error('ECONNRESET') })
    expect(thrown).toEqual({ resource: 'c', count: null, error: 'ECONNRESET' })
  })
})
