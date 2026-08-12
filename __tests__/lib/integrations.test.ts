import { describe, it, expect } from 'vitest'
import { genericAdapter } from '@/lib/integrations/adapters/generic'
import { sawaAdapter } from '@/lib/integrations/adapters/sawa'
import { getAdapter, resolveAdapter, listAdapters } from '@/lib/integrations/registry'
import {
  hashApiKey,
  issueApiKey,
  bearerToken,
  safeEqual,
  signWebhookBody,
  verifyWebhookSignature,
  generateInboundSecret,
  generateEndpointToken,
} from '@/lib/integrations/credentials'
import { planDepartureSync, type ExistingDeparture } from '@/lib/integrations/departure-sync'
import { IntegrationError } from '@/lib/integrations/types'

// ============================================
// This is the surface partners integrate against, and it is sold to operators
// on different platforms — so the invariants under test are the ones that hold
// regardless of who is on the other end:
//
//   * an unverified body is never trusted
//   * a retried delivery never duplicates
//   * a partner's malformed row never rejects the whole batch
//   * a sync never adopts a departure the operator maintains
// ============================================

const CTX = { orgId: 'org-1', integrationId: 'int-1', syncedAt: '2026-08-12T10:00:00.000Z' }

const canonical = (over: Record<string, unknown> = {}) => ({
  external_id: 'DEP-1',
  tour_name: 'Nile Cruise 8D',
  start_date: '2026-11-02',
  end_date: '2026-11-09',
  max_pax: 24,
  booked_pax: 10,
  ...over,
})

describe('generic adapter — the contract we hand any partner', () => {
  it('normalizes the documented payload', () => {
    const { delivery, issues } = genericAdapter.normalizeInbound(
      { event_id: 'evt_1', departures: [canonical()] },
      {}
    )
    expect(issues).toEqual([])
    expect(delivery.event_id).toBe('evt_1')
    expect(delivery.departures[0]).toMatchObject({
      external_id: 'DEP-1',
      start_date: '2026-11-02',
      end_date: '2026-11-09',
      max_pax: 24,
      booked_pax: 10,
    })
  })

  it('accepts a bare array, and the data/items/results envelopes', () => {
    for (const body of [
      [canonical()],
      { data: [canonical()] },
      { items: [canonical()] },
      { results: [canonical()] },
    ]) {
      const { delivery } = genericAdapter.normalizeInbound(body, {})
      expect(delivery.departures).toHaveLength(1)
    }
  })

  it('derives end_date from duration — duration 1 is a same-day trip', () => {
    const { delivery } = genericAdapter.normalizeInbound(
      { departures: [canonical({ end_date: undefined, duration_days: 8 })] },
      {}
    )
    // 8 days starting the 2nd ends on the 9th, not the 10th.
    expect(delivery.departures[0].end_date).toBe('2026-11-09')

    const sameDay = genericAdapter.normalizeInbound(
      { departures: [canonical({ end_date: undefined, duration_days: 1 })] },
      {}
    )
    expect(sameDay.delivery.departures[0].end_date).toBe('2026-11-02')
  })

  it('does not shift a date across a timezone boundary', () => {
    // A departure on the 2nd must not become the 1st because the server sits
    // west of the partner.
    const { delivery } = genericAdapter.normalizeInbound(
      { departures: [canonical({ start_date: '2026-11-02T00:30:00Z' })] },
      {}
    )
    expect(delivery.departures[0].start_date).toBe('2026-11-02')
  })

  it('derives a status but never invents a commitment', () => {
    const open = genericAdapter.normalizeInbound(
      { departures: [canonical({ status: undefined, max_pax: 24, booked_pax: 2 })] },
      {}
    )
    expect(open.delivery.departures[0].status).toBe('open')

    const full = genericAdapter.normalizeInbound(
      { departures: [canonical({ status: undefined, max_pax: 24, booked_pax: 24 })] },
      {}
    )
    expect(full.delivery.departures[0].status).toBe('full')

    const limited = genericAdapter.normalizeInbound(
      { departures: [canonical({ status: undefined, max_pax: 24, booked_pax: 22 })] },
      {}
    )
    expect(limited.delivery.departures[0].status).toBe('limited')

    // 'cancelled' and 'guaranteed' are promises only the partner can make.
    for (const r of [open, full, limited]) {
      expect(['cancelled', 'guaranteed']).not.toContain(r.delivery.departures[0].status)
    }
  })

  it('keeps one bad row from rejecting the batch', () => {
    const { delivery, issues } = genericAdapter.normalizeInbound(
      {
        departures: [
          canonical({ external_id: 'GOOD-1' }),
          canonical({ external_id: undefined }), // no id to upsert on
          canonical({ external_id: 'BAD-2', start_date: 'not-a-date' }),
          canonical({ external_id: 'GOOD-2' }),
        ],
      },
      {}
    )
    expect(delivery.departures.map(d => d.external_id)).toEqual(['GOOD-1', 'GOOD-2'])
    expect(issues).toHaveLength(2)
    expect(issues[0].message).toMatch(/external_id/)
    expect(issues[1].external_id).toBe('BAD-2')
  })

  it('rejects an end_date before the start, and a bad currency', () => {
    const { issues } = genericAdapter.normalizeInbound(
      {
        departures: [
          canonical({ external_id: 'A', start_date: '2026-11-09', end_date: '2026-11-02' }),
          canonical({ external_id: 'B', currency: 'EUROS' }),
        ],
      },
      {}
    )
    expect(issues).toHaveLength(2)
    expect(issues[0].message).toMatch(/before/)
    expect(issues[1].message).toMatch(/3-letter/)
  })

  it('throws only when the body as a whole is unusable', () => {
    expect(() => genericAdapter.normalizeInbound('nope', {})).toThrow(IntegrationError)
    expect(() => genericAdapter.normalizeInbound({ nothing: true }, {})).toThrow(/departures array/)
  })
})

