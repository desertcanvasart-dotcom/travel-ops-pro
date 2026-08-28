// ============================================
// GET /api/bookings/[id]/extras/catalog — what can be added to this trip
// ============================================
// Two lists, because there are two ways an option exists:
//
//   THIS PROGRAMME'S OPTIONS   the optional services on the tour variations of
//                              the template this trip was built from. The
//                              operator curates them per package, and each can
//                              carry its own selling price.
//   ADD-ONS                    entrance fees flagged is_addon — things that go
//                              with any trip. The flag has been in the schema
//                              for a long time with nothing to consume it.
//
// Both are PRE-FILLS. Every price is a suggestion the office can change before
// the option is offered, and anything that cannot be priced honestly comes
// back unpriced with the reason attached — never as zero.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { getOrgDefaultMargin, FALLBACK_MARGIN_PERCENT } from '@/lib/org-default-margin'
import { loadFxIndex } from '@/lib/fx-report'
import { convertOnDate } from '@/lib/fx-conversion'
import {
  priceCatalogItem,
  entranceFeeBasis,
  type CatalogItem,
  type Converter,
} from '@/lib/extras-catalog'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params

  const { data: booking } = await admin
    .from('bookings')
    .select('id, currency, itinerary_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const bookingCurrency = booking.currency || 'EUR'
  const [rateCurrency, orgMargin, fxIndex] = await Promise.all([
    getOrgRateCurrency(admin, orgId),
    getOrgDefaultMargin(admin, orgId),
    loadFxIndex(admin),
  ])
  const marginPercent = orgMargin ?? FALLBACK_MARGIN_PERCENT

  // Today's rate: a pre-fill is a quote being prepared now, not a historical
  // line being restated. Null when there is no rate, which the pricing turns
  // into an unpriced item rather than a guess.
  const convert: Converter = (amount, from, to) =>
    convertOnDate(fxIndex, amount, from, to, new Date().toISOString()).amount

  const price = (cost: unknown, sellingOverride: unknown) =>
    priceCatalogItem({ cost, sellingOverride, marginPercent, rateCurrency, bookingCurrency, convert })

  // ---------- this programme's own options ----------
  const packageItems: CatalogItem[] = []
  const templateId = await templateForBooking(booking.itinerary_id, orgId)
  if (templateId) {
    const { data: variations } = await admin
      .from('tour_variations')
      .select('id, variation_name, tier')
      .eq('template_id', templateId)

    const variationIds = (variations ?? []).map(v => v.id)
    if (variationIds.length) {
      const { data: services, error } = await admin
        .from('tour_variation_services')
        .select('id, variation_id, service_name, service_category, cost_per_unit, optional_price_override, notes')
        .in('variation_id', variationIds)
        .eq('is_optional', true)
      if (error) console.error('extras catalog: variation services', error)

      const variationById = new Map((variations ?? []).map(v => [v.id, v]))
      // The same option usually exists on every tier of a programme. The office
      // is choosing an option, not a tier, so it is listed once — by name, at
      // the first price found.
      const seen = new Set<string>()
      for (const s of services ?? []) {
        const key = String(s.service_name || '').trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)

        const priced = price(s.cost_per_unit, s.optional_price_override)
        const variation = variationById.get(s.variation_id)
        packageItems.push({
          source_kind: 'package_option',
          source_id: String(s.id),
          title: String(s.service_name),
          subtitle: [s.service_category, variation?.variation_name].filter(Boolean).join(' · ') || null,
          supplier_id: null,
          ...priced,
          currency: bookingCurrency,
        })
      }
    }
  }

  // ---------- add-ons that go with any trip ----------
  const addonItems: CatalogItem[] = []
  const { data: addons, error: addonError } = await admin
    .from('entrance_fees')
    .select('id, attraction_name, city, eur_rate, non_eur_rate, is_addon, is_active, addon_note, supplier_id')
    // NOT org-scoped, because entrance_fees has no org_id column — the rate
    // catalogue predates organisations and is shared, exactly as
    // /api/rates/attractions reads it. If that table is ever partitioned by
    // org, this query has to gain the filter with it.
    .eq('is_addon', true)
  if (addonError) console.error('extras catalog: entrance fee add-ons', addonError)

  for (const a of addons ?? []) {
    if (a.is_active === false) continue
    const { cost, basis } = entranceFeeBasis(a)
    const priced = price(cost, null)
    addonItems.push({
      source_kind: 'entrance_fee',
      source_id: String(a.id),
      title: String(a.attraction_name),
      subtitle: [a.city, a.addon_note].filter(Boolean).join(' · ') || null,
      supplier_id: a.supplier_id ?? null,
      ...priced,
      // The basis matters: a booking does not record passport type, so the
      // office has to be told which rate this price came from.
      price_note: basis ? `${basis}, ${priced.price_note}` : priced.price_note,
      currency: bookingCurrency,
    })
  }

  return NextResponse.json({
    currency: bookingCurrency,
    rate_currency: rateCurrency,
    margin_percent: marginPercent,
    groups: [
      { source: 'package', label: 'Options in this programme', items: packageItems },
      { source: 'addon', label: 'Add-ons', items: addonItems },
    ].filter(g => g.items.length > 0),
  })
}

/** The tour template this trip was built from, if it was built from one. */
async function templateForBooking(
  itineraryId: string | null | undefined,
  orgId: string
): Promise<string | null> {
  if (!itineraryId) return null
  const { data } = await admin
    .from('itineraries')
    .select('template_id')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data?.template_id ?? null
}
