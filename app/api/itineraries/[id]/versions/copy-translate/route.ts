import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { translateFields, ITINERARY_TRANSLATION_FIELDS, ITINERARY_DAY_TRANSLATION_FIELDS, SERVICE_TRANSLATION_FIELDS } from '@/lib/translation-utils'
import type { Language } from '@/types/multilingual'

const supabase = createServerClient()

// Helper function to translate itinerary days
async function translateItineraryDays(
  itineraryId: string,
  sourceLanguage: Language,
  targetLanguage: Language
) {
  // Fetch all days for this itinerary
  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select('id, title, description, city, overnight_city')
    .eq('itinerary_id', itineraryId)
    .order('day_number', { ascending: true })

  if (daysError || !days || days.length === 0) {
    console.log('No days found for itinerary:', itineraryId)
    return []
  }

  const translatedDays = []

  for (const day of days) {
    // Check if target version already exists for this day
    const { data: existingDayVersion } = await supabase
      .from('itinerary_day_versions')
      .select('id')
      .eq('itinerary_day_id', day.id)
      .eq('language', targetLanguage)
      .single()

    if (existingDayVersion) {
      console.log(`Day version already exists for day ${day.id} in ${targetLanguage}`)
      continue
    }

    // Try to get source day version first
    const { data: sourceDayVersion } = await supabase
      .from('itinerary_day_versions')
      .select('*')
      .eq('itinerary_day_id', day.id)
      .eq('language', sourceLanguage)
      .single()

    // Use source version if available, otherwise use main day content
    const sourceContent = sourceDayVersion || day

    // Translate the day content
    console.log(`[copy-translate] Translating day ${day.id}: "${sourceContent.title}"`)
    const translatedContent = await translateFields(
      sourceContent,
      ITINERARY_DAY_TRANSLATION_FIELDS,
      sourceLanguage,
      targetLanguage
    )
    console.log(`[copy-translate] Day translated: "${translatedContent.title}"`)

    // Create the day version
    const { data: newDayVersion, error: createDayError } = await supabase
      .from('itinerary_day_versions')
      .insert({
        itinerary_day_id: day.id,
        language: targetLanguage,
        title: translatedContent.title || sourceContent.title || null,
        description: translatedContent.description || sourceContent.description || null,
        city: translatedContent.city || sourceContent.city || null,
        overnight_city: translatedContent.overnight_city || sourceContent.overnight_city || null
      })
      .select()
      .single()

    if (createDayError) {
      console.error('[copy-translate] Error creating day version:', createDayError)
    } else {
      console.log(`[copy-translate] Created day version: ${newDayVersion.id}`)
      translatedDays.push(newDayVersion)
    }
  }

  return translatedDays
}

// Helper function to translate itinerary services
async function translateItineraryServices(
  itineraryId: string,
  sourceLanguage: Language,
  targetLanguage: Language
) {
  // Fetch all days for this itinerary to get their services
  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('itinerary_id', itineraryId)
    .order('day_number', { ascending: true })

  if (daysError || !days || days.length === 0) {
    console.log('No days found for itinerary:', itineraryId)
    return []
  }

  // Fetch all services across all days
  const dayIds = days.map((d: any) => d.id)
  const { data: services, error: servicesError } = await supabase
    .from('itinerary_services')
    .select('id, service_name, notes')
    .in('itinerary_day_id', dayIds)

  if (servicesError || !services || services.length === 0) {
    console.log('No services found for itinerary:', itineraryId)
    return []
  }

  const translatedServices = []

  for (const service of services) {
    // Check if target version already exists for this service
    const { data: existingServiceVersion } = await supabase
      .from('itinerary_service_versions')
      .select('id')
      .eq('itinerary_service_id', service.id)
      .eq('language', targetLanguage)
      .single()

    if (existingServiceVersion) {
      console.log(`Service version already exists for service ${service.id} in ${targetLanguage}`)
      continue
    }

    // Try to get source service version first
    const { data: sourceServiceVersion } = await supabase
      .from('itinerary_service_versions')
      .select('*')
      .eq('itinerary_service_id', service.id)
      .eq('language', sourceLanguage)
      .single()

    // Use source version if available, otherwise use base service content
    const sourceContent = sourceServiceVersion || service

    // Translate the service content
    console.log(`[copy-translate] Translating service ${service.id}: "${sourceContent.service_name}"`)
    const translatedContent = await translateFields(
      sourceContent,
      SERVICE_TRANSLATION_FIELDS,
      sourceLanguage,
      targetLanguage
    )
    console.log(`[copy-translate] Service translated: "${translatedContent.service_name}"`)

    // Create the service version
    const { data: newServiceVersion, error: createServiceError } = await supabase
      .from('itinerary_service_versions')
      .insert({
        itinerary_service_id: service.id,
        language: targetLanguage,
        service_name: translatedContent.service_name || sourceContent.service_name || null,
        notes: translatedContent.notes || sourceContent.notes || null
      })
      .select()
      .single()

    if (createServiceError) {
      console.error('[copy-translate] Error creating service version:', createServiceError)
    } else {
      console.log(`[copy-translate] Created service version: ${newServiceVersion.id}`)
      translatedServices.push(newServiceVersion)
    }
  }

  return translatedServices
}