describe('sawa adapter — a partner dialect', () => {
  const trip = (over: Record<string, unknown> = {}) => ({
    trip_id: 'SAWA-77',
    product_name: 'Pooled Nile Cruise',
    product_code: 'SW-NILE',
    departs_on: '2026-11-02',
    nights: 7,
    seats_total: 40,
    seats_remaining: 12,
    state: 'selling',
    price_pp: 990,
    currency: 'eur',
    ...over,
  })

  it('converts seats REMAINING into seats booked', () => {
    // The trap: copying seats_remaining into booked_pax inverts the mirror, so
    // a nearly-full departure reads as nearly empty and we keep selling it.
    const { delivery } = sawaAdapter.normalizeInbound({ trips: [trip()] }, {})
    const d = delivery.departures[0]
    expect(d.max_pax).toBe(40)
    expect(d.booked_pax).toBe(28) // 40 − 12, NOT 12
  })

  it('converts nights to days', () => {
    const { delivery } = sawaAdapter.normalizeInbound({ trips: [trip()] }, {})
    expect(delivery.departures[0].duration_days).toBe(8)
    expect(delivery.departures[0].end_date).toBe('2026-11-09')
  })

  it('maps their status vocabulary onto ours', () => {
    const cases: Array<[string, string]> = [
      ['selling', 'open'],
      ['waitlist', 'full'],
      ['closed', 'full'],
      ['guaranteed', 'guaranteed'],
      ['cancelled', 'cancelled'],
    ]
    for (const [theirs, ours] of cases) {
      const { delivery } = sawaAdapter.normalizeInbound({ trips: [trip({ state: theirs })] }, {})
      expect(delivery.departures[0].status, theirs).toBe(ours)
    }
  })

  it('falls back to a derived status for a word it does not know', () => {
    const { delivery } = sawaAdapter.normalizeInbound(
      { trips: [trip({ state: 'reticulating', seats_remaining: 1 })] },
      {}
    )
    expect(delivery.departures[0].status).toBe('limited')
  })

  it('reports incoherent seat maths instead of writing a negative', () => {
    const { delivery, issues } = sawaAdapter.normalizeInbound(
      { trips: [trip({ seats_total: 10, seats_remaining: 25 })] },
      {}
    )
    expect(delivery.departures).toHaveLength(0)
    expect(issues[0].message).toMatch(/exceeds/)
  })

  it('applies the operator’s tour-code mapping from settings', () => {
    const { delivery } = sawaAdapter.normalizeInbound(
      { trips: [trip()] },
      { tour_code_map: { 'SW-NILE': 'NILE8' } }
    )
    expect(delivery.departures[0].tour_code).toBe('NILE8')
  })

  it('passes an unmapped code through unchanged', () => {
    const { delivery } = sawaAdapter.normalizeInbound({ trips: [trip()] }, { tour_code_map: {} })
    expect(delivery.departures[0].tour_code).toBe('SW-NILE')
  })
})

