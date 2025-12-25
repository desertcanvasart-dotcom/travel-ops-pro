import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// TOUR BROWSE API - WITH VARIATION_ID
// File: app/api/tours/browse/route.ts
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    // First, try to use the view if it exists
    const { data: viewData, error: viewError } = await supabase
      .from('tour_overview')
      .select('*')
      .order('template_name', { ascending: true })

    if (!viewError && viewData) {
      return NextResponse.json({
        success: true,
        data: viewData
      })
    }

    // Fallback: Manual query with variation_id included
    const { data: templatesData, error: templatesError } = await supabase
      .from('tour_templates')
      .select(`
        id,
        template_code,
        template_name,
        duration_days,
        is_featured,
        tour_categories (category_name),
        destinations (destination_name),
        tour_variations (
          id,
          variation_code,
          variation_name,
          tier,
          group_type,
          min_pax,
          max_pax
        )
      `)
      .eq('is_active', true)

    if (templatesError) throw templatesError

    // Get all variation IDs to fetch services count
    const allVariationIds = templatesData?.flatMap(t => 
      (t.tour_variations || []).map((v: any) => v.id)
    ) || []

    // Check which variations have services (for dynamic pricing)
    const { data: servicesData } = await supabase
      .from('tour_variation_services')
      .select('variation_id')
      .in('variation_id', allVariationIds)

    const variationsWithServices = new Set(servicesData?.map(s => s.variation_id) || [])

    // Transform the data
    const transformedData = await Promise.all(
      (templatesData || []).flatMap(template => 
        (template.tour_variations || []).map(async (variation: any) => {
          let price_from = null
          const hasDynamicPricing = variationsWithServices.has(variation.id)

          // If variation has services, calculate dynamic price
          if (hasDynamicPricing) {
            try {
              // Calculate price for 2 pax as baseline "Starting From"
              const { data: services } = await supabase
                .from('tour_variation_services')
                .select('cost_per_unit, quantity_mode, quantity_value')
                .eq('variation_id', variation.id)
                .eq('is_optional', false)

              if (services && services.length > 0) {
                // Simple calculation: sum all service costs for 2 pax
                let total = 0
                for (const service of services) {
                  const cost = service.cost_per_unit || 0
                  const qty = service.quantity_value || 1
                  
                  switch (service.quantity_mode) {
                    case 'per_pax':
                      total += cost * qty * 2 // 2 pax baseline
                      break
                    case 'per_group':
                    case 'fixed':
                      total += cost * qty
                      break
                    case 'per_day':
                      total += cost * qty * (template.duration_days || 1)
                      break
                    case 'per_night':
                      total += cost * qty * Math.max((template.duration_days || 1) - 1, 1)
                      break
                    default:
                      total += cost * qty
                  }
                }
                price_from = Math.round(total / 2) // Per person for 2 pax
              }
            } catch (e) {
              console.error('Error calculating dynamic price:', e)
            }
          }

          // If no dynamic price, try legacy pricing
          if (price_from === null) {
            const { data: legacyPricing } = await supabase
              .from('variation_pricing')
              .select('price_per_person')
              .eq('variation_id', variation.id)
              .order('min_pax', { ascending: true })
              .limit(1)
              .single()

            price_from = legacyPricing?.price_per_person || null
          }

          return {
            variation_id: variation.id,  // <-- KEY ADDITION
            template_code: template.template_code,
            template_name: template.template_name,
            category_name: (template.tour_categories as any)?.category_name || 'Uncategorized',
            destination_name: (template.destinations as any)?.destination_name || 'Various',
            duration_days: template.duration_days,
            variation_code: variation.variation_code,
            variation_name: variation.variation_name,
            tier: variation.tier,
            group_type: variation.group_type,
            min_pax: variation.min_pax,
            max_pax: variation.max_pax,
            price_from: price_from,
            is_featured: template.is_featured,
            has_dynamic_pricing: hasDynamicPricing
          }
        })
      )
    )

    return NextResponse.json({
      success: true,
      data: transformedData
    })

  } catch (error) {
    console.error('Error fetching tours:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch tours',
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Make sure tour database tables are installed'
      },
      { status: 500 }
    )
  }
}