// POST - Copy existing version and translate to target language
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { targetLanguage, forceRetranslate } = body

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

    if (existing && !forceRetranslate) {
      return NextResponse.json(
        { success: false, error: `${targetLanguage.toUpperCase()} version already exists` },
        { status: 409 }
      )
    }

    // If force retranslate, delete existing versions first
    if (existing && forceRetranslate) {
      console.log('[copy-translate] Force retranslate: deleting existing versions for', targetLanguage)

      // Delete itinerary version
      await supabase
        .from('itinerary_versions')
        .delete()
        .eq('itinerary_id', id)
        .eq('language', targetLanguage)

      // Delete day versions
      const { data: dayIds } = await supabase
        .from('itinerary_days')
        .select('id')
        .eq('itinerary_id', id)

      if (dayIds && dayIds.length > 0) {
        await supabase
          .from('itinerary_day_versions')
          .delete()
          .in('itinerary_day_id', dayIds.map((d: any) => d.id))
          .eq('language', targetLanguage)

        // Delete service versions
        const { data: serviceIds } = await supabase
          .from('itinerary_services')
          .select('id')
          .in('itinerary_day_id', dayIds.map((d: any) => d.id))

        if (serviceIds && serviceIds.length > 0) {
          await supabase
            .from('itinerary_service_versions')
            .delete()
            .in('itinerary_service_id', serviceIds.map((s: any) => s.id))
            .eq('language', targetLanguage)
        }
      }

      console.log('[copy-translate] Deleted existing versions, proceeding with fresh translation')
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
        .select('trip_name, notes, pickup_location, guide_notes, vehicle_notes, inclusions, exclusions')
        .eq('id', id)
        .single()

      if (!itinerary) {
        return NextResponse.json(
          { success: false, error: 'No source content found to translate' },
          { status: 404 }
        )
      }

      // Use itinerary as source
      console.log('[copy-translate] Using base itinerary as source. Source fields:', {
        trip_name: itinerary.trip_name,
        notes: itinerary.notes?.substring(0, 50),
        pickup_location: itinerary.pickup_location,
        inclusions: itinerary.inclusions,
        exclusions: itinerary.exclusions
      })

      const translatedContent = await translateFields(
        itinerary,
        ITINERARY_TRANSLATION_FIELDS,
        'en' as Language, // Assume original content is English
        targetLanguage as Language
      )

      console.log('[copy-translate] Translated itinerary content:', {
        trip_name: translatedContent.trip_name,
        notes: (translatedContent.notes as string)?.substring(0, 50),
        pickup_location: translatedContent.pickup_location,
        inclusions: translatedContent.inclusions,
        exclusions: translatedContent.exclusions
      })

      const { data: newVersion, error: createError } = await supabase
        .from('itinerary_versions')
        .insert({
          itinerary_id: id,
          language: targetLanguage,
          trip_name: translatedContent.trip_name || itinerary.trip_name || 'Untitled Trip',
          notes: translatedContent.notes || null,
          pickup_location: translatedContent.pickup_location || null,
          guide_notes: translatedContent.guide_notes || null,
          vehicle_notes: translatedContent.vehicle_notes || null,
          inclusions: translatedContent.inclusions || itinerary.inclusions || null,
          exclusions: translatedContent.exclusions || itinerary.exclusions || null
        })
        .select()
        .single()

      if (createError) throw createError

      console.log('[copy-translate] Created itinerary version:', {
        id: newVersion.id,
        language: newVersion.language,
        trip_name: newVersion.trip_name
      })

      // Also translate itinerary days and services
      const translatedDays = await translateItineraryDays(
        id,
        'en' as Language,
        targetLanguage as Language
      )

      const translatedServices = await translateItineraryServices(
        id,
        'en' as Language,
        targetLanguage as Language
      )

      return NextResponse.json({
        success: true,
        data: newVersion,
        translatedDays,
        translatedServices,
        translated: true,
        sourceLanguage: 'en',
        targetLanguage
      })
    }

    // Also fetch the base itinerary to fill in any missing fields from the version
    const { data: baseItinerary } = await supabase
      .from('itineraries')
      .select('trip_name, notes, pickup_location, guide_notes, vehicle_notes, inclusions, exclusions')
      .eq('id', id)
      .single()

    // Merge: version fields take precedence, but fall back to base itinerary for any missing/null fields
    const mergedSource = {
      trip_name: sourceVersion.trip_name || baseItinerary?.trip_name,
      notes: sourceVersion.notes || baseItinerary?.notes,
      pickup_location: sourceVersion.pickup_location || baseItinerary?.pickup_location,
      guide_notes: sourceVersion.guide_notes || baseItinerary?.guide_notes,
      vehicle_notes: sourceVersion.vehicle_notes || baseItinerary?.vehicle_notes,
      inclusions: sourceVersion.inclusions || baseItinerary?.inclusions,
      exclusions: sourceVersion.exclusions || baseItinerary?.exclusions
    }

    // Translate the source version content (merged with base itinerary)
    console.log('[copy-translate] Merged source fields:', {
      trip_name: mergedSource.trip_name,
      notes: mergedSource.notes?.substring(0, 50),
      pickup_location: mergedSource.pickup_location,
      hasInclusions: !!mergedSource.inclusions,
      hasExclusions: !!mergedSource.exclusions
    })

    const translatedContent = await translateFields(
      mergedSource,
      ITINERARY_TRANSLATION_FIELDS,
      sourceLanguage,
      targetLanguage as Language
    )

    console.log('[copy-translate] Translated content:', {
      trip_name: translatedContent.trip_name,
      notes: (translatedContent.notes as string)?.substring(0, 50)
    })

    // Create the new version with translated content
    const { data: newVersion, error: createError } = await supabase
      .from('itinerary_versions')
      .insert({
        itinerary_id: id,
        language: targetLanguage,
        trip_name: translatedContent.trip_name || mergedSource.trip_name,
        notes: translatedContent.notes || null,
        pickup_location: translatedContent.pickup_location || null,
        guide_notes: translatedContent.guide_notes || null,
        vehicle_notes: translatedContent.vehicle_notes || null,
        inclusions: translatedContent.inclusions || mergedSource.inclusions || null,
        exclusions: translatedContent.exclusions || mergedSource.exclusions || null
      })
      .select()
      .single()

    if (createError) throw createError

    // Also translate itinerary days and services
    const translatedDays = await translateItineraryDays(
      id,
      sourceLanguage,
      targetLanguage as Language
    )

    const translatedServices = await translateItineraryServices(
      id,
      sourceLanguage,
      targetLanguage as Language
    )

    return NextResponse.json({
      success: true,
      data: newVersion,
      translatedDays,
      translatedServices,
      translated: true,
      sourceLanguage,
      targetLanguage
    })
  } catch (error: any) {
    console.error('Error in copy-translate:', error)
    return NextResponse.json(
      {
        success: false,
        error: `Failed to translate and create version: ${error?.message || 'Unknown error'}`
      },
      { status: 500 }
    )
  }
}
