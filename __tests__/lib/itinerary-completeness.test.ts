// An itinerary with services that have no cost must not reach a client by
// default — by email, WhatsApp, or a share link.
//
// #448 stopped an incomplete QUOTE leaving. But a quote converts into an
// itinerary, and the itinerary's email, WhatsApp and share link still checked
// only that its total was a positive number, so the gap walked out through
// the itinerary instead. An itinerary's services are editable rows, so
// completeness is read from them: no rate and no cost is a gap, which is the
// app's standing rule for a blank rate, and filling in the cost clears it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { itineraryCompleteness, itineraryServiceLines } from '@/lib/pricing/itinerary-completeness'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { serviceLineForItinerary } from '@/lib/itineraries/template-days'

const priced = { service_name: 'English Speaking Guide', rate_eur: 38.42, total_cost: 38.42, notes: '' }
const noCost = { service_name: 'Hotel (Abu Simbel)', rate_eur: 0, total_cost: 0, notes: 'No rate: No deluxe hotel rate for "Abu Simbel".' }

describe('itineraryCompleteness', () => {
  it('a service with no rate and no cost is a gap, named on its day with the reason', () => {
    const r = itineraryCompleteness([{ day_number: 2, services: [priced] }, { day_number: 6, services: [noCost] }])
    expect(r.complete).toBe(false)
    expect(r.gaps).toHaveLength(1)
    expect(r.gaps[0]).toMatchObject({ name: 'Hotel (Abu Simbel)', day: 6 })
    expect(r.gaps[0].issue).toMatch(/Fill it in on the itinerary/)
    expect(r.gaps[0].issue).toMatch(/Abu Simbel/)
  })

  it('entering a cost on the itinerary clears it — the rate may stay 0', () => {
    expect(itineraryCompleteness([{ day_number: 6, services: [{ ...noCost, total_cost: 180 }] }]).complete).toBe(true)
  })

  it('an itinerary with no days or services is not blocked by this rule', () => {
    expect(itineraryCompleteness([]).complete).toBe(true)
    expect(itineraryCompleteness(null).complete).toBe(true)
    expect(itineraryServiceLines([{ day_number: 1, services: null }])).toEqual([])
  })
})

describe('a quote gap survives conversion into the itinerary', () => {
  it('an unpriced quote line becomes a zero row that still reads as a gap, carrying why', () => {
    const row = serviceLineForItinerary(
      { service_id: 'day6-hotel', service_name: 'Hotel (Abu Simbel)', service_category: 'accommodation', quantity: 1, quantity_mode: 'per_pax', unit_cost: 0, line_total: 0, day_number: 6, unpriced: true, issue: 'No deluxe hotel rate for "Abu Simbel". Add it in Rates → Hotels.' },
      { dayId: 'd6', pax: 2, marginPercent: 30, currency: 'USD' },
    )
    expect(row.total_cost).toBe(0)
    expect(row.rate_eur).toBe(0)
    expect(row.notes).toMatch(/^No rate: No deluxe hotel rate for "Abu Simbel"/)
    expect(itineraryCompleteness([{ day_number: 6, services: [row] }]).complete).toBe(false)
  })

  it('a priced quote line converts to a row that is not a gap', () => {
    const row = serviceLineForItinerary(
      { service_id: 'day2-guide', service_name: 'Guide', service_category: 'guide', quantity: 1, quantity_mode: 'fixed', unit_cost: 38.42, line_total: 38.42, day_number: 2 },
      { dayId: 'd2', pax: 2, marginPercent: 30, currency: 'USD' },
    )
    expect(itineraryCompleteness([{ day_number: 2, services: [row] }]).complete).toBe(true)
  })
})

describe('the delivery gate reads the itinerary lines', () => {
  const lines = itineraryServiceLines([{ day_number: 6, services: [noCost] }])

  it('refuses, as an overridable refusal', () => {
    const r = checkAmountDeliverable(2142.26, { currency: 'USD', servicesSnapshot: lines })
    expect(r).toMatchObject({ ok: false, incomplete: true })
  })

  it('goes ahead only on an explicit yes', () => {
    expect(checkAmountDeliverable(2142.26, { currency: 'USD', servicesSnapshot: lines, allowIncomplete: true }).ok).toBe(true)
  })
})

