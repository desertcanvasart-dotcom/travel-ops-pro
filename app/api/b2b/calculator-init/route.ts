import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B: Calculator Init — Fetch template itinerary for editor
//
// Resolves variation_id → template data so the calculator page
// can display the itinerary editor before pricing.
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const variationId = searchParams.get('variation_id')

    if (!variationId) {
      return NextResponse.json(
        { success: false, error: 'variation_id is required' },
        { status: 400 }
      )
    }

    // Fetch variation with joined template data
    const { data: variation, error: varError } = await supabaseAdmin
      .from('tour_variations')
      .select(`
        id,
        variation_name,
        variation_code,
        tier,
        template_id,
        tour_templates (
          id,
          template_name,
          template_code,
          itinerary,
          duration_days,
          duration_nights,
          cities_covered
        )
      `)
      .eq('id', variationId)
      .single()

    if (varError || !variation) {
      return NextResponse.json(
        { success: false, error: 'Variation not found' },
        { status: 404 }
      )
    }

    const template = variation.tour_templates as any

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found for this variation' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      template_id: template.id,
      template_name: template.template_name,
      template_code: template.template_code,
      variation_name: variation.variation_name,
      variation_code: variation.variation_code,
      tier: variation.tier,
      duration_days: template.duration_days,
      duration_nights: template.duration_nights,
      cities_covered: template.cities_covered || [],
      itinerary: template.itinerary || []
    })
  } catch (err: any) {
    console.error('[calculator-init] Error:', err)
    return NextResponse.json(
      { success: false, error: clientMessage(err, 'Internal server error') },
      { status: 500 }
    )
  }
}
