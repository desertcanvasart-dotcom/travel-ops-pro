import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    // Confirm the itinerary belongs to this org before reading children
    const { data: parent } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Get language from query params (default to 'en')
    const { searchParams } = new URL(request.url)
    const language = searchParams.get('language') || 'en'
    console.log(`[days-api] Fetching days for itinerary ${id}, language=${language}`)

    // Fetch all days for this itinerary
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', id)
      .order('day_number', { ascending: true })

    if (daysError) throw daysError

    // Fetch services and language versions for each day
    const daysWithServices = await Promise.all(
      (days || []).map(async (day) => {
        // Fetch services
        const { data: services, error: servicesError } = await supabase
          .from('itinerary_services')
          .select('*')
          .eq('itinerary_day_id', day.id)
          .order('created_at', { ascending: true })

        if (servicesError) {
          console.error('Error fetching services for day:', servicesError)
        }

        // Fetch language versions for services
        let serviceVersionsMap: Record<string, { service_name?: string; notes?: string }> = {}
        if (services && services.length > 0) {
          const serviceIds = services.map((s: any) => s.id)
          const { data: serviceVersions } = await supabase
            .from('itinerary_service_versions')
            .select('itinerary_service_id, service_name, notes')
            .in('itinerary_service_id', serviceIds)
            .eq('language', language)

          if (serviceVersions) {
            for (const sv of serviceVersions) {
              serviceVersionsMap[sv.itinerary_service_id] = {
                service_name: sv.service_name,
                notes: sv.notes
              }
            }
          }
        }

        // Merge service versions (version takes precedence)
        const mergedServices = (services || []).map((service: any) => {
          const version = serviceVersionsMap[service.id]
          return {
            ...service,
            service_name: version?.service_name || service.service_name,
            notes: version?.notes ?? service.notes
          }
        })

        // Fetch language version for this day
        const { data: dayVersion, error: dayVersionError } = await supabase
          .from('itinerary_day_versions')
          .select('title, description, city, overnight_city')
          .eq('itinerary_day_id', day.id)
          .eq('language', language)
          .single()

        if (language !== 'en') {
          console.log(`[days-api] Day ${day.day_number} (${day.id}): version found=${!!dayVersion}, error=${dayVersionError?.message || 'none'}`)
          if (dayVersion) {
            console.log(`[days-api] Day ${day.day_number} version title: "${dayVersion.title}"`)
          }
          // Check service versions found
          const svCount = Object.keys(serviceVersionsMap).length
          console.log(`[days-api] Day ${day.day_number}: ${services?.length || 0} services, ${svCount} service versions found`)
        }

        // Merge version content with main day (version takes precedence)
        return {
          ...day,
          title: dayVersion?.title || day.title,
          description: dayVersion?.description || day.description,
          city: dayVersion?.city || day.city,
          overnight_city: dayVersion?.overnight_city || day.overnight_city,
          services: mergedServices
        }
      })
    )

    // Add diagnostic info for non-English languages
    let debug: any = undefined
    if (language !== 'en') {
      // Quick check: how many day versions and service versions exist for this language?
      const dayIds = (days || []).map(d => d.id)
      const { count: dayVersionCount } = await supabase
        .from('itinerary_day_versions')
        .select('*', { count: 'exact', head: true })
        .in('itinerary_day_id', dayIds)
        .eq('language', language)

      // Get all service IDs for this itinerary
      const { data: allServices } = await supabase
        .from('itinerary_services')
        .select('id')
        .in('itinerary_day_id', dayIds)

      let serviceVersionCount = 0
      if (allServices && allServices.length > 0) {
        const { count } = await supabase
          .from('itinerary_service_versions')
          .select('*', { count: 'exact', head: true })
          .in('itinerary_service_id', allServices.map(s => s.id))
          .eq('language', language)
        serviceVersionCount = count || 0
      }

      debug = {
        language,
        totalDays: days?.length || 0,
        dayVersionsFound: dayVersionCount || 0,
        totalServices: allServices?.length || 0,
        serviceVersionsFound: serviceVersionCount
      }
      console.log('[days-api] Debug summary:', debug)
    }

    return NextResponse.json({
      success: true,
      data: daysWithServices,
      language,
      debug
    })
  } catch (error) {
    console.error('Error fetching itinerary days:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch itinerary days',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}