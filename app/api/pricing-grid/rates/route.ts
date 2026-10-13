// GET /api/pricing-grid/rates?tier=standard
// Fetches all available rate options from existing Supabase tables,
// structured by grid slot for dropdown population. The shaping lives in
// ../rate-options.ts, which the save reads too, so a line is saved at the
// price the grid offers for it.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { loadGridRateOptions } from '../rate-options'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier') || 'standard'
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { rates, rateCurrency, fixedCosts } = await loadGridRateOptions(supabase, orgId, tier)
    // rateCurrency: every amount in `data` is in it — the grid converts from it
    // to the currency it shows.
    // fixedCosts: the Rates › Fixed Costs the grid charges on every sightseeing
    // day (items, per person, in rateCurrency) and the warnings to show — the
    // save reads the same list itself.
    return NextResponse.json({ success: true, data: rates, rateCurrency, fixedCosts })
  } catch (error: any) {
    console.error('Failed to fetch grid rates:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
