import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Server-side admin client — bypasses RLS for reliable reads/writes
const supabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
// Keep alias for existing references in the file
const supabaseAdmin = supabase

// GET - Used by VIEW page
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    // Fetch language versions
    const { data: versions, error: versionsError } = await supabase
      .from('itinerary_versions')
      .select('*')
      .eq('itinerary_id', id)

    // Build versions object keyed by language
    const versionsMap: Record<string, any> = {}
    if (!versionsError && versions) {
      versions.forEach((v: { language: string; [key: string]: any }) => {
        versionsMap[v.language] = v
      })
    }

    const availableLanguages = Object.keys(versionsMap)

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        available_languages: availableLanguages,
        versions: versionsMap
      }
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
  { params }: { params: Promise<{ id: string }> }
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

    // Resource fields
    if (body.assigned_guide_id !== undefined) updateData.assigned_guide_id = body.assigned_guide_id
    if (body.assigned_vehicle_id !== undefined) updateData.assigned_vehicle_id = body.assigned_vehicle_id
    if (body.guide_notes !== undefined) updateData.guide_notes = body.guide_notes
    if (body.vehicle_notes !== undefined) updateData.vehicle_notes = body.vehicle_notes
    if (body.pickup_location !== undefined) updateData.pickup_location = body.pickup_location
    if (body.pickup_time !== undefined) updateData.pickup_time = body.pickup_time

    // Inclusions and exclusions
    if (body.inclusions !== undefined) updateData.inclusions = body.inclusions
    if (body.exclusions !== undefined) updateData.exclusions = body.exclusions

    // Get current itinerary status before update (for booking auto-creation)
    let previousStatus: string | null = null
    if (body.status === 'confirmed') {
      const { data: currentItinerary } = await supabase
        .from('itineraries')
        .select('status')
        .eq('id', id)
        .single()
      previousStatus = currentItinerary?.status || null
    }

    const { data, error } = await supabase
      .from('itineraries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Auto-create booking when status changes to "confirmed"
    if (body.status === 'confirmed' && previousStatus !== 'confirmed' && data) {
      try {
        // Check if booking already exists (use admin client to bypass RLS)
        const { data: existingBooking } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('itinerary_id', id)
          .single()

        if (!existingBooking) {
          // Generate booking code
          const { data: codeData } = await supabaseAdmin.rpc('generate_booking_code')
          const bookingCode = codeData || `BKG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`

          // Calculate deposit (30% default)
          const depositAmount = (data.total_cost || 0) * 0.3
          const balanceDue = (data.total_cost || 0) - depositAmount

          // Create booking directly with admin client
          const { data: newBooking, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .insert({
              booking_code: bookingCode,
              itinerary_id: id,
              client_name: data.client_name,
              client_email: data.client_email,
              client_phone: data.client_phone,
              trip_name: data.trip_name,
              start_date: data.start_date,
              end_date: data.end_date,
              num_adults: data.num_adults || 1,
              num_children: data.num_children || 0,
              total_cost: data.total_cost || 0,
              currency: data.currency || 'EUR',
              tier: data.tier,
              status: 'pending',
              deposit_amount: depositAmount,
              balance_due: balanceDue,
              assigned_guide_id: data.assigned_guide_id,
              assigned_vehicle_id: data.assigned_vehicle_id,
            })
            .select()
            .single()

          if (bookingError) {
            console.error('⚠️ Failed to create booking:', bookingError)
          } else {
            console.log('✅ Auto-created booking for confirmed itinerary:', id, 'Code:', bookingCode)

            // Populate suppliers from itinerary services
            if (newBooking) {
              const { data: days } = await supabaseAdmin
                .from('itinerary_days')
                .select('id, date, day_number')
                .eq('itinerary_id', id)
                .order('day_number', { ascending: true })

              if (days && days.length > 0) {
                const dayIds = days.map(d => d.id)
                const { data: services } = await supabaseAdmin
                  .from('itinerary_services')
                  .select('*, itinerary_day_id')
                  .in('itinerary_day_id', dayIds)

                if (services && services.length > 0) {
                  const supplierStatuses = services.map(service => {
                    const day = days.find(d => d.id === service.itinerary_day_id)
                    return {
                      booking_id: newBooking.id,
                      supplier_type: service.service_type || 'other',
                      supplier_name: service.service_name || service.supplier_name || 'Unknown',
                      service_description: service.notes,
                      service_date: day?.date,
                      quoted_cost: service.total_cost,
                      status: 'pending'
                    }
                  })

                  await supabaseAdmin
                    .from('booking_supplier_status')
                    .insert(supplierStatuses)
                }
              }
            }
          }
        }
      } catch (bookingError) {
        console.error('⚠️ Failed to auto-create booking:', bookingError)
        // Don't fail the itinerary update if booking creation fails
      }
    }

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

// DELETE - Delete an itinerary and all related data
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    console.log('🗑️ Deleting itinerary:', id)

    // Check if itinerary has invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('itinerary_id', id)

    if (invoices && invoices.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Cannot delete itinerary. It has ${invoices.length} invoice(s) linked. Please delete the invoices first or unlink them from this itinerary.`
      }, { status: 409 })
    }

    // Get all days for this itinerary
    const { data: days } = await supabase
      .from('itinerary_days')
      .select('id')
      .eq('itinerary_id', id)

    if (days && days.length > 0) {
      const dayIds = days.map((d: any) => d.id)
      
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
      
      // Check for foreign key constraint
      if (error.code === '23503') {
        return NextResponse.json({
          success: false,
          error: 'Cannot delete itinerary. It has linked records (invoices, payments, etc.). Please remove those first.'
        }, { status: 409 })
      }
      
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
