import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function PUT(
  request: Request,
  { params }: { params: { id: string; dayId: string; serviceId: string } }
) {
  try {
    const { serviceId } = await params
    const body = await request.json()

    const { data, error } = await supabase
      .from('itinerary_services')
      .update({
        service_name: body.service_name,
        quantity: body.quantity,
        rate_eur: body.rate_eur,
        rate_non_eur: body.rate_non_eur || body.rate_eur,
        total_cost: body.total_cost,
        notes: body.notes
      })
      .eq('id', serviceId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error updating service:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update service',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; dayId: string; serviceId: string } }
) {
  try {
    const { serviceId } = await params

    const { error } = await supabase
      .from('itinerary_services')
      .delete()
      .eq('id', serviceId)

    if (error) throw error

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Error deleting service:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete service',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}