describe('registry', () => {
  it('resolves known slugs, case-insensitively', () => {
    expect(getAdapter('sawa')?.slug).toBe('sawa')
    expect(getAdapter('  SAWA ')?.slug).toBe('sawa')
    expect(getAdapter('nope')).toBeNull()
  })

  it('falls back to generic for an unknown provider, and says it did', () => {
    // A renamed or removed adapter must not start rejecting a partner's live
    // traffic — but the fallback has to be visible, not silent.
    const { adapter, fellBack } = resolveAdapter('platform-that-left')
    expect(adapter.slug).toBe('generic')
    expect(fellBack).toBe(true)

    expect(resolveAdapter('sawa').fellBack).toBe(false)
  })

  it('exposes every adapter to the connection UI', () => {
    const slugs = listAdapters().map(a => a.slug)
    expect(slugs).toContain('generic')
    expect(slugs).toContain('sawa')
    expect(listAdapters().every(a => a.label && a.description)).toBe(true)
  })
})

describe('credentials', () => {
  it('issues a key whose plaintext is never derivable from what we store', () => {
    const key = issueApiKey()
    expect(key.plaintext.startsWith('tops_live_')).toBe(true)
    expect(key.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(key.hash).not.toContain(key.plaintext)
    expect(key.plaintext).not.toContain(key.hash)
    // The stored prefix identifies the key without reconstructing it.
    expect(key.plaintext.startsWith(key.prefix)).toBe(true)
    expect(key.prefix.length).toBeLessThan(key.plaintext.length / 2)
  })

  it('issues a different key every time', () => {
    const keys = new Set(Array.from({ length: 50 }, () => issueApiKey().plaintext))
    expect(keys.size).toBe(50)
  })

  it('hashes deterministically, so lookup by hash works', () => {
    const key = issueApiKey()
    expect(hashApiKey(key.plaintext)).toBe(key.hash)
    expect(hashApiKey(` ${key.plaintext} `)).toBe(key.hash) // pasted with whitespace
    expect(hashApiKey(`${key.plaintext}x`)).not.toBe(key.hash)
  })

  it('parses Bearer headers and rejects other schemes', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123')
    expect(bearerToken('bearer   abc123  ')).toBe('abc123')
    expect(bearerToken('Basic abc123')).toBeNull()
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken('')).toBeNull()
  })

  it('compares safely regardless of length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    // Must not throw on a length mismatch — the throw is itself a timing signal.
    expect(() => safeEqual('a', 'a-much-longer-string')).not.toThrow()
    expect(safeEqual('a', 'a-much-longer-string')).toBe(false)
  })
})

describe('webhook signature verification', () => {
  const secret = 'whsec_test_secret'
  const body = JSON.stringify({ departures: [canonical()] })

  it('accepts a correct signature', () => {
    expect(verifyWebhookSignature(body, signWebhookBody(body, secret), secret).valid).toBe(true)
  })

  it('accepts a bare hex digest as well as the sha256= form', () => {
    const sig = signWebhookBody(body, secret)
    expect(verifyWebhookSignature(body, sig.replace('sha256=', ''), secret).valid).toBe(true)
  })

  it('rejects a body altered by even one character', () => {
    const sig = signWebhookBody(body, secret)
    const tampered = body.replace('"booked_pax":10', '"booked_pax":0')
    expect(verifyWebhookSignature(tampered, sig, secret).valid).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    const sig = signWebhookBody(body, 'whsec_someone_elses')
    expect(verifyWebhookSignature(body, sig, secret).valid).toBe(false)
  })

  it('FAILS CLOSED when the integration has no secret', () => {
    // Accepting unverified writes to a shared departures calendar is worse than
    // a broken integration.
    const check = verifyWebhookSignature(body, signWebhookBody(body, secret), null)
    expect(check.valid).toBe(false)
    expect(check.reason).toMatch(/no inbound secret/)
  })

  it('rejects a missing or malformed signature header', () => {
    expect(verifyWebhookSignature(body, null, secret).valid).toBe(false)
    expect(verifyWebhookSignature(body, 'sha256=zzzz', secret).reason).toMatch(/hex digest/)
  })

  it('binds the timestamp into the signature and refuses a stale one', () => {
    const now = Date.parse('2026-08-12T10:00:00Z')
    const ts = String(Math.floor(now / 1000))
    const sig = signWebhookBody(body, secret, ts)

    expect(
      verifyWebhookSignature(body, sig, secret, { timestamp: ts, toleranceSeconds: 300, now }).valid
    ).toBe(true)

    // Same captured delivery, replayed an hour later.
    const later = now + 3_600_000
    const stale = verifyWebhookSignature(body, sig, secret, {
      timestamp: ts,
      toleranceSeconds: 300,
      now: later,
    })
    expect(stale.valid).toBe(false)
    expect(stale.reason).toMatch(/old/)
  })

  it('cannot be replayed by swapping in a fresh timestamp', () => {
    const now = Date.parse('2026-08-12T10:00:00Z')
    const originalTs = String(Math.floor(now / 1000))
    const sig = signWebhookBody(body, secret, originalTs)
    const freshTs = String(Math.floor((now + 3_600_000) / 1000))

    // The timestamp is part of the signed payload, so changing it breaks the
    // signature rather than renewing it.
    expect(
      verifyWebhookSignature(body, sig, secret, {
        timestamp: freshTs,
        toleranceSeconds: 300,
        now: now + 3_600_000,
      }).valid
    ).toBe(false)
  })

  it('generates distinct inbound secrets', () => {
    expect(generateInboundSecret()).not.toBe(generateInboundSecret())
    expect(generateInboundSecret().startsWith('whsec_')).toBe(true)
  })
})

