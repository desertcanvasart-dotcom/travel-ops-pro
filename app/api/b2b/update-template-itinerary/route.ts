import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse, after } from 'next/server'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { tierLadderForCurrentOrg } from '@/lib/vocabulary-server'
import { refreshTemplateCachedPrice } from '@/lib/tours/cached-price'

// ============================================
// B2B: Update Template Itinerary JSONB
//
// Persists itinerary edits from the calculator page editor
// back to both tour_templates and tour_template_versions.
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { template_id, itinerary } = body

    if (!template_id) {
      return NextResponse.json(
        { success: false, error: 'template_id is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(itinerary)) {
      return NextResponse.json(
        { success: false, error: 'itinerary must be an array' },
        { status: 400 }
      )
    }

    // Derive updated metadata from itinerary
    const durationDays = itinerary.length
    const durationNights = Math.max(0, durationDays - 1)
    const citiesCovered = [...new Set(
      itinerary
        .map((d: any) => d.city)
        .filter(Boolean)
    )]

    // 1. Update tour_templates
    const { data: savedTemplate, error: templateError } = await supabaseAdmin
      .from('tour_templates')
      .update({
        itinerary,
        duration_days: durationDays,
        duration_nights: durationNights,
        cities_covered: citiesCovered,
        updated_at: new Date().toISOString()
      })
      .eq('id', template_id)
      .select('id, uses_day_builder, pricing_mode')
      .maybeSingle()

    if (templateError) {
      console.error('[update-template-itinerary] Template update failed:', templateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update template' },
        { status: 500 }
      )
    }

    // 2. Update tour_template_versions (English version)
    const { error: versionError } = await supabaseAdmin
      .from('tour_template_versions')
      .update({ itinerary })
      .eq('template_id', template_id)
      .eq('language', 'en')

    if (versionError) {
      // Non-fatal: log warning but don't fail the request
      console.warn('[update-template-itinerary] Version update warning:', versionError.message)
    }

    // The catalogue's "from" price is a cache of the engine's price for this
    // itinerary. Refresh it now the itinerary changed, after the response so
    // the save does not wait on a full multi-tier pricing run. The org context
    // is read here, while the request is still in scope.
    if (savedTemplate) {
      const orgId = await getCurrentOrgId()
      const ctx = {
        tierLadder: await tierLadderForCurrentOrg(),
        pricingOptions: { orgId: orgId ?? undefined, rateCurrency: await getOrgRateCurrency(supabaseAdmin, orgId) },
      }
      after(async () => {
        try {
          await refreshTemplateCachedPrice(supabaseAdmin, savedTemplate, ctx)
        } catch (err) {
          console.error('[update-template-itinerary] Cached price refresh failed:', err)
        }
      })
    }

    return NextResponse.json({
      success: true,
      duration_days: durationDays,
      duration_nights: durationNights,
      cities_covered: citiesCovered
    })
  } catch (err: any) {
    console.error('[update-template-itinerary] Error:', err)
    return NextResponse.json(
      { success: false, error: clientMessage(err, 'Internal server error') },
      { status: 500 }
    )
  }
}
