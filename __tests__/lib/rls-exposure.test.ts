// The old probe asked "are these 39 named things locked?" and so reported one
// exposure while 46 resources served rows to the anonymous key. These tests
// pin the inverted question: undeclared readability is a failure.
import { describe, it, expect } from 'vitest'
import { classifyExposure, resourcesFromOpenApi, OPEN_BY_DESIGN } from '@/lib/rls/exposure'

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

  it('treats a permission error as unproven, never as exposure', () => {
    // This is the expected shape AFTER the grants are revoked: the read fails,
    // which is good, but it still cannot prove the row count.
    const report = classifyExposure([
      { resource: 'guides', count: null, error: 'permission denied for view guides' },
    ])
    expect(report.ok).toBe(true)
    expect(report.exposed).toEqual([])
    expect(report.probeErrors).toEqual([
      { table: 'guides', error: 'permission denied for view guides' },
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
