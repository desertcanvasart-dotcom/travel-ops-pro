// app/api/itinerary-resources/route.ts

import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    
    const itineraryId = searchParams.get('itinerary_id')
    const resourceType = searchParams.get('resource_type')
    
    let query = supabase
      .from('itinerary_resources')
      .select('*')
      .order('start_date', { ascending: true })
    
    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }
    
    if (resourceType) {
      query = query.eq('resource_type', resourceType)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching itinerary resources:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch resources' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    
    const {
      itinerary_id,
      itinerary_day_id,
      resource_type,
      resource_id,
      resource_name,
      start_date,
      end_date,
      notes,
      quantity,
      cost_eur,
      cost_non_eur,
      status
    } = body
    
    // Validate required fields
    if (!itinerary_id || !resource_type || !resource_id || !start_date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const { data, error } = await supabase
      .from('itinerary_resources')
      .insert({
        itinerary_id,
        itinerary_day_id: itinerary_day_id || null,
        resource_type,
        resource_id,
        resource_name: resource_name || null,
        start_date,
        end_date: end_date || start_date,
        notes: notes || null,
        quantity: quantity || 1,
        cost_eur: cost_eur || null,
        cost_non_eur: cost_non_eur || null,
        status: status || 'confirmed'
      })
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating itinerary resource:', error)
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'This resource is already assigned for this date' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create resource assignment' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Resource ID required' },
        { status: 400 }
      )
    }
    
    const { error } = await supabase
      .from('itinerary_resources')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting itinerary resource:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete resource' },
      { status: 500 }
    )
  }
}