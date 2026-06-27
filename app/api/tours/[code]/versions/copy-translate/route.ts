import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  translateFields,
  TOUR_TEMPLATE_TRANSLATION_FIELDS,
  TOUR_VARIATION_TRANSLATION_FIELDS,
  VARIATION_DAILY_ITINERARY_TRANSLATION_FIELDS
} from '@/lib/translation-utils'
import { getServerLocale, lookupServerMessage } from '@/lib/i18n/server-messages'
import type { Language } from '@/types/multilingual'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to resolve variation from code
async function resolveVariation(code: string) {
  // First, try to find by variation_code
  const { data: varByCode } = await supabase
    .from('tour_variations')
    .select('id, variation_code, variation_name, template_id, inclusions, exclusions, optional_extras')
    .eq('variation_code', code)
    .single()

  if (varByCode) return varByCode

  // Check if it's a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)

  if (isUUID) {
    const { data: varByTemplateId } = await supabase
      .from('tour_variations')
      .select('id, variation_code, variation_name, template_id, inclusions, exclusions, optional_extras')
      .eq('template_id', code)
      .order('tier', { ascending: true })
      .limit(1)
      .single()

    if (varByTemplateId) return varByTemplateId
  } else {
    const { data: template } = await supabase
      .from('tour_templates')
      .select('id')
      .eq('template_code', code)
      .single()

    if (template) {
      const { data: varByTemplate } = await supabase
        .from('tour_variations')
        .select('id, variation_code, variation_name, template_id, inclusions, exclusions, optional_extras')
        .eq('template_id', template.id)
        .order('tier', { ascending: true })
        .limit(1)
        .single()

      if (varByTemplate) return varByTemplate
    }
  }

  return null
}

// Helper to translate daily itinerary items
async function translateDailyItinerary(
  itinerary: Array<{ day_number: number; day_title: string; day_description: string; city?: string; overnight_city?: string }>,
  sourceLanguage: Language,
  targetLanguage: Language
) {
  if (!itinerary || itinerary.length === 0) return []

  const translatedDays = []
  for (const day of itinerary) {
    const translated = await translateFields(
      day,
      VARIATION_DAILY_ITINERARY_TRANSLATION_FIELDS,
      sourceLanguage,
      targetLanguage
    )
    translatedDays.push({
      ...day,
      day_title: translated.day_title || day.day_title,
      day_description: translated.day_description || day.day_description,
      city: translated.city || day.city,
      overnight_city: translated.overnight_city || day.overnight_city
    })
  }
  return translatedDays
}

