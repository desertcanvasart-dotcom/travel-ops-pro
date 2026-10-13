// Rates API Endpoint
// Location: /app/api/rates/route.ts
// Updated to pull from actual resource management tables

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { getOrgRateCurrency, normaliseRateCurrency } from '@/lib/org-rate-currency'
import { createRateNormalizer, type RateCurrencyTable } from '@/lib/rates/rate-currency'
import { selectAllRows } from '@/lib/db/select-all-rows'

// Which rate table each ?type= reads, for the in_org_currency conversion below.
// Types missing here (guide = a VIEW over suppliers, service_fee) carry no
// per-row currency and pass through unchanged.
const TYPE_TABLE: Record<string, RateCurrencyTable> = {
  accommodation: 'accommodation_rates',
  meal: 'meal_rates',
  entrance: 'entrance_fees',
  transportation: 'transportation_rates',
  airport_staff: 'airport_staff_rates',
  hotel_staff: 'hotel_staff_rates',
  cruises: 'nile_cruises',
  sleeping_trains: 'sleeping_train_rates',
  trains: 'train_rates',
  tipping: 'tipping_rates',
}

type Order = { column: string; ascending?: boolean }[]

/** The transportation hub row. Keeps `id`: the in_org_currency path below
 *  matches the normaliser's misses by it, and without it an unconvertible
 *  row came back labelled as converted ('undefined' never equals a miss). */
