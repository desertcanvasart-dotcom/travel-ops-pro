import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all language versions for a tour template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('tour_template_versions')
      .select('*')
      .eq('template_id', id)
      .order('language', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error) {
    console.error('Error fetching tour template versions:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch versions',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST - Create a new language version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { language, ...content } = body

    if (!language || !['en', 'ja'].includes(language)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Check if version already exists
    const { data: existing } = await supabaseAdmin
      .from('tour_template_versions')
      .select('id')
      .eq('template_id', id)
      .eq('language', language)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: `${language.toUpperCase()} version already exists` },
        { status: 409 }
      )
    }

    // If no template_name provided, try to copy from existing version or template
    let templateName = content.template_name
    if (!templateName) {
      const { data: otherVersion } = await supabaseAdmin
        .from('tour_template_versions')
        .select('template_name')
        .eq('template_id', id)
        .neq('language', language)
        .limit(1)
        .single()

      if (otherVersion?.template_name) {
        templateName = otherVersion.template_name
      } else {
        const { data: template } = await supabaseAdmin
          .from('tour_templates')
          .select('template_name')
          .eq('id', id)
          .single()
        templateName = template?.template_name || 'Untitled Tour'
      }
    }

    const { data, error } = await supabaseAdmin
      .from('tour_template_versions')
      .insert({
        template_id: id,
        language,
        template_name: templateName,
        short_description: content.short_description || null,
        long_description: content.long_description || null,
        highlights: content.highlights || [],
        main_attractions: content.main_attractions || [],
        best_for: content.best_for || [],
        inclusions: content.inclusions || [],
        exclusions: content.exclusions || [],
        itinerary: content.itinerary || null,
        created_by: content.created_by || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error creating tour template version:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create version',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
