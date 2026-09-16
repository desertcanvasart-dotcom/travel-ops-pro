// ============================================
// POST /api/b2b/transport-preview
// ============================================
// The transport each programme day will be priced with, and what each line
// costs — for the day editor to LIST, the way it lists attractions. Runs the
// engine's own steps over the days as they stand in the editor (unsaved
// edits included): parseItinerary, determineTransportNeeds, findTransportRate.
// So what the editor shows is what Calculate Price will charge; there is no
// second copy of the rules to drift.
//
// Body: { days: <editor days>, template_id?: string, num_pax?: number }

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import {
  buildTransportCache,
  determineTransportNeeds,
  findTransportRate,
  parseItinerary,
  transportServiceLabel,
} from '@/lib/auto-pricing-service'
import { usableRate } from '@/lib/pricing/usable-rate'
import { isRoadTransfer } from '@/lib/pricing/transport-lines'

export const dynamic = 'force-dynamic'

export interface PreviewLine {
  service_type: string
  label: string
  /** Where the vehicle is booked. */
  city: string
  /** Road transfers: the route priced. */
  from: string | null
  to: string | null
  /** The matched rate's own name, when there is one. */
  rate_name: string | null
  /** Cost for the group in the org's rate currency; null = no rate. */
  cost: number | null
  /** Why there is no cost. */
  message: string | null
}

export interface PreviewDay {
  index: number
  /** The operator set this day's list (transport_lines); false = the rules. */
  custom: boolean
  /** The ship's transport package covers the day's sightseeing. */
  cruise_package: boolean
  lines: PreviewLine[]
}

const SINGLE_DAY_TOUR_TYPES = ['day_tour', 'half_day', 'stopover']

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const rawDays: unknown[] = Array.isArray(body?.days) ? body.days : []
  if (rawDays.length === 0) {
    return NextResponse.json({ success: false, error: 'days is required' }, { status: 400 })
  }
  const numPax = Math.min(60, Math.max(1, Number(body?.num_pax) || 2))

  try {
    const db = createServerClient()
    const currency = await getOrgRateCurrency(db, await getCurrentOrgId())

    // Same package reading the engine does from the template's tour_type.
    let packageType: string | undefined
    if (typeof body?.template_id === 'string' && body.template_id) {
      const { data } = await db.from('tour_templates').select('tour_type').eq('id', body.template_id).maybeSingle()
      if (SINGLE_DAY_TOUR_TYPES.includes(String(data?.tour_type ?? ''))) packageType = 'day-trips'
    }

    const itinerary = parseItinerary(rawDays, { packageType })
    const cache = await buildTransportCache(createRateNormalizer(currency))

    const days: PreviewDay[] = itinerary.map((day, i) => {
      const previousDay = i > 0 ? itinerary[i - 1] : null
      const nextDay = i < itinerary.length - 1 ? itinerary[i + 1] : null
      const lines = determineTransportNeeds(day, previousDay, nextDay).map((needs): PreviewLine => {
        const city = needs.city || day.city
        const from = needs.originCity || previousDay?.city || null
        const to = needs.destinationCity || city
        const road = isRoadTransfer(needs.serviceType)
        const rate = findTransportRate(cache, {
          serviceType: needs.serviceType,
          city,
          duration: needs.duration,
          area: needs.area,
          pax: numPax,
          vehicleType: needs.useSpecialVehicle ? needs.specialVehicleType : undefined,
          originCity: from ?? undefined,
          destinationCity: to,
        })
        const cost = rate ? usableRate(rate.base_rate_eur) : null
        const label = transportServiceLabel(needs.serviceType)
        const where = road && from ? `${from} → ${to}` : city
        return {
          service_type: needs.serviceType,
          label,
          city,
          from: road ? from : null,
          to: road ? to : null,
          rate_name: rate?.route_name ?? null,
          cost,
          message: cost != null
            ? null
            : rate
              ? `The ${label.toLowerCase()} rate for ${where} has no price for ${numPax}. Fill its vehicles in Rates → Transportation.`
              : `No ${label.toLowerCase()} rate for ${where}. Add it in Rates → Transportation.`,
        }
      })
      const raw = rawDays[i] as { transport_lines?: unknown } | undefined
      return { index: i, custom: Array.isArray(raw?.transport_lines), cruise_package: day.is_cruise_day === true, lines }
    })

    return NextResponse.json({ success: true, currency, num_pax: numPax, days })
  } catch (error) {
    console.error('[transport-preview] failed:', error)
    return NextResponse.json({ success: false, error: 'Could not work out the transport' }, { status: 500 })
  }
}
