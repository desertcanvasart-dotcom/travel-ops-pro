import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'
import { translateFields, ITINERARY_TRANSLATION_FIELDS } from '@/lib/translation-utils'
import type { Language } from '@/types/multilingual'

const supabase = createClient()

// POST - Copy existing version and translate to target language
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { targetLanguage } = body

    // Validate target language
    if (!targetLanguage || !['en', 'ja'].includes(targetLanguage)) {
      return NextResponse.json(
        { success: false, error: 'Invalid target language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Check if target version already exists
    const { data: existing } = await supabase
      .from('itinerary_versions')
      .select('id')
      .eq('itinerary_id', id)
      .eq('language', targetLanguage)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: `${targetLanguage.toUpperCase()} version already exists` },
        { status: 409 }
      )
    }

    // Find source version (the other language)
    const sourceLanguage: Language = targetLanguage === 'en' ? 'ja' : 'en'

    const { data: sourceVersion, error: sourceError } = await supabase
      .from('itinerary_versions')
      .select('*')
      .eq('itinerary_id', id)
      .eq('language', sourceLanguage)
      .single()

    if (sourceError || !sourceVersion) {
      // If no version exists, try to get content from main itinerary
      const { data: itinerary } = await supabase
        .from('itineraries')
        .select('trip_name, notes, pickup_location, guide_notes, vehicle_notes')
        .eq('id', id)
        .single()

      if (!itinerary) {
        return NextResponse.json(
          { success: false, error: 'No source content found to translate' },
          { status: 404 }
        )
      }

      // Use itinerary as source
      const translatedContent = await translateFields(
        itinerary,
        ITINERARY_TRANSLATION_FIELDS,
        'en' as Language, // Assume original content is English
        targetLanguage as Language
      )

      const { data: newVersion, error: createError } = await supabase
        .from('itinerary_versions')
        .insert({
          itinerary_id: id,
          language: targetLanguage,
          trip_name: translatedContent.trip_name || itinerary.trip_name || 'Untitled Trip',
          notes: translatedContent.notes || null,
          pickup_location: translatedContent.pickup_location || null,
          guide_notes: translatedContent.guide_notes || null,
          vehicle_notes: translatedContent.vehicle_notes || null
        })
        .select()
        .single()

      if (createError) throw createError

      return NextResponse.json({
        success: true,
        data: newVersion,
        translated: true,
        sourceLanguage: 'en',
        targetLanguage
      })
    }

    // Translate the source version content
    const translatedContent = await translateFields(
      sourceVersion,
      ITINERARY_TRANSLATION_FIELDS,
      sourceLanguage,
      targetLanguage as Language
    )

    // Create the new version with translated content
    const { data: newVersion, error: createError } = await supabase
      .from('itinerary_versions')
      .insert({
        itinerary_id: id,
        language: targetLanguage,
        trip_name: translatedContent.trip_name || sourceVersion.trip_name,
        notes: translatedContent.notes || null,
        pickup_location: translatedContent.pickup_location || null,
        guide_notes: translatedContent.guide_notes || null,
        vehicle_notes: translatedContent.vehicle_notes || null
      })
      .select()
      .single()

    if (createError) throw createError

    return NextResponse.json({
      success: true,
      data: newVersion,
      translated: true,
      sourceLanguage,
      targetLanguage
    })
  } catch (error) {
    console.error('Error in copy-translate:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to translate and create version',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
