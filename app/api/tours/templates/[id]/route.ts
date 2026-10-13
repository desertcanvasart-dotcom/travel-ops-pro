import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'

// Admin client for all operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Get single template with variations and days
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    // The caller's company's template only: another company's id is "not
    // found", like one that does not exist.
    const { data: template, error: templateError } = await supabaseAdmin
      .from('tour_templates')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (templateError) {
      console.error('Error fetching template:', templateError)
      return NextResponse.json(
        { success: false, error: clientMessage(templateError, 'Internal server error') },
        { status: 500 }
      )
    }

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      )
    }

    // Get variations
    const { data: variations } = await supabaseAdmin
      .from('tour_variations')
      .select('*')
      .eq('template_id', id)
      .eq('org_id', orgId)
      .order('tier', { ascending: true })

    // `days` and `pricing` were read from tour_days / tour_pricing by
    // tour_id = this template's id — but those rows belong to the legacy
    // builder's tours (tour_days.tour_id → tours), never to a template, so
    // they always came back empty. The template's day plan is
    // /api/tours/templates/[id]/days. The keys stay for old clients.
    const days: unknown[] = []
    const pricing: unknown[] = []

    return NextResponse.json({
      success: true,
      data: {
        ...template,
        variations: variations || [],
        days,
        pricing
      }
    })

  } catch (error) {
    console.error('Error in template GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json()

    const updateData: any = {}
    
    // Only update fields that are provided
    if (body.template_code !== undefined) updateData.template_code = body.template_code
    if (body.template_name !== undefined) updateData.template_name = body.template_name
    if (body.theme_key !== undefined) updateData.theme_key = body.theme_key || null
    if (body.tour_type !== undefined) updateData.tour_type = body.tour_type
    if (body.duration_days !== undefined) updateData.duration_days = body.duration_days
    if (body.duration_nights !== undefined) updateData.duration_nights = body.duration_nights
    if (body.primary_destination_id !== undefined) updateData.primary_destination_id = body.primary_destination_id
    if (body.destinations_covered !== undefined) updateData.destinations_covered = body.destinations_covered
    if (body.cities_covered !== undefined) updateData.cities_covered = body.cities_covered
    if (body.short_description !== undefined) updateData.short_description = body.short_description
    if (body.long_description !== undefined) updateData.long_description = body.long_description
    if (body.highlights !== undefined) updateData.highlights = body.highlights
    if (body.main_attractions !== undefined) updateData.main_attractions = body.main_attractions
    if (body.best_for !== undefined) updateData.best_for = body.best_for
    if (body.physical_level !== undefined) updateData.physical_level = body.physical_level
    if (body.age_suitability !== undefined) updateData.age_suitability = body.age_suitability
    if (body.pickup_required !== undefined) updateData.pickup_required = body.pickup_required
    if (body.accommodation_nights !== undefined) updateData.accommodation_nights = body.accommodation_nights
    if (body.meals_included !== undefined) updateData.meals_included = body.meals_included
    if (body.image_url !== undefined) updateData.image_url = body.image_url
    if (body.website_url !== undefined) updateData.website_url = typeof body.website_url === 'string' && body.website_url.trim() ? body.website_url.trim() : null
    if (body.gallery_urls !== undefined) updateData.gallery_urls = body.gallery_urls
    if (body.is_featured !== undefined) updateData.is_featured = body.is_featured
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.popularity_score !== undefined) updateData.popularity_score = body.popularity_score
    if (body.default_transportation_service !== undefined) updateData.default_transportation_service = body.default_transportation_service
    if (body.transportation_city !== undefined) updateData.transportation_city = body.transportation_city
    
    // NEW FIELDS
    if (body.itinerary !== undefined) updateData.itinerary = body.itinerary
    if (body.inclusions !== undefined) updateData.inclusions = body.inclusions
    if (body.exclusions !== undefined) updateData.exclusions = body.exclusions

    // Add updated_at
    updateData.updated_at = new Date().toISOString()

    console.log('Updating template:', id, 'with fields:', Object.keys(updateData))

    // Update template
    const { data, error } = await supabaseAdmin
      .from('tour_templates')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Failed to update template') },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data[0],
      message: 'Template updated successfully'
    })

  } catch (error) {
    console.error('Error in template PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete template (and its variations, their children, its day
// activities, and the company's quotes built only on it)
//
// Manager-and-above (the tour manager's role; RLS on tour_templates says the
// same). Only the caller's company's template: another company's id is "not
// found". The steps are not one transaction, so the first one that fails
// stops the delete and is REPORTED (500, naming the step) — it used to be
// logged and the route answered 200 with half a programme left behind.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    const { data: template } = await supabaseAdmin
      .from('tour_templates')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    const failed = (step: string, err: { message?: string }) => {
      console.error(`Error deleting template ${id} — ${step}:`, err)
      return NextResponse.json(
        { success: false, error: `Failed to delete ${step}: ${err.message ?? 'unknown error'}`, step },
        { status: 500 }
      )
    }

    // tour_day_activities links by template_id (+ day_number).
    const { error: actErr } = await supabaseAdmin
      .from('tour_day_activities')
      .delete()
      .eq('template_id', id)
    if (actErr) return failed('day activities', actErr)

    const { data: variations, error: varReadErr } = await supabaseAdmin
      .from('tour_variations')
      .select('id')
      .eq('template_id', id)
      .eq('org_id', orgId)
    if (varReadErr) return failed('variations', varReadErr)

    if (variations && variations.length > 0) {
      const variationIds = variations.map(v => v.id)

      // Quotes that also have an itinerary keep it and lose the variation;
      // quotes with nothing else are deleted. The company's own quotes only
      // (a variation is one company's now, and so are the quotes built on it).
      const { error: detachErr } = await supabaseAdmin
        .from('tour_quotes')
        .update({ variation_id: null })
        .in('variation_id', variationIds)
        .eq('org_id', orgId)
        .not('itinerary_id', 'is', null)
      if (detachErr) return failed('quote links', detachErr)

      const { error: delQuotesErr } = await supabaseAdmin
        .from('tour_quotes')
        .delete()
        .in('variation_id', variationIds)
        .eq('org_id', orgId)
      if (delQuotesErr) return failed('quotes', delQuotesErr)

      const { error: delDailyErr } = await supabaseAdmin
        .from('variation_daily_itinerary')
        .delete()
        .in('variation_id', variationIds)
      if (delDailyErr) return failed('variation daily itinerary', delDailyErr)

      const { error: delSvcErr } = await supabaseAdmin
        .from('tour_variation_services')
        .delete()
        .in('variation_id', variationIds)
      if (delSvcErr) return failed('variation services', delSvcErr)
    }

    // Variations (their version tables, pricing and costed services cascade).
    const { error: delVarErr } = await supabaseAdmin
      .from('tour_variations')
      .delete()
      .eq('template_id', id)
      .eq('org_id', orgId)
    if (delVarErr) return failed('variations', delVarErr)

    // The template (its version tables cascade).
    const { error } = await supabaseAdmin
      .from('tour_templates')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
    if (error) return failed('template', error)

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully'
    })

  } catch (error) {
    console.error('Error in template DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
