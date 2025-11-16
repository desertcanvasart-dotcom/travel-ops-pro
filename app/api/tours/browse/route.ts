import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    // Use the helpful view we created
    const { data, error } = await supabase
      .from('tour_overview')
      .select('*')
      .order('template_name', { ascending: true })

    if (error) {
      // If view doesn't exist, fall back to manual query
      const { data: templatesData, error: templatesError } = await supabase
        .from('tour_templates')
        .select(`
          template_code,
          template_name,
          duration_days,
          is_featured,
          tour_categories (category_name),
          destinations (destination_name),
          tour_variations (
            variation_code,
            tier,
            group_type,
            min_pax,
            max_pax,
            variation_pricing (price_per_person)
          )
        `)
        .eq('is_active', true)

      if (templatesError) throw templatesError

      // Transform the data
      const transformedData = templatesData.flatMap(template => 
        (template.tour_variations || []).map((variation: any) => ({
          template_code: template.template_code,
          template_name: template.template_name,
          category_name: template.tour_categories?.category_name || 'Uncategorized',
          destination_name: template.destinations?.destination_name || 'Various',
          duration_days: template.duration_days,
          variation_code: variation.variation_code,
          tier: variation.tier,
          group_type: variation.group_type,
          min_pax: variation.min_pax,
          max_pax: variation.max_pax,
          price_from: variation.variation_pricing?.[0]?.price_per_person || null,
          is_featured: template.is_featured
        }))
      )

      return NextResponse.json({
        success: true,
        data: transformedData
      })
    }

    return NextResponse.json({
      success: true,
      data: data || []
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