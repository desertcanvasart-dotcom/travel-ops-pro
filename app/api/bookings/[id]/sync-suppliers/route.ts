// =====================================================
// SYNC SUPPLIERS FROM ITINERARY API
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Sync suppliers from linked itinerary
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params

    // Get booking with itinerary_id
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, itinerary_id, booking_code')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    if (!booking.itinerary_id) {
      return NextResponse.json({ success: false, error: 'No linked itinerary found' }, { status: 400 })
    }

    // Get itinerary days
    const { data: days, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select('id, date, day_number')
      .eq('itinerary_id', booking.itinerary_id)
      .order('day_number', { ascending: true })

    if (daysError) {
      console.error('Error fetching itinerary days:', daysError)
      return NextResponse.json({ success: false, error: 'Failed to fetch itinerary days' }, { status: 500 })
    }

    if (!days || days.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No itinerary days found',
        data: { added: 0 }
      })
    }

    // Get services for these days
    const dayIds = days.map(d => d.id)
    const { data: services, error: servicesError } = await supabaseAdmin
      .from('itinerary_services')
      .select('*, itinerary_day_id')
      .in('itinerary_day_id', dayIds)

    if (servicesError) {
      console.error('Error fetching itinerary services:', servicesError)
      return NextResponse.json({ success: false, error: 'Failed to fetch itinerary services' }, { status: 500 })
    }

    if (!services || services.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No services found in itinerary',
        data: { added: 0 }
      })
    }

    // Check existing suppliers to avoid duplicates
    const { data: existingSuppliers } = await supabaseAdmin
      .from('booking_supplier_status')
      .select('supplier_name, service_date')
      .eq('booking_id', bookingId)

    const existingKeys = new Set(
      existingSuppliers?.map(s => `${s.supplier_name}-${s.service_date}`) || []
    )

    // Prepare supplier status entries
    const supplierStatuses = services
      .map(service => {
        const day = days.find(d => d.id === service.itinerary_day_id)
        const supplierName = service.service_name || service.supplier_name || 'Unknown Service'
        const key = `${supplierName}-${day?.date}`

        // Skip if already exists
        if (existingKeys.has(key)) {
          return null
        }

        return {
          booking_id: bookingId,
          supplier_type: mapServiceType(service.service_type),
          supplier_name: supplierName,
          service_description: service.notes || service.description || null,
          service_date: day?.date || null,
          quoted_cost: service.total_cost || service.unit_cost || null,
          status: 'pending'
        }
      })
      .filter(Boolean)

    if (supplierStatuses.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All services already synced',
        data: { added: 0 }
      })
    }

    // Insert supplier statuses
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('booking_supplier_status')
      .insert(supplierStatuses)
      .select()

    if (insertError) {
      console.error('Error inserting supplier statuses:', insertError)
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${inserted?.length || 0} suppliers from itinerary`,
      data: {
        added: inserted?.length || 0,
        suppliers: inserted
      }
    })
  } catch (error: unknown) {
    console.error('Sync suppliers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to map service types
function mapServiceType(type: string | null): string {
  if (!type) return 'other'

  const typeMap: Record<string, string> = {
    'hotel': 'hotel',
    'accommodation': 'hotel',
    'guide': 'guide',
    'tour_guide': 'guide',
    'transport': 'transport',
    'transportation': 'transport',
    'vehicle': 'transport',
    'restaurant': 'restaurant',
    'meal': 'restaurant',
    'activity': 'activity',
    'tour': 'activity',
    'entrance': 'entrance',
    'ticket': 'entrance',
    'cruise': 'cruise',
    'nile_cruise': 'cruise',
    'flight': 'flight',
    'domestic_flight': 'flight',
    'train': 'transport',
    'sleeping_train': 'transport'
  }

  return typeMap[type.toLowerCase()] || 'other'
}
