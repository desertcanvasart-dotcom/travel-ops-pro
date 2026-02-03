import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to resolve variation from code (which can be variation_code, template_id, or template_code)
async function resolveVariation(code: string) {
  // First, try to find by variation_code
  const { data: varByCode } = await supabase
    .from('tour_variations')
    .select('id, variation_code, template_id')
    .eq('variation_code', code)
    .single()

  if (varByCode) return varByCode

  // Check if it's a UUID (template_id)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)

  if (isUUID) {
    // Try to find by template_id and get the first variation
    const { data: varByTemplateId } = await supabase
      .from('tour_variations')
      .select('id, variation_code, template_id')
      .eq('template_id', code)
      .order('tier', { ascending: true })
      .limit(1)
      .single()

    if (varByTemplateId) return varByTemplateId
  } else {
    // Try to find by template_code and get the first variation
    const { data: template } = await supabase
      .from('tour_templates')
      .select('id')
      .eq('template_code', code)
      .single()

    if (template) {
      const { data: varByTemplate } = await supabase
        .from('tour_variations')
        .select('id, variation_code, template_id')
        .eq('template_id', template.id)
        .order('tier', { ascending: true })
        .limit(1)
        .single()

      if (varByTemplate) return varByTemplate
    }
  }

  return null
}

// GET - Fetch all language versions for a tour
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    // Resolve to variation
    const variation = await resolveVariation(code)
    if (!variation) {
      return NextResponse.json(
        { success: false, error: 'Tour not found' },
        { status: 404 }
      )
    }

    // Fetch variation versions
    const { data: variationVersions, error: varError } = await supabase
      .from('tour_variation_versions')
      .select('*')
      .eq('variation_id', variation.id)
      .order('language', { ascending: true })

    if (varError) throw varError

    // Also fetch template versions
    const { data: templateVersions, error: tmpError } = await supabase
      .from('tour_template_versions')
      .select('*')
      .eq('template_id', variation.template_id)
      .order('language', { ascending: true })

    if (tmpError) throw tmpError

    // Combine available languages
    const variationLangs = new Set((variationVersions || []).map(v => v.language))
    const templateLangs = new Set((templateVersions || []).map(v => v.language))
    const availableLanguages = [...new Set([...variationLangs, ...templateLangs])]

    return NextResponse.json({
      success: true,
      data: {
        variation_id: variation.id,
        template_id: variation.template_id,
        variation_versions: variationVersions || [],
        template_versions: templateVersions || [],
        available_languages: availableLanguages
      }
    })
  } catch (error) {
    console.error('Error fetching tour versions:', error)
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

// POST - Create a new language version for a tour
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const body = await request.json()

    const { language, variation_content, template_content } = body

    if (!language || !['en', 'ja'].includes(language)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Resolve to variation
    const variation = await resolveVariation(code)
    if (!variation) {
      return NextResponse.json(
        { success: false, error: 'Tour not found' },
        { status: 404 }
      )
    }

    const results: { variationVersion?: unknown; templateVersion?: unknown } = {}

    // Create variation version if content provided
    if (variation_content) {
      // Check if already exists
      const { data: existingVar } = await supabase
        .from('tour_variation_versions')
        .select('id')
        .eq('variation_id', variation.id)
        .eq('language', language)
        .single()

      if (existingVar) {
        // Update existing
        const { data, error } = await supabase
          .from('tour_variation_versions')
          .update({
            variation_name: variation_content.variation_name,
            inclusions: variation_content.inclusions || [],
            exclusions: variation_content.exclusions || [],
            optional_extras: variation_content.optional_extras || []
          })
          .eq('id', existingVar.id)
          .select()
          .single()

        if (error) throw error
        results.variationVersion = data
      } else {
        // Create new
        const { data, error } = await supabase
          .from('tour_variation_versions')
          .insert({
            variation_id: variation.id,
            language,
            variation_name: variation_content.variation_name || 'Untitled Variation',
            inclusions: variation_content.inclusions || [],
            exclusions: variation_content.exclusions || [],
            optional_extras: variation_content.optional_extras || []
          })
          .select()
          .single()

        if (error) throw error
        results.variationVersion = data
      }
    }

    // Create template version if content provided
    if (template_content) {
      // Check if already exists
      const { data: existingTmp } = await supabase
        .from('tour_template_versions')
        .select('id')
        .eq('template_id', variation.template_id)
        .eq('language', language)
        .single()

      if (existingTmp) {
        // Update existing
        const { data, error } = await supabase
          .from('tour_template_versions')
          .update({
            template_name: template_content.template_name,
            short_description: template_content.short_description || null,
            long_description: template_content.long_description || null,
            highlights: template_content.highlights || [],
            main_attractions: template_content.main_attractions || [],
            best_for: template_content.best_for || [],
            inclusions: template_content.inclusions || [],
            exclusions: template_content.exclusions || []
          })
          .eq('id', existingTmp.id)
          .select()
          .single()

        if (error) throw error
        results.templateVersion = data
      } else {
        // Create new
        const { data, error } = await supabase
          .from('tour_template_versions')
          .insert({
            template_id: variation.template_id,
            language,
            template_name: template_content.template_name || 'Untitled Tour',
            short_description: template_content.short_description || null,
            long_description: template_content.long_description || null,
            highlights: template_content.highlights || [],
            main_attractions: template_content.main_attractions || [],
            best_for: template_content.best_for || [],
            inclusions: template_content.inclusions || [],
            exclusions: template_content.exclusions || []
          })
          .select()
          .single()

        if (error) throw error
        results.templateVersion = data
      }
    }

    return NextResponse.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('Error creating tour version:', error)
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
