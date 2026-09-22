// ============================================
// DEPARTURES GRID API  (stub)
// File: app/api/departures/grid/route.ts
//
// One row per departure of a template, priced at ITS OWN date through the
// engine and split into AIR / 燃油 / LND / 合計 per person. This is the machine
// behind the grid that replaces the office's hand-priced departure sheet — the
// sheet uses one flat land figure across every date; this prices each band for
// real. See handover/feature-specs/6-departures-grid-spec.md.
//
// STUB SCOPE: computes bands live from the engine and returns them. Two
// decisions are deliberately provisional and isolated so they are one edit to
// finalise once the operator signs off (both marked TODO below):
//   1. The AIR/LND allocation of the per-person GROSS (see allocateBand).
//   2. The FX source and rate (see resolveFx).
// Not yet wired: reading/writing the tour_departures cache columns
// (air_pp/land_pp/priced_at) from migration 20261030 — this stub always
// prices live. `?reprice=1` is accepted but currently a no-op distinction.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { calculateAutoPricing, ServiceTier } from '@/lib/auto-pricing-service'
import { getOrgDefaultMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { createServerClient } from '@/lib/supabase-server'
import {
  sumBuckets,
  assembleBand,
  convertAtRate,
  type BucketableLine,
  type DepartureBand,
} from '@/lib/pricing/departure-buckets'

// TODO(operator): confirm the office rate. The office prices internally at
// 160 JPY/USD, not the 157.15 live rate on file. Until it is a settable field,
// a `fx` query param overrides this and this is the default. Expressed as
// TARGET units per one RATE-currency unit (JPY per USD).
const DEFAULT_OFFICE_FX_JPY_PER_USD = 160
// The office quotes in JPY; the engine prices in the org's rate currency (USD
// for ATS). Until price_currency is a setting, the grid targets JPY.
const DEFAULT_TARGET_CURRENCY = 'JPY'

interface GridBand extends DepartureBand {
  departureId: string
  startDate: string
  endDate: string | null
  flightClass: string | null
  currency: string
  /** The engine's unpriced-hole kinds for this date, so the UI can say why a
   *  band is incomplete rather than showing a flat total. */
  holes: string[]
}

/**
 * PROVISIONAL allocation (TODO(operator/design)): the engine returns ONE
 * per-person gross for the trip, not an AIR figure and an LND figure. This
 * splits that gross in proportion to each bucket's share of GROUP cost — a
 * line's lineTotal is group cost, and the ratio is currency-agnostic, so this
 * is the same whether costs are in USD or JPY. It is a transparent first rule,
 * not necessarily how the office wants air carved out (e.g. they may want the
 * real ticket price in AIR and the remainder in LND). Keep it here, one place,
 * so finalising it is one function.
 */
function allocateBand(args: {
  services: readonly BucketableLine[]
  grossPerPersonTarget: number // engine per-person gross, already in target currency
  fuelPerPerson: number | null
  /** The office's manual AIR fare, per person, when they typed one. null → use
   *  the engine's estimate. LND is engine land either way, so a manual fare
   *  never double-counts against a flight the engine also priced. */
  airOverride: number | null
  incomplete: boolean
}): DepartureBand {
  const { air, land } = sumBuckets(args.services)
  const totalCost = air + land
  const airShare = totalCost > 0 ? air / totalCost : 0
  const engineAirPp = Math.round(args.grossPerPersonTarget * airShare)
  // Land is always the engine's land portion, so AIR + LND == the engine gross
  // when AIR is the engine estimate, and a manual AIR only replaces the air
  // estimate — it does not shift LND.
  const landPp = args.grossPerPersonTarget - engineAirPp
  const airPp = args.airOverride != null ? Math.round(args.airOverride) : engineAirPp
  return assembleBand({ airPp, fuelPp: args.fuelPerPerson, landPp, incomplete: args.incomplete })
}

/** TODO(operator): make FX a setting. For now: `fx` query param, else the
 *  office default; and no conversion when the rate currency already is the
 *  target. Returns target-per-source units. */
function resolveFx(rateCurrency: string, targetCurrency: string, override: string | null): number {
  if (rateCurrency === targetCurrency) return 1
  const parsed = override != null ? Number(override) : NaN
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return DEFAULT_OFFICE_FX_JPY_PER_USD
}

/**
 * GET /api/departures/grid?template_id=…
 *   &tier=…&num_pax=2&is_eur=false&language=English
 *   &target_currency=JPY&fx=160&reprice=1
 *
 * Returns one priced band per departure of the template, ordered by date.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('template_id')
    if (!templateId) {
      return NextResponse.json({ success: false, error: 'template_id is required' }, { status: 400 })
    }
    const tier = (searchParams.get('tier') || 'standard') as ServiceTier
    const numPax = parseInt(searchParams.get('num_pax') || '2', 10)
    const isEurPassport = searchParams.get('is_eur') === 'true' // ATS default: JP passports → false
    const language = searchParams.get('language') || 'English'
    const targetCurrency = searchParams.get('target_currency') || DEFAULT_TARGET_CURRENCY

    // Org context the engine needs: season premium (orgId), the currency its
    // rate tables are entered in (rateCurrency — NEVER omit, or it normalises to
    // EUR), and the org's default margin.
    const rateCurrency = await getOrgRateCurrency(createServerClient(), org_id)
    const marginPercent = resolveMarginPercent({
      requested: searchParams.get('margin_percent') != null ? Number(searchParams.get('margin_percent')) : null,
      orgDefault: await getOrgDefaultMargin(createServerClient(), org_id),
    })
    const fx = resolveFx(rateCurrency, targetCurrency, searchParams.get('fx'))

    // Bands = this template's departures, org-scoped, in date order.
    const { data: departures, error: depErr } = await supabase
      .from('tour_departures')
      .select('id, start_date, end_date, flight_class, fuel_surcharge_pp, air_pp, currency')
      .eq('org_id', org_id)
      .eq('template_id', templateId)
      .order('start_date', { ascending: true })

    if (depErr) {
      return NextResponse.json(
        { success: false, error: clientMessage(depErr, 'Could not load departures') },
        { status: 500 },
      )
    }

    // The B2B calculator — the app's quote surface — is keyed by variation, and
    // a template has one variation per tier. Resolve the variation matching the
    // grid's tier so each band can open a pre-filled quote. Null when the
    // template has no variation for this tier; the grid then disables its
    // "Create quote" action rather than linking nowhere. Scoped via the
    // org-owned template (tour_variations has no org_id of its own).
    const { data: variation } = await supabase
      .from('tour_variations')
      .select('id')
      .eq('template_id', templateId)
      .eq('tier', tier)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    const variationId = variation?.id ?? null

    const rows = departures ?? []
    const bands: GridBand[] = []

    // Price each departure at its own date. Sequential on purpose for a stub —
    // simple to reason about and to swap for the cache read later; if this
    // proves slow for many bands, batch it or serve the cache and reprice on
    // demand (spec §6).
    for (const dep of rows) {
      const result = await calculateAutoPricing({
        orgId: org_id,
        templateId,
        tier,
        numPax,
        isEurPassport,
        language,
        travelDate: dep.start_date,
        marginPercent,
        rateCurrency,
      })

      // Per-person gross for the requested pax basis, in the rate currency —
      // calculateAutoPricing was passed numPax, so pricePerPerson is already
      // for that basis.
      const grossPerPersonTarget = convertAtRate(result.pricePerPerson ?? 0, fx)

      const lines: BucketableLine[] = (result.services ?? []).map(s => ({
        serviceType: s.serviceType,
        amount: s.lineTotal, // GROUP cost — used only for the AIR/LND ratio
      }))

      const band = allocateBand({
        services: lines,
        grossPerPersonTarget,
        // Fuel is entered in the departure row's currency; the stub assumes the
        // office enters it in the target (JPY). TODO(operator): confirm.
        fuelPerPerson: dep.fuel_surcharge_pp == null ? null : Number(dep.fuel_surcharge_pp),
        // air_pp doubles as the office's manual AIR fare override (per person,
        // in the target currency). null → show the engine's estimate.
        airOverride: dep.air_pp == null ? null : Number(dep.air_pp),
        incomplete: !result.complete,
      })

      bands.push({
        ...band,
        departureId: dep.id,
        startDate: dep.start_date,
        endDate: dep.end_date ?? null,
        flightClass: dep.flight_class ?? null,
        currency: targetCurrency,
        holes: (result.holes ?? []).map(h => h.kind),
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        template_id: templateId,
        tier,
        num_pax: numPax,
        is_eur_passport: isEurPassport,
        rate_currency: rateCurrency,
        target_currency: targetCurrency,
        fx,
        margin_percent: marginPercent,
        variation_id: variationId,
        bands,
      },
    })
  } catch (error: any) {
    console.error('❌ Departures grid error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to build departures grid') },
      { status: 500 },
    )
  }
}