export function transportHubRow(rate: any) {
  return {
    id: rate.id,
    service_code: rate.service_code || rate.id,
    // The row's own entry currency — a transform must not strip it
    // (the attractions round-trip bug, one route over).
    rate_currency: rate.rate_currency ?? null,
    service_type: rate.service_type,
    city: rate.city,
    origin_city: rate.origin_city,
    destination_city: rate.destination_city,
    supplier_name: rate.supplier_name,
    notes: rate.notes,
    includes: rate.includes,
    // The vehicles list (lib/rates/vehicle-bands) — every vehicle the
    // row prices, the agency's own included, is here and nowhere else.
    vehicles: rate.vehicles ?? null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const city = searchParams.get('city')

    if (!type) {
      return NextResponse.json(
        { success: false, error: 'Type parameter is required' },
        { status: 400 }
      )
    }

    // Each type names a fresh query and its order; every row is then read
    // past PostgREST's 1000-row cap (lib/db/select-all-rows) — the hub's tab
    // counts, "Total Services" and "Cities" stopped silently at a thousand.
    let build: () => any
    let order: Order = []
    let transform: ((row: any) => any) | null = null

    switch (type) {
      case 'accommodation':
        // The RATE table, not hotel_contacts. This used to read the supplier
        // CONTACT directory and hand back each entry as a rate priced at
        // base_rate_eur: 0 — so the rates hub counted 13 "hotels" that were
        // really contact cards, while the hotels rate page (which reads this
        // table) correctly showed none. Two screens, two answers, and the
        // fabricated zeros looked like real prices.
        build = () => {
          const q = supabase.from('accommodation_rates').select('*').eq('org_id', orgId).eq('is_active', true)
          return city ? q.ilike('city', city) : q
        }
        break

      case 'meal':
        // The RATE table, not restaurant_contacts — see the note above. The
        // 26 "meals" the hub listed were the restaurant contact directory,
        // every one of them priced at zero.
        build = () => {
          const q = supabase.from('meal_rates').select('*').eq('org_id', orgId).eq('is_active', true)
          return city ? q.ilike('city', city) : q
        }
        break

      case 'entrance':
        // Every entrance fee, inactive included (the hub lists both).
        build = () => {
          const q = supabase.from('entrance_fees').select('*').eq('org_id', orgId)
          return city ? q.eq('city', city) : q
        }
        break

      case 'transportation':
        // One row per service with tiered vehicle rates.
        build = () => {
          const q = supabase.from('transportation_rates').select('*').eq('org_id', orgId).eq('is_active', true)
          return city ? q.eq('city', city) : q
        }
        order = [{ column: 'city' }, { column: 'service_type' }]
        transform = transportHubRow
        break

      case 'guide':
        // The RATE table, not the guides supplier view. The view has no
        // language or price on it (languages/daily_rate are null on every
        // row), so this hub showed each guide as 'English' at 0 while the
        // guide rates page — and the pricing engine — read guide_rates with
        // the real language and rate. Same class as the accommodation fix
        // above: two screens, two answers.
        build = () => {
          const q = supabase.from('guide_rates').select('*').eq('org_id', orgId).eq('is_active', true)
          return city ? q.ilike('city', city) : q
        }
        break

      case 'service':
      case 'service_fee':
        build = () => supabase.from('service_fees').select('*').eq('org_id', orgId).eq('is_active', true)
        break

      // ============================================
      // NEW RATE TYPES
      // ============================================

      case 'airport_staff':
        build = () => supabase.from('airport_staff_rates').select('*').eq('org_id', orgId).eq('is_active', true)
        order = [{ column: 'airport_code' }, { column: 'service_type' }]
        break

      case 'hotel_staff':
        build = () => supabase.from('hotel_staff_rates').select('*').eq('org_id', orgId).eq('is_active', true)
        order = [{ column: 'service_type' }, { column: 'hotel_category' }]
        break

      case 'cruises':
        build = () => supabase.from('nile_cruises').select('*').eq('org_id', orgId).eq('is_active', true)
        order = [{ column: 'ship_name' }, { column: 'cabin_type' }]
        break

      case 'sleeping_trains':
        // The rate names WHICH train it prices; the hub could not show it.
        build = () => supabase.from('sleeping_train_rates').select('*, supplier_properties(name)').eq('org_id', orgId).eq('is_active', true)
        order = [{ column: 'origin_city' }, { column: 'destination_city' }]
        break

      case 'trains':
        // The rate names WHICH train it prices; the hub could not show it.
        build = () => supabase.from('train_rates').select('*, supplier_properties(name)').eq('org_id', orgId).eq('is_active', true)
        order = [{ column: 'origin_city' }, { column: 'destination_city' }]
        break

      case 'tipping':
        build = () => supabase.from('tipping_rates').select('*').eq('org_id', orgId).eq('is_active', true)
        order = [{ column: 'role_type' }, { column: 'context' }]
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type parameter' },
          { status: 400 }
        )
    }

    const result = await selectAllRows<any>(build, { order: [...order, { column: 'id' }] })

    if (result.error) {
      // A failed read is an error, not "no rates": answering success with []
      // made the hub show 0 for the category, indistinguishable from empty.
      console.error('Supabase error:', result.error)
      return NextResponse.json(
        { success: false, error: `Could not load ${type} rates` },
        { status: 500 }
      )
    }
    let data: any[] = (result.data ?? []).map(row => (transform ? transform(row) : row))

    // A PRICING screen may ask for the rows in the org's rate currency
    // (in_org_currency=true). The tour-builder's selectors sum what they get
    // and post it to /api/tours/calculate, which adds numbers up in memory —
    // so a raw 5000 EGP dinner became 5000 dollars in the sidebar. Converted
    // here, once, through the engine's own normaliser; each converted row
    // says what it was entered in, and an unconvertible one comes back
    // unpriced. Without the flag — the rates hub — rows stay as typed: a
    // rates TABLE never converts.
    const table = TYPE_TABLE[type]
    if (searchParams.get('in_org_currency') === 'true' && table) {
      const run = await getOrgRateCurrency(supabase, orgId)
      const normalizer = createRateNormalizer(run)
      const converted = (await normalizer.normalize(table, data as Record<string, unknown>[])) || []
      const missed = new Set(normalizer.misses.map(m => String(m.id)))
      data = converted.map((row, i) => {
        const original = normaliseRateCurrency((data[i] as any)?.rate_currency)
        if (missed.has(String(row.id))) return { ...row, converted_from: (data[i] as any)?.rate_currency ?? null, conversion_missing: true }
        if (original && original !== run) return { ...row, rate_currency: run, converted_from: original }
        return row
      })
      return NextResponse.json({ success: true, data, count: data.length, currency: run })
    }

    return NextResponse.json({
      success: true,
      data: data,
      count: data.length
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch rates'
      },
      { status: 500 }
    )
  }
}
