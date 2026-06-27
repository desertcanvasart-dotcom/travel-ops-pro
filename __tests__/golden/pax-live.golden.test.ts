import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// LIVE golden-master harness (Phase 4) — DB-backed, OFF by default.
// Runs the real auto-pricing engine against real templates and writes the
// multi-pax rate sheet to a JSON artifact. Run it once on the CURRENT engine,
// once on the pre-refactor engine, and diff the two artifacts — identical output
// proves the priceAcrossPax swap is behavior-preserving on production data.
//
//   RUN_GOLDEN=1 GOLDEN_OUT=/abs/after.json npx vitest run __tests__/golden/pax-live.golden.test.ts
//
// Gated on RUN_GOLDEN so the normal suite never hits the network.

// Load .env.local into process.env BEFORE the engine module is imported (it
// builds its Supabase client at import time from process.env).
try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
} catch { /* env file optional */ }

const CASES = [
  { templateId: '43825182-6358-49e7-bdb2-d6c6ad368b74', label: 'CAI-MUL-555 std EUR m25',     tier: 'standard', isEurPassport: true,  marginPercent: 25 },
  { templateId: '43825182-6358-49e7-bdb2-d6c6ad368b74', label: 'CAI-MUL-555 std nonEUR m30',  tier: 'standard', isEurPassport: false, marginPercent: 30 },
  { templateId: 'c96c610f-2623-4976-b5ab-80c41c255d08', label: 'CAI-MUL-700 std EUR m25',     tier: 'standard', isEurPassport: true,  marginPercent: 25 },
  { templateId: 'c96c610f-2623-4976-b5ab-80c41c255d08', label: 'CAI-MUL-700 deluxe nonEUR m22', tier: 'deluxe',  isEurPassport: false, marginPercent: 22 },
] as const

describe.runIf(process.env.RUN_GOLDEN)('live — age-based (child/infant) margin applied once', () => {
  it('real template with children: effective markup equals the configured margin', async () => {
    const { calculatePricingWithPassengerBreakdown } = await import('@/lib/auto-pricing-service')
    const MARGIN = 25
    const res: any = await calculatePricingWithPassengerBreakdown({
      templateId: 'c96c610f-2623-4976-b5ab-80c41c255d08', // CAI-MUL-700
      tier: 'standard' as any,
      numPax: 5,
      passengers: { numAdults: 2, numChildren: 2, numInfants: 1 },
      isEurPassport: true,
      language: 'English',
      marginPercent: MARGIN,
      tourLeaderIncluded: false,
      flightCostPerPerson: 0,
    })
    expect(res.success).toBe(true)
    const markup = res.sellingPrice / res.totalCost
    console.log(`age-based live: totalCost=${res.totalCost} selling=${res.sellingPrice} markup=${markup.toFixed(4)} (want ${1 + MARGIN / 100})`)
    expect(markup).toBeCloseTo(1 + MARGIN / 100, 2)              // margin once, not squared (~1.5625)
    expect(res.pricePerPerson * res.numPayingPax).toBeCloseTo(res.sellingPrice, 0) // self-consistent
  }, 120_000)
})

describe.runIf(process.env.RUN_GOLDEN)('live golden-master — multi-pax rate sheet', () => {
  it('prices real templates and writes the rate-sheet artifact', async () => {
    const { calculateAutoPricing } = await import('@/lib/auto-pricing-service')
    const artifact: Record<string, unknown> = {}

    for (const c of CASES) {
      const res: any = await calculateAutoPricing({
        templateId: c.templateId,
        tier: c.tier as any,
        numPax: 2,
        isEurPassport: c.isEurPassport,
        language: 'English',
        marginPercent: c.marginPercent,
        mealPlan: 'lunch_only',
        includeAccommodation: true,
        tourLeaderIncluded: false,
      })
      expect(res.success).toBe(true)
      // The full 1..40 sheet + single supplement — the numbers under test.
      artifact[c.label] = {
        singleSupplement: res.singleSupplement,
        complete: res.complete,
        holeKinds: (res.holes ?? []).map((h: any) => h.kind).sort(),
        paxPricingTable: res.paxPricingTable,
      }
    }

    const out = process.env.GOLDEN_OUT || path.resolve(process.cwd(), '.golden-out.json')
    fs.writeFileSync(out, JSON.stringify(artifact, null, 2))
    console.log(`golden artifact written: ${out} (${CASES.length} cases)`)
  }, 120_000)
})
