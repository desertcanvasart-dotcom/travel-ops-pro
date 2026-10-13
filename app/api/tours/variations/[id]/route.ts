import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { variationInOrg } from '@/lib/tours/org-scope'
import { countCatalogueReferences, referenceTotal, refusalMessage } from '@/lib/tours/catalogue-references'

// GET - Get single variation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient()
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await variationInOrg(supabase, orgId, id))) {
      return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('tour_variations')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Variation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in variation GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update variation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient()
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await variationInOrg(supabase, orgId, id))) {
      return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })
    }
    const body = await request.json()

    const updateData: any = {}
    
    if (body.variation_code !== undefined) updateData.variation_code = body.variation_code
    if (body.variation_name !== undefined) updateData.variation_name = body.variation_name
    if (body.tier !== undefined) updateData.tier = body.tier
    if (body.group_type !== undefined) updateData.group_type = body.group_type
    if (body.min_pax !== undefined) updateData.min_pax = body.min_pax
    if (body.max_pax !== undefined) updateData.max_pax = body.max_pax
    if (body.optimal_pax !== undefined) updateData.optimal_pax = body.optimal_pax
    if (body.inclusions !== undefined) updateData.inclusions = body.inclusions
    if (body.exclusions !== undefined) updateData.exclusions = body.exclusions
    if (body.optional_extras !== undefined) updateData.optional_extras = body.optional_extras
    if (body.guide_type !== undefined) updateData.guide_type = body.guide_type
    if (body.guide_languages !== undefined) updateData.guide_languages = body.guide_languages
    if (body.vehicle_type !== undefined) updateData.vehicle_type = body.vehicle_type
    if (body.accommodation_standard !== undefined) updateData.accommodation_standard = body.accommodation_standard
    if (body.meal_quality !== undefined) updateData.meal_quality = body.meal_quality
    if (body.private_experience !== undefined) updateData.private_experience = body.private_experience
    if (body.skip_line_access !== undefined) updateData.skip_line_access = body.skip_line_access
    if (body.vip_treatment !== undefined) updateData.vip_treatment = body.vip_treatment
    if (body.flexible_itinerary !== undefined) updateData.flexible_itinerary = body.flexible_itinerary
    if (body.typical_start_time !== undefined) updateData.typical_start_time = body.typical_start_time
    if (body.typical_end_time !== undefined) updateData.typical_end_time = body.typical_end_time
    if (body.pickup_time_range !== undefined) updateData.pickup_time_range = body.pickup_time_range
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.available_seasons !== undefined) updateData.available_seasons = body.available_seasons

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('tour_variations')
      .update(updateData)
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating variation:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update variation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Variation updated successfully'
    })

  } catch (error) {
    console.error('Error in variation PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete an unused variation
//
// Refused (409, counts by kind) while a quote of any status, a departure, a
// partner price or a seat hold refers to it — the same rule as the template
// delete (lib/tours/catalogue-references). Before, a quoted variation failed
// with a bare 500 on the tour_quotes foreign key, and an unquoted one
// silently cascaded its partner prices away and unlinked its departures.
// Such a variation is deactivated instead (PUT is_active false).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient()
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const variation = await variationInOrg<{ id: string; variation_name: string | null }>(supabase, orgId, id, 'id, variation_name')
    if (!variation) {
      return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })
    }

    const { counts, error: refErr } = await countCatalogueReferences(supabase, orgId, { templateId: null, variationIds: [id] })
    if (refErr) {
      console.error('Error checking variation references:', refErr)
      return NextResponse.json({ success: false, error: 'Failed to check what uses this variation' }, { status: 500 })
    }
    if (referenceTotal(counts) > 0) {
      return NextResponse.json(
        { success: false, error: refusalMessage('variation', variation.variation_name, counts), references: counts, can_deactivate: true },
        { status: 409 }
      )
    }

    const { error } = await supabase
      .from('tour_variations')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) {
      console.error('Error deleting variation:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete variation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Variation deleted successfully'
    })

  } catch (error) {
    console.error('Error in variation DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}