describe('endpoint tokens (replacing the org header)', () => {
  it('is unguessable and unique per connection', () => {
    // A partner never receives our org id: it is identical across every
    // connection, ends up in their logs and config, and invites probing other
    // endpoints with it.
    const tokens = new Set(Array.from({ length: 200 }, () => generateEndpointToken()))
    expect(tokens.size).toBe(200)
    expect(generateEndpointToken().startsWith('ep_')).toBe(true)
  })

  it('carries enough entropy that endpoints cannot be enumerated', () => {
    // 16 random bytes → 22 base64url chars. It routes rather than authenticates,
    // but a guessable endpoint would reveal which connections exist.
    const token = generateEndpointToken().slice('ep_'.length)
    expect(token.length).toBeGreaterThanOrEqual(20)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('looks nothing like a UUID, so it cannot be mistaken for an internal id', () => {
    expect(generateEndpointToken()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    )
  })
})

describe('departure sync planning', () => {
  const existing = (over: Partial<ExistingDeparture> = {}): ExistingDeparture => ({
    id: 'row-1',
    external_id: 'DEP-1',
    source_integration_id: 'int-1',
    externally_managed: true,
    booked_pax: 10,
    max_pax: 24,
    status: 'open',
    ...over,
  })

  it('inserts a departure it has not seen', () => {
    const plan = planDepartureSync([canonical()], [], CTX)
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].values).toMatchObject({
      org_id: 'org-1',
      source_integration_id: 'int-1',
      external_id: 'DEP-1',
      externally_managed: true,
      booked_pax: 10,
    })
  })

  it('updates when the partner reports different seats', () => {
    const plan = planDepartureSync([canonical({ booked_pax: 18 })], [existing()], CTX)
    expect(plan.inserts).toHaveLength(0)
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].id).toBe('row-1')
    expect(plan.updates[0].values.booked_pax).toBe(18)
  })

  it('does not churn a row that has not changed', () => {
    const plan = planDepartureSync([canonical()], [existing()], CTX)
    expect(plan.updates).toHaveLength(0)
    expect(plan.unchanged).toEqual(['DEP-1'])
  })

  it('is idempotent — a retried delivery produces no second row', () => {
    const first = planDepartureSync([canonical()], [], CTX)
    expect(first.inserts).toHaveLength(1)

    // Replay after the insert landed.
    const second = planDepartureSync([canonical()], [existing()], CTX)
    expect(second.inserts).toHaveLength(0)
    expect(second.updates).toHaveLength(0)
  })

  it('REFUSES to adopt a locally-managed departure', () => {
    // Adopting it would hand a row the operator maintains to a partner, whose
    // next sync would overwrite their edits.
    const local = existing({ id: 'local-1', source_integration_id: null, externally_managed: false })
    const plan = planDepartureSync([canonical()], [local], CTX)

    expect(plan.inserts).toHaveLength(0)
    expect(plan.updates).toHaveLength(0)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0].reason).toMatch(/locally-managed/)
  })

  it('REFUSES to steal a departure mirrored from a different partner', () => {
    const other = existing({ id: 'other-1', source_integration_id: 'int-2' })
    const plan = planDepartureSync([canonical()], [other], CTX)
    expect(plan.conflicts[0].reason).toMatch(/different integration/)
    expect(plan.inserts).toHaveLength(0)
  })

  it('collapses a duplicated external_id within one delivery, last wins', () => {
    const plan = planDepartureSync(
      [canonical({ booked_pax: 5 }), canonical({ booked_pax: 9 })],
      [],
      CTX
    )
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].values.booked_pax).toBe(9)
  })

  it('stamps every mirrored row so a stale mirror is detectable', () => {
    const plan = planDepartureSync([canonical()], [], CTX)
    expect(plan.inserts[0].values.external_synced_at).toBe(CTX.syncedAt)
  })

  it('handles an empty delivery without inventing work', () => {
    const plan = planDepartureSync([], [existing()], CTX)
    expect(plan).toEqual({ inserts: [], updates: [], conflicts: [], unchanged: [] })
  })
})
