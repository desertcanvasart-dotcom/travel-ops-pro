import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// Use the service-role key (admin client) — RLS on itineraries (Phase 2B)
// requires `user_is_in_org(org_id)` which needs the user's JWT. This module
// instantiates the client at import time, so it has no session context. We
// rely on the explicit `eq('org_id', orgId)` app-layer check below for
// tenant isolation. Matches the pattern used by the sibling
// /api/itineraries/[id]/route.ts. The previous anon-key client silently
// returned no rows (RLS filter), and the route surfaced that as a 404.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    // Batch-fetch services + language versions for ALL days, then group in
    // memory. Previously this ran 3 queries PER DAY (services, service versions,
    // day version) — a 14-day itinerary meant ~42 round-trips. Now it's 3 total.
    const dayIds = (days || []).map(d => d.id)

    const { data: allServices } = dayIds.length > 0
      ? await supabase
          .from('itinerary_services')
          .select('*')
          .in('itinerary_day_id', dayIds)
          .order('created_at', { ascending: true })
      : { data: [] as any[] }

    const serviceIds = (allServices || []).map((s: any) => s.id)

    const { data: allServiceVersions } = serviceIds.length > 0
      ? await supabase
          .from('itinerary_service_versions')
          .select('itinerary_service_id, service_name, notes')
          .in('itinerary_service_id', serviceIds)
          .eq('language', language)
      : { data: [] as any[] }

    const { data: allDayVersions } = dayIds.length > 0
      ? await supabase
          .from('itinerary_day_versions')
          .select('itinerary_day_id, title, description, city, overnight_city')
          .in('itinerary_day_id', dayIds)
          .eq('language', language)
      : { data: [] as any[] }

    // Index by day / service id for in-memory joins.
    const servicesByDay = new Map<string, any[]>()
    for (const s of (allServices || [])) {
      const arr = servicesByDay.get(s.itinerary_day_id) || []
      arr.push(s)
      servicesByDay.set(s.itinerary_day_id, arr)
    }
    const serviceVersionById = new Map<string, { service_name?: string; notes?: string }>()
    for (const sv of (allServiceVersions || [])) {
      serviceVersionById.set(sv.itinerary_service_id, { service_name: sv.service_name, notes: sv.notes })
    }
    const dayVersionByDay = new Map<string, any>()
    for (const dv of (allDayVersions || [])) {
      dayVersionByDay.set(dv.itinerary_day_id, dv)
    }

    const daysWithServices = (days || []).map((day) => {
      // Merge service versions (version takes precedence)
      const mergedServices = (servicesByDay.get(day.id) || []).map((service: any) => {
        const version = serviceVersionById.get(service.id)
        return {
          ...service,
          service_name: version?.service_name || service.service_name,
          notes: version?.notes ?? service.notes
        }
      })

      // Merge version content with main day (version takes precedence)
      const dayVersion = dayVersionByDay.get(day.id)
      return {
        ...day,
        title: dayVersion?.title || day.title,
        description: dayVersion?.description || day.description,
        city: dayVersion?.city || day.city,
        overnight_city: dayVersion?.overnight_city || day.overnight_city,
        services: mergedServices
      }
    })

    // Add diagnostic info for non-English languages (reuses the batched data
    // fetched above — no extra round-trips).
    let debug: any = undefined
    if (language !== 'en') {
      debug = {
        language,
        totalDays: days?.length || 0,
        dayVersionsFound: (allDayVersions || []).length,
        totalServices: (allServices || []).length,
        serviceVersionsFound: (allServiceVersions || []).length
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