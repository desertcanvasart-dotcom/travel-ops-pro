import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all tour templates with variations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category_id')
    const tourType = searchParams.get('tour_type')
    const isActive = searchParams.get('is_active')

    // `slim=1` — just enough to name a programme in a picker. The full shape
    // carries every programme's day-by-day JSONB plus its variations and
    // language versions: 153KB against 5KB here, for a dropdown that shows a
    // code and a length. Ordered by code, which is how the office refers to
    // them.
    if (searchParams.get('slim') === '1') {
      const { data, error } = await supabaseAdmin
        .from('tour_templates')
        .select('id, template_code, template_name, duration_days, is_active')
        .order('template_code', { ascending: true })

      if (error) {
        console.error('Error fetching templates (slim):', error)
        return NextResponse.json(
          { success: false, error: 'Failed to fetch templates' },
          { status: 500 }
        )
      }
      return NextResponse.json({ success: true, data: data ?? [], count: data?.length ?? 0 })
    }

    // First get templates
    let query = supabaseAdmin
      .from('tour_templates')
      .select(`
        *,
        category:tour_categories(id, category_name, category_code)
      `)
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category_id', category)
    }

    if (tourType) {
      query = query.eq('tour_type', tourType)
    }

    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data: templates, error: templatesError } = await query

    if (templatesError) {
      console.error('Error fetching templates:', templatesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch templates' },
        { status: 500 }
      )
    }

    // Get all variations and language versions for these templates
    if (templates && templates.length > 0) {
      const templateIds = templates.map(t => t.id)

      // Fetch variations
      const { data: variations, error: variationsError } = await supabaseAdmin
        .from('tour_variations')
        .select('*')
        .in('template_id', templateIds)
        .order('tier', { ascending: true })

      // Fetch language versions
      let versionsMap: Record<string, string[]> = {}
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

      if (!variationsError && variations) {
        // Attach variations and available_languages to their templates
        const templatesWithData = templates.map(template => ({
          ...template,
          variations: variations.filter(v => v.template_id === template.id),
          available_languages: versionsMap[template.id] || []
        }))

        return NextResponse.json({
          success: true,
          data: templatesWithData,
          count: templatesWithData.length
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: templates || [],
      count: templates?.length || 0
    })

  } catch (error) {
    console.error('Error in templates GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new tour template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.template_name || !body.tour_type) {
      return NextResponse.json(
        { success: false, error: 'Template name and tour type are required' },
        { status: 400 }
      )
    }

    // Generate template code if not provided
    const templateCode = body.template_code || generateTemplateCode(body)

    const templateData = {
      template_code: templateCode,
      template_name: body.template_name,
      category_id: body.category_id || null,
      tour_type: body.tour_type,
      duration_days: body.duration_days || 1,
      duration_nights: body.duration_nights || null,
      primary_destination_id: body.primary_destination_id || null,
      destinations_covered: body.destinations_covered || [],
      cities_covered: body.cities_covered || [],
      short_description: body.short_description || null,
      long_description: body.long_description || null,
      highlights: body.highlights || [],
      main_attractions: body.main_attractions || [],
      best_for: body.best_for || [],
      physical_level: body.physical_level || 'moderate',
      age_suitability: body.age_suitability || 'all_ages',
      pickup_required: body.pickup_required !== false,
      accommodation_nights: body.accommodation_nights || null,
      meals_included: body.meals_included || [],
      image_url: body.image_url || null,
      gallery_urls: body.gallery_urls || [],
      is_featured: body.is_featured || false,
      is_active: body.is_active !== false,
      popularity_score: body.popularity_score || 0,
      default_transportation_service: body.default_transportation_service || 'day_tour',
      transportation_city: body.transportation_city || 'Cairo',
      // NEW FIELDS
      itinerary: body.itinerary || [],
      inclusions: body.inclusions || [],
      exclusions: body.exclusions || []
    }

    // Idempotency guard. The create form double-fires ~1s apart in the wild
    // (confirmed in prod: two "Memphis, Sakkara & Dahshur Day Trip" templates
    // 989ms apart, codes CAI-DAY-828 / CAI-DAY-778). A template's code is
    // generated per request with no unique constraint, so nothing downstream
    // dedupes it — the list then shows the tour twice. Before inserting, look
    // for one just created with the same name and type and return THAT row
    // instead of a twin. The window is short so a genuine same-name template
    // made later still creates normally.
    const dupWindowStart = new Date(Date.now() - 15_000).toISOString()
    const { data: recent } = await supabaseAdmin
      .from('tour_templates')
      // Empty select() returns all columns, like the insert below.
      .select()
      .eq('template_name', body.template_name)
      .eq('tour_type', body.tour_type)
      .gte('created_at', dupWindowStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) {
      // The double-submit's second request: hand back the row the first one
      // created (and its already-made 'en' version) rather than a twin.
      return NextResponse.json({
        success: true,
        data: { ...recent, available_languages: ['en'] },
        message: 'Template already created',
        deduplicated: true,
      })
    }

    const { data, error } = await supabaseAdmin
      .from('tour_templates')
      .insert([templateData])
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create template' },
        { status: 500 }
      )
    }

    // Create English version automatically
    if (data) {
      const { error: versionError } = await supabaseAdmin
        .from('tour_template_versions')
        .insert({
          template_id: data.id,
          language: 'en',
          template_name: body.template_name,
          short_description: body.short_description || null,
          long_description: body.long_description || null,
          highlights: body.highlights || [],
          main_attractions: body.main_attractions || [],
          best_for: body.best_for || [],
          inclusions: body.inclusions || [],
          exclusions: body.exclusions || [],
          itinerary: body.itinerary || null
        })

      if (versionError) {
        console.warn('Warning: Could not create English version:', versionError)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        available_languages: ['en']
      },
      message: 'Template created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in templates POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper to generate template code
function generateTemplateCode(data: any): string {
  const city = data.cities_covered?.[0] || 'EGYPT'
  const type = (data.tour_type || 'tour').toUpperCase().replace('_', '-')
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${city.substring(0, 3).toUpperCase()}-${type.substring(0, 3)}-${random}`
}