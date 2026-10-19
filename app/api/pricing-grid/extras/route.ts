// GET /api/pricing-grid/extras?itinerary_id=&template_id=
// The Sell → Extras a grid trip is offered — every-booking ones plus its
// programme's, at the programme's price — in the rate currency. The page
// prices them for its group (app/pricing-grid/lib/extras.ts); the save reads
// the same rows itself (../extras-options.ts).

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { gridTripProgramme, loadGridExtraRows } from '../extras-options'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const params = request.nextUrl.searchParams
    const templateId = await gridTripProgramme(supabase, orgId, {
      itineraryId: params.get('itinerary_id'),
      templateId: params.get('template_id'),
    })
    const data = await loadGridExtraRows(supabase, orgId, templateId)
    return NextResponse.json({ success: true, data: { ...data, templateId } })
  } catch (error) {
    console.error('Failed to load grid extras:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load extras') }, { status: 500 })
  }
}
