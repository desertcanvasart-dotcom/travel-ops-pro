// ============================================
// B2B TOURS BROWSE API - OPTIMIZED
// File: app/api/tours/browse/route.ts
//
// Uses cached pricing for fast loading.
// Prices are pre-calculated by /api/tours/recalculate-prices
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Filters
    const tourType = searchParams.get('tour_type')
    const category = searchParams.get('category')
    const city = searchParams.get('city')
    const minDays = searchParams.get('min_days')
    const maxDays = searchParams.get('max_days')
    const tier = searchParams.get('tier')
    const search = sanitizeSearchTerm(searchParams.get('search'))

    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const offset = (page - 1) * limit

    // Build query for templates
    // Note: cached_starting_price columns are optional - works without migration
    let query = supabaseAdmin
      .from('tour_templates')
      .select(`
        id,
        template_name,
        template_code,
        tour_type,
        duration_days,
        cities_covered,
        highlights,
        short_description,
        is_featured,
        image_url,
        uses_day_builder,
        pricing_mode,
        cached_starting_price,
        cached_starting_tier,
        cached_price_updated_at,
        tour_categories (
          id,
          category_name,
          category_code
        ),
        tour_variations (
          id,
          variation_name,
          tier,
          min_pax,
          max_pax,
          is_active
        )
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })

    // Apply filters
    if (tourType) {
      query = query.eq('tour_type', tourType)
    }

    if (category) {
      query = query.eq('category_id', category)
    }

    if (city) {
      query = query.contains('cities_covered', [city])
    }

    if (minDays) {
      query = query.gte('duration_days', parseInt(minDays))
    }

    if (maxDays) {
      query = query.lte('duration_days', parseInt(maxDays))
    }

    if (search) {
      query = query.or(`template_name.ilike.%${search}%,short_description.ilike.%${search}%`)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: templates, error, count } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    // Fetch language versions for templates
    const templateIds = (templates || []).map(t => t.id)
    let versionsMap: Record<string, string[]> = {}

    if (templateIds.length > 0) {
      const { data: versions, error: versionsError } = await supabaseAdmin
        .from('tour_template_versions')
        .select('template_id, language')
        .in('template_id', templateIds)

      if (!versionsError && versions) {
        versionsMap = versions.reduce((acc, v) => {
          if (!acc[v.template_id]) {
            acc[v.template_id] = []
          }
          acc[v.template_id].push(v.language)
          return acc
        }, {} as Record<string, string[]>)
      }
    }

    // Transform templates
    const templatesWithPricing = (templates || []).map((template) => {
      // Filter variations by tier if specified
      let variations = template.tour_variations?.filter((v: any) => v.is_active) || []

      if (tier) {
        variations = variations.filter((v: any) => v.tier === tier)
      }

      // Cached engine price, written by /api/tours/recalculate-prices.
      // No cache means no price shown — a duration×150 estimate used to stand
      // in here, and a made-up number in a sales catalogue is worse than none.
      const startingFromPrice = template.cached_starting_price ?? null
      const startingFromTier = template.cached_starting_tier ?? null

      return {
        id: template.id,
        template_name: template.template_name,
        template_code: template.template_code,
        tour_type: template.tour_type,
        duration_days: template.duration_days,
        cities_covered: template.cities_covered || [],
        highlights: template.highlights || [],
        short_description: template.short_description,
        is_featured: template.is_featured,
        cover_image_url: template.image_url,
        category: template.tour_categories,

        // Variations summary
        variations_count: variations.length,
        available_tiers: [...new Set(variations.map((v: any) => v.tier))],
        min_pax: variations.length > 0
          ? Math.min(...variations.map((v: any) => v.min_pax || 1))
          : 1,
        max_pax: variations.length > 0
          ? Math.max(...variations.map((v: any) => v.max_pax || 15))
          : 15,

        // Pricing (engine output cached on the template; EUR cost base)
        starting_from: startingFromPrice,
        starting_from_tier: startingFromTier,
        currency: 'EUR',
        price_is_cached: startingFromPrice !== null,
        price_updated_at: template.cached_price_updated_at ?? null,

        // Flags
        uses_day_builder: template.uses_day_builder,
        pricing_mode: template.pricing_mode || 'manual',

        // Language versions
        available_languages: versionsMap[template.id] || []
      }
    })

    // A template without a cached price still lists — hiding a programme from
    // the catalogue because its price hasn't been recomputed yet would make
    // fresh imports silently vanish. The card shows its price as unavailable.
    const validTemplates = templatesWithPricing

    return NextResponse.json({
      success: true,
      data: {
        templates: validTemplates,
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / limit)
        },
        filters: {
          tour_type: tourType,
          category,
          city,
          min_days: minDays,
          max_days: maxDays,
          tier,
          search
        }
      }
    })

  } catch (error: any) {
    console.error('❌ Browse error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to fetch tours') },
      { status: 500 }
    )
  }
}
