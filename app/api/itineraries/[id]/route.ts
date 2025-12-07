import { NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// GET - Used by VIEW page
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    
    const { data, error } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching itinerary:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch itinerary',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
// PUT - Used by EDIT page AND ResourceAssignment
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Prepare update data - include ALL fields that might be sent
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Basic itinerary fields
    if (body.client_name !== undefined) updateData.client_name = body.client_name
    if (body.client_email !== undefined) updateData.client_email = body.client_email
    if (body.client_phone !== undefined) updateData.client_phone = body.client_phone
    if (body.trip_name !== undefined) updateData.trip_name = body.trip_name
    if (body.start_date !== undefined) updateData.start_date = body.start_date
    if (body.end_date !== undefined) updateData.end_date = body.end_date
    if (body.num_adults !== undefined) updateData.num_adults = body.num_adults
    if (body.num_children !== undefined) updateData.num_children = body.num_children
    if (body.total_cost !== undefined) updateData.total_cost = body.total_cost
    if (body.status !== undefined) updateData.status = body.status
    if (body.notes !== undefined) updateData.notes = body.notes

    // ⭐ Resource fields - ADD THESE ⭐
    if (body.assigned_guide_id !== undefined) updateData.assigned_guide_id = body.assigned_guide_id
    if (body.assigned_vehicle_id !== undefined) updateData.assigned_vehicle_id = body.assigned_vehicle_id
    if (body.guide_notes !== undefined) updateData.guide_notes = body.guide_notes
    if (body.vehicle_notes !== undefined) updateData.vehicle_notes = body.vehicle_notes
    if (body.pickup_location !== undefined) updateData.pickup_location = body.pickup_location
    if (body.pickup_time !== undefined) updateData.pickup_time = body.pickup_time

    const { data, error } = await supabase
      .from('itineraries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error updating itinerary:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update itinerary',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
// DELETE - Delete an itinerary
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params

    console.log('🗑️ Deleting itinerary:', id)

    // First, delete all days and services associated with this itinerary
    // Delete services (they're linked to days)
    const { data: days } = await supabase
      .from('itinerary_days')
      .select('id')
      .eq('itinerary_id', id)

    if (days && days.length > 0) {
      const dayIds = days.map(d => d.id)
      
      // Delete services for these days
      await supabase
        .from('itinerary_services')
        .delete()
        .in('itinerary_day_id', dayIds)
    }

    // Delete days
    await supabase
      .from('itinerary_days')
      .delete()
      .eq('itinerary_id', id)

    // Finally, delete the itinerary
    const { error } = await supabase
      .from('itineraries')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ Error deleting itinerary:', error)
      throw error
    }

    console.log('✅ Itinerary deleted successfully')

    return NextResponse.json({
      success: true,
      message: 'Itinerary deleted successfully'
    })

  } catch (error: any) {
    console.error('❌ Error in DELETE:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete itinerary',
        message: error.message
      },
      { status: 500 }
    )
  }
}