describe('every path an itinerary reaches a client by checks its services', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  for (const path of [
    'app/api/send-email/route.ts',
    'app/api/whatsapp/send-quote/route.ts',
    'app/api/itineraries/[id]/share/route.ts',
    'app/api/pdf/generate/route.ts',
  ]) {
    it(`${path} loads the itinerary's own services and reads the override explicitly`, () => {
      const s = src(path)
      expect(s).toContain('loadItineraryServiceLines(')
      expect(s).toMatch(/allowIncomplete: allowsIncomplete\(/)
    })
  }

  it('the server PDF checks the STORED services, not the days the caller posted', () => {
    const s = src('app/api/pdf/generate/route.ts')
    expect(s).toMatch(/loadItineraryServiceLines\(pdfDb, String\(itinerary\.id\)/)
  })

  it('supplier paperwork is deliberately not blocked: an unpriced hotel still has to be booked', () => {
    expect(src('app/api/itineraries/[id]/generate-documents/route.ts')).not.toContain('loadItineraryServiceLines(')
  })

  it('the share card never passes its click event as the override', () => {
    expect(src('app/components/ShareLinkCard.tsx')).not.toMatch(/onClick=\{create\}/)
  })

  it('the itinerary page sends the override only after asking', () => {
    const s = src('app/itineraries/[id]/page.tsx')
    expect(s.match(/const decision = await confirmIncompleteSend\(days\)/g)).toHaveLength(2)
    expect(s.match(/let response = await send\(decision === 'go'\)/g)).toHaveLength(2)
  })

  it('a gap the server finds but the page did not know about still asks, then retries', () => {
    // Review of #449: someone adds a zero-cost service after the page loads.
    // The page's own check passes, the server refuses — and the send must not
    // dead-end on an error.
    const s = src('app/itineraries/[id]/page.tsx')
    expect(s.match(/if \(response\.status === 422 && data\.incomplete && decision !== 'go'\) \{\s*if \(!\(await confirmServerIncomplete\(data\)\)\) return\s*response = await send\(true\)/g)).toHaveLength(2)
  })

  it('every delivery route fails CLOSED when the services cannot be read', () => {
    // Review of #449: a lookup that returned "no lines" on a database error let
    // the gate fall back to the amount-only check.
    for (const path of ['app/api/send-email/route.ts', 'app/api/whatsapp/send-quote/route.ts', 'app/api/itineraries/[id]/share/route.ts', 'app/api/pdf/generate/route.ts']) {
      const s = src(path)
      expect(s, path).toMatch(/if \(!loaded\.ok\) \{/)
      expect(s, path).toContain('servicesSnapshot: loaded.lines')
      expect(s, path).not.toMatch(/\.\.\.\(lines \? \{ servicesSnapshot/)
    }
  })
})

describe('loadItineraryServiceLines fails closed', () => {
  // A minimal stand-in for the two queries it makes.
  const client = (opts: { ownedError?: boolean; owned?: boolean; daysError?: boolean; days?: unknown[] }) => ({
    from(table: string) {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => ({ data: opts.owned === false ? null : { id: 'it-1' }, error: opts.ownedError ? { message: 'boom' } : null })
      if (table === 'itinerary_days') {
        chain.eq = async () => ({ data: opts.days ?? [], error: opts.daysError ? { message: 'boom' } : null })
      }
      return chain
    },
  }) as any

  it('a database error on either query is a refusal, never "no gaps"', async () => {
    const { loadItineraryServiceLines } = await import('@/lib/pricing/itinerary-completeness')
    expect(await loadItineraryServiceLines(client({ ownedError: true }), 'it-1', 'org-1')).toMatchObject({ ok: false, status: 503 })
    expect(await loadItineraryServiceLines(client({ daysError: true }), 'it-1', 'org-1')).toMatchObject({ ok: false, status: 503 })
  })

  it('an itinerary outside the org, or no org, is not found', async () => {
    const { loadItineraryServiceLines } = await import('@/lib/pricing/itinerary-completeness')
    expect(await loadItineraryServiceLines(client({ owned: false }), 'it-1', 'org-1')).toMatchObject({ ok: false, status: 404 })
    expect(await loadItineraryServiceLines(client({}), 'it-1', null)).toMatchObject({ ok: false, status: 404 })
  })

  it('a readable itinerary returns its lines', async () => {
    const { loadItineraryServiceLines } = await import('@/lib/pricing/itinerary-completeness')
    const r = await loadItineraryServiceLines(client({ days: [{ day_number: 6, services: [noCost] }] }), 'it-1', 'org-1')
    expect(r.ok).toBe(true)
    expect(r.ok && r.lines[0].unpriced).toBe(true)
  })
})
