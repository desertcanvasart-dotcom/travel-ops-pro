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
// The split (operator, 2026-10-01): LND is the engine's whole per-person gross,
// domestic flights included; AIR is the international fare the office types
// per class (economy, business, one-way business); 燃油 is one typed number.
// Each class gets its own total and website rate (lib/pricing/departure-buckets).
// Still provisional: the FX source and rate (see resolveFx).
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
  AIR_COLUMN,
  FLIGHT_CLASSES,
  WEB_COLUMN,
  classColumn,
  convertAtRate,
  type ClassColumn,
  type FlightClass,
} from '@/lib/pricing/departure-buckets'

// TODO(operator): confirm the office rate. The office prices internally at
// 160 JPY/USD, not the 157.15 live rate on file. Until it is a settable field,
// a `fx` query param overrides this and this is the default. Expressed as
// TARGET units per one RATE-currency unit (JPY per USD).
const DEFAULT_OFFICE_FX_JPY_PER_USD = 160
// The office quotes in JPY; the engine prices in the org's rate currency (USD
// for ATS). Until price_currency is a setting, the grid targets JPY.
const DEFAULT_TARGET_CURRENCY = 'JPY'

interface GridBand {
  departureId: string
  startDate: string
  endDate: string | null
  currency: string
  /** The date's own bookability — the grid is where a programme's dates are
   *  run, not only priced (seats sold, open/guaranteed/cancelled). */
  status: string
  maxPax: number
  minPax: number
  bookedPax: number
  /** 燃油, per person — one number whatever the class. Null = not entered. */
  fuelPp: number | null
  /** The engine's whole per-person gross for the date, domestic flights
   *  included (lib/pricing/departure-buckets). */
  landPp: number
  /** AIR / total / website rate for each class sold side by side. */
  classes: Record<FlightClass, ClassColumn>
  /** True when the engine reported unpriced holes for this date. */
  incomplete: boolean
  /** The engine's unpriced-hole kinds for this date, so the UI can say why a
   *  band is incomplete rather than showing a flat total. */
  holes: string[]
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
    // Guide mode: 'throughout' books one guide for the whole trip, 'spot' a
    // guide per touring day. Default spot (the common B2B case).
    const guideMode = searchParams.get('guide_mode') === 'throughout' ? 'throughout' : 'spot'
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
      .select('id, start_date, end_date, fuel_surcharge_pp, air_pp, air_business_pp, air_oneway_business_pp, web_price_economy, web_price_business, web_price_oneway_business, currency, status, max_pax, min_pax, booked_pax')
      .eq('org_id', org_id)
      .eq('template_id', templateId)
      .order('start_date', { ascending: true })

    if (depErr) {
      return NextResponse.json(
        { success: false, error: clientMessage(depErr, 'Could not load departures') },
        { status: 500 },
      )
    }

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
        guideMode,
        // The international fare is the AIR column, typed per class; the
        // engine must not charge it again inside LND.
        skipInternationalFlights: true,
      })

      // Per-person gross for the requested pax basis, in the target currency —
      // calculateAutoPricing was passed numPax, so pricePerPerson is already
      // for that basis. All of it is LND: the engine prices the ground
      // arrangements and domestic flights, never the international fare.
      const landPp = convertAtRate(result.pricePerPerson ?? 0, fx)
      // Fuel and the AIR fares are typed in the target currency (JPY).
      const fuelPp = dep.fuel_surcharge_pp == null ? null : Number(dep.fuel_surcharge_pp)
      const num = (v: unknown) => (v == null ? null : Number(v))
      const classes = Object.fromEntries(
        FLIGHT_CLASSES.map(c => [
          c,
          classColumn({
            landPp,
            fuelPp,
            airPp: num(dep[AIR_COLUMN[c]]),
            websiteTyped: num(dep[WEB_COLUMN[c]]),
          }),
        ]),
      ) as Record<FlightClass, ClassColumn>

      bands.push({
        departureId: dep.id,
        startDate: dep.start_date,
        endDate: dep.end_date ?? null,
        currency: targetCurrency,
        status: dep.status ?? 'open',
        maxPax: Number(dep.max_pax ?? 0),
        minPax: Number(dep.min_pax ?? 0),
        bookedPax: Number(dep.booked_pax ?? 0),
        fuelPp,
        landPp,
        classes,
        incomplete: !result.complete,
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
        language,
        guide_mode: guideMode,
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
