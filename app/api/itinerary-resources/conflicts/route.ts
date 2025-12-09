// app/api/itinerary-resources/conflicts/route.ts

import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    
    const itineraryId = searchParams.get('itinerary_id')
    
    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'itinerary_id required' },
        { status: 400 }
      )
    }
    
    // Try to use the view first, fall back to query if view doesn't exist
    const { data: viewData, error: viewError } = await supabase
      .from('resource_conflicts')
      .select('*')
      .or(`itinerary_1_id.eq.${itineraryId},itinerary_2_id.eq.${itineraryId}`)
    
    if (!viewError && viewData) {
      // Format conflicts for the response
      const conflicts = viewData.map((c: any) => ({
        resource_id: c.resource_id,
        resource_name: c.resource_name,
        conflicting_itinerary: c.itinerary_1_id === itineraryId 
          ? c.itinerary_2_code || c.itinerary_2_id 
          : c.itinerary_1_code || c.itinerary_1_id,
        dates: `${c.conflict_start || c.start_date_1} - ${c.conflict_end || c.end_date_1}`
      }))
      
      return NextResponse.json({ success: true, data: conflicts })
    }
    
    // Fallback: Manual conflict detection query
    const { data: resources, error: resourcesError } = await supabase
      .from('itinerary_resources')
      .select('*')
      .eq('itinerary_id', itineraryId)
      .eq('status', 'confirmed')
    
    if (resourcesError) throw resourcesError
    
    if (!resources || resources.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }
    
    // Check each resource for conflicts with other itineraries
    const conflicts: any[] = []
    
    for (const resource of resources) {
      const { data: conflicting, error: conflictError } = await supabase
        .from('itinerary_resources')
        .select(`
          *,
          itineraries!inner (
            itinerary_code,
            client_name
          )
        `)
        .eq('resource_type', resource.resource_type)
        .eq('resource_id', resource.resource_id)
        .eq('status', 'confirmed')
        .neq('itinerary_id', itineraryId)
        .lte('start_date', resource.end_date || resource.start_date)
        .gte('end_date', resource.start_date)
      
      if (!conflictError && conflicting && conflicting.length > 0) {
        conflicting.forEach((c: any) => {
          conflicts.push({
            resource_id: resource.resource_id,
            resource_name: resource.resource_name,
            conflicting_itinerary: c.itineraries?.itinerary_code || c.itinerary_id,
            dates: `${c.start_date} - ${c.end_date || c.start_date}`
          })
        })
      }
    }
    
    return NextResponse.json({ success: true, data: conflicts })
  } catch (error) {
    console.error('Error checking conflicts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check conflicts' },
      { status: 500 }
    )
  }
}