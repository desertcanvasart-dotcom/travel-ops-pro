// ============================================
// API: COMMIT CONCIERGE BRIEF TO ITINERARY
// ============================================
// GET  /api/copilot/threads/:id/commit-itinerary
//      → returns the itinerary already spawned from this thread (or null)
// POST /api/copilot/threads/:id/commit-itinerary
//      → idempotently creates the itinerary
//
// Auth: gated by the standard /api/* middleware (logged-in operator session
// required). No additional auth here.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { commitBriefToItinerary } from '@/lib/concierge/commit-brief-to-itinerary'
import { getCurrentOrgId } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET — surface the existing spawned itinerary (if any) so the UI can render
// either the "Create itinerary" button or the "View itinerary →" link.
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id: threadId } = await ctx.params

    const { data: itin, error } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name')
      .eq('thread_id', threadId)
      .maybeSingle()

    if (error) {
      console.error('[commit-itinerary GET] lookup failed:', error.message)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      itinerary: itin
        ? {
            id: itin.id,
            itinerary_code: itin.itinerary_code,
            trip_name: itin.trip_name,
          }
        : null,
    })
  } catch (e: any) {
    console.error('[commit-itinerary GET] unexpected:', e)
    return NextResponse.json(
      { success: false, error: e?.message || 'Unexpected error' },
      { status: 500 }
    )
  }
}

// POST — create the itinerary (idempotent at DB + code layer).
export async function POST(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id: threadId } = await ctx.params

    // M3 Phase 2A — every itinerary INSERT must stamp org_id (NOT NULL on
    // itineraries). Resolve from the operator's session.
    const orgId = await getCurrentOrgId()
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'No organization context — re-login or contact admin.' },
        { status: 403 }
      )
    }

    const result = await commitBriefToItinerary(threadId, orgId, supabase)
    return NextResponse.json(
      {
        success: true,
        itinerary_id: result.itineraryId,
        itinerary_code: result.itineraryCode,
        trip_name: result.tripName,
        brief_id: result.briefId,
        was_new: result.wasNewItinerary,
      },
      { status: result.wasNewItinerary ? 201 : 200 }
    )
  } catch (e: any) {
    console.error('[commit-itinerary POST] failed:', e?.message)
    const msg: string = e?.message || 'Unexpected error'
    // Distinguish operator-actionable errors (404-class) from server errors.
    const isClientError =
      msg.startsWith('[commit-brief] thread not found') ||
      msg.includes("has origin='") ||
      msg.includes('has no brief_id')
    return NextResponse.json(
      { success: false, error: msg },
      { status: isClientError ? 404 : 500 }
    )
  }
}