// POST - Copy and translate tour content to target language
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const body = await request.json()
    const { targetLanguage } = body

    // Validate target language
    if (!targetLanguage || !['en', 'ja'].includes(targetLanguage)) {
      return NextResponse.json(
        { success: false, error: 'Invalid target language. Must be "en" or "ja"' },
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

    const sourceLanguage: Language = targetLanguage === 'en' ? 'ja' : 'en'
    const results: {
      variationVersion?: unknown
      templateVersion?: unknown
      translatedDailyItinerary?: unknown[]
    } = {}

    // ===== VARIATION VERSION =====
    // Check if target variation version already exists
    const { data: existingVarVersion } = await supabase
      .from('tour_variation_versions')
      .select('id')
      .eq('variation_id', variation.id)
      .eq('language', targetLanguage)
      .single()

    if (!existingVarVersion) {
      // Try to get source version first
      const { data: sourceVarVersion } = await supabase
        .from('tour_variation_versions')
        .select('*')
        .eq('variation_id', variation.id)
        .eq('language', sourceLanguage)
        .single()

      // Use source version or main variation content
      const varSourceContent = sourceVarVersion || {
        variation_name: variation.variation_name,
        inclusions: variation.inclusions,
        exclusions: variation.exclusions,
        optional_extras: variation.optional_extras
      }

      // Translate variation content
      const translatedVarContent = await translateFields(
        varSourceContent,
        TOUR_VARIATION_TRANSLATION_FIELDS,
        sourceLanguage,
        targetLanguage as Language
      )

      // Create variation version
      const { data: newVarVersion, error: varError } = await supabase
        .from('tour_variation_versions')
        .insert({
          variation_id: variation.id,
          language: targetLanguage,
          variation_name: translatedVarContent.variation_name || varSourceContent.variation_name || 'Untitled Variation',
          inclusions: translatedVarContent.inclusions || varSourceContent.inclusions || [],
          exclusions: translatedVarContent.exclusions || varSourceContent.exclusions || [],
          optional_extras: translatedVarContent.optional_extras || varSourceContent.optional_extras || []
        })
        .select()
        .single()

      if (varError) {
        console.error('Error creating variation version:', varError)
      } else {
        results.variationVersion = newVarVersion
      }
    }

    // ===== TEMPLATE VERSION =====
    // Check if target template version already exists
    const { data: existingTmpVersion } = await supabase
      .from('tour_template_versions')
      .select('id')
      .eq('template_id', variation.template_id)
      .eq('language', targetLanguage)
      .single()

    if (!existingTmpVersion) {
      // Get the template
      const { data: template } = await supabase
        .from('tour_templates')
        .select('template_name, short_description, long_description, highlights, main_attractions, best_for, inclusions, exclusions')
        .eq('id', variation.template_id)
        .single()

      // Try to get source version first
      const { data: sourceTmpVersion } = await supabase
        .from('tour_template_versions')
        .select('*')
        .eq('template_id', variation.template_id)
        .eq('language', sourceLanguage)
        .single()

      // Use source version or main template content
      const tmpSourceContent = sourceTmpVersion || template

      if (tmpSourceContent) {
        // Translate template content
        const translatedTmpContent = await translateFields(
          tmpSourceContent,
          TOUR_TEMPLATE_TRANSLATION_FIELDS,
          sourceLanguage,
          targetLanguage as Language
        )

        // Create template version
        const { data: newTmpVersion, error: tmpError } = await supabase
          .from('tour_template_versions')
          .insert({
            template_id: variation.template_id,
            language: targetLanguage,
            template_name: translatedTmpContent.template_name || tmpSourceContent.template_name || 'Untitled Tour',
            short_description: translatedTmpContent.short_description || tmpSourceContent.short_description || null,
            long_description: translatedTmpContent.long_description || tmpSourceContent.long_description || null,
            highlights: translatedTmpContent.highlights || tmpSourceContent.highlights || [],
            main_attractions: translatedTmpContent.main_attractions || tmpSourceContent.main_attractions || [],
            best_for: translatedTmpContent.best_for || tmpSourceContent.best_for || [],
            inclusions: translatedTmpContent.inclusions || tmpSourceContent.inclusions || [],
            exclusions: translatedTmpContent.exclusions || tmpSourceContent.exclusions || []
          })
          .select()
          .single()

        if (tmpError) {
          console.error('Error creating template version:', tmpError)
        } else {
          results.templateVersion = newTmpVersion
        }
      }
    }

    // ===== DAILY ITINERARY =====
    // Fetch and translate variation daily itinerary
    const { data: dailyItinerary } = await supabase
      .from('variation_daily_itinerary')
      .select('*')
      .eq('variation_id', variation.id)
      .order('day_number', { ascending: true })

    if (dailyItinerary && dailyItinerary.length > 0) {
      // Note: Daily itinerary doesn't have a separate versions table in the current schema
      // The translations are stored in the template's itinerary JSONB field
      // For now, we'll translate and return the content for the frontend to display
      const translatedDays = await translateDailyItinerary(
        dailyItinerary,
        sourceLanguage,
        targetLanguage as Language
      )
      results.translatedDailyItinerary = translatedDays
    }

    return NextResponse.json({
      success: true,
      data: results,
      translated: true,
      sourceLanguage,
      targetLanguage
    })
  } catch (error: any) {
    console.error('Error in tour copy-translate:', error)
    // Localized translation-failure surface (same pattern + keys as the
    // itineraries copy-translate route). translateText throws on systemic
    // failure, so this no longer silently produces an untranslated version.
    const locale = await getServerLocale()
    return NextResponse.json(
      {
        success: false,
        error: lookupServerMessage(locale, 'translate.errors.versionFailed', { reason: error?.message || 'Unknown error' })
      },
      { status: 500 }
    )
  }
}
