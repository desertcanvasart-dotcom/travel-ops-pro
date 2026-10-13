// GET /api/pricing-grid/fx
// What the grid's figures are in, and the rates to show them in another
// currency. Rates are stored in the org's RATE currency
// (organizations.rate_currency); the grid used EUR→X factors from the ECB feed
// on them, so a USD company viewing JPY was ~8% high and EGP (no ECB rate)
// kept the previous currency's factor under an E£ label. The same merged
// rates every pricing run uses (lib/rates/fx-source.ts: the app's own
// exchange_rates table over the ECB feed), so EGP converts too.

import { NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { fetchRunExchangeRates } from '@/lib/rates/fx-source'

export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const rateCurrency = await getOrgRateCurrency(createServerClient(), orgId)
    const rates = await fetchRunExchangeRates()
    return NextResponse.json({ success: true, data: { rateCurrency, rates } })
  } catch (error: any) {
    console.error('Failed to fetch grid exchange rates:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
