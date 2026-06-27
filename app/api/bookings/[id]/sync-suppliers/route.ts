// =====================================================
// SYNC SUPPLIERS FROM ITINERARY API
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id: bookingId } = await params

    // Get booking with itinerary_id and start_date. The org_id filter doubles
    // as the parent-belongs-to-org pre-check before we touch any of the child
    // booking_supplier_status rows further down (those inherit org scoping
    // via FK).
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, itinerary_id, booking_code, start_date')
      .eq('id', bookingId)
      .eq('org_id', orgId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    if (!booking.itinerary_id) {
      return NextResponse.json({ success: false, error: 'No linked itinerary found' }, { status: 400 })
    }

    // Get itinerary start_date as fallback for calculating service dates
    const { data: itinerary } = await supabaseAdmin
      .from('itineraries')
      .select('start_date')
      .eq('id', booking.itinerary_id)
      .eq('org_id', orgId)
      .single()

    const tripStartDate = booking.start_date || itinerary?.start_date

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

    console.log(`📅 Found ${days?.length || 0} days for itinerary ${booking.itinerary_id}`)

    if (!days || days.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No itinerary days found for itinerary_id: ${booking.itinerary_id}`,
        data: { added: 0, itinerary_id: booking.itinerary_id }
      })
    }

    // Get services for these days
    const dayIds = days.map(d => d.id)
    const { data: services, error: servicesError } = await supabaseAdmin
      .from('itinerary_services')
      .select('*')
      .in('itinerary_day_id', dayIds)

    if (servicesError) {
      console.error('Error fetching itinerary services:', servicesError)
      return NextResponse.json({ success: false, error: 'Failed to fetch itinerary services' }, { status: 500 })
    }

    console.log(`📋 Found ${services?.length || 0} services in itinerary`)
    console.log(`📋 Day IDs searched: ${JSON.stringify(dayIds)}`)
    if (services && services.length > 0) {
      console.log(`📋 First service sample: ${JSON.stringify(services[0])}`)
    }

    // If no services found, also check if there are ANY services for this itinerary
    // This helps diagnose if the issue is with column names or if services just haven't been saved
    if (!services || services.length === 0) {
      // Try to count ALL services regardless of day_id to help debug
      const { count: totalServicesCount } = await supabaseAdmin
        .from('itinerary_services')
        .select('*', { count: 'exact', head: true })

      console.log(`📊 Total services in itinerary_services table: ${totalServicesCount}`)

      return NextResponse.json({
        success: true,
        message: `No services found in itinerary_services table for this itinerary. Make sure to save the itinerary after adding services (click 'Save Changes' or 'Calculate Pricing' in the itinerary edit page).`,
        data: {
          added: 0,
          debug: {
            itinerary_id: booking.itinerary_id,
            days_count: days?.length || 0,
            day_ids: dayIds,
            total_services_in_db: totalServicesCount || 0,
            hint: 'Services must be saved in the itinerary edit page before they can be synced to bookings'
          }
        }
      })
    }

    // Check existing suppliers to avoid duplicates.
    // Phase 3 step 2: include supplier_id so the dedup key can be FK-aware.
    const { data: existingSuppliers } = await supabaseAdmin
      .from('booking_supplier_status')
      .select('supplier_id, supplier_name, supplier_type, service_date')
      .eq('booking_id', bookingId)

    // Dedup key rule (id-or-name grouping):
    //   - When supplier_id IS NOT NULL: key on supplier_id + supplier_type + service_date.
    //     Same FK = same canonical supplier even if the snapshot `supplier_name`
    //     drifted across renames.
    //   - When supplier_id IS NULL: fall back to supplier_name + supplier_type +
    //     service_date. Legitimately supplier-less rows (tips, water, entrance
    //     fees) stay grouped on the human-readable name so they don't all
    //     collapse into one row.
    // A resolved-FK row and an unresolved-name row that happen to share the
    // same display name are NOT collapsed — they have different keys. This
    // is correct: one carries provenance to the canonical supplier; the
    // other is awaiting resolution.
    const dedupKey = (row: { supplier_id?: string | null; supplier_name?: string | null; supplier_type?: string | null; service_date?: string | null }) => {
      const type = row.supplier_type ?? ''
      const date = row.service_date ?? 'no-date'
      return row.supplier_id
        ? `id:${row.supplier_id}|${type}|${date}`
        : `name:${row.supplier_name ?? ''}|${type}|${date}`
    }
    const existingKeys = new Set(
      (existingSuppliers || []).map(dedupKey)
    )

    // Helper to calculate service date from day_number
    const calculateServiceDate = (day: { date: string | null; day_number: number }): string | null => {
      // Use day.date if available
      if (day.date) return day.date

      // Calculate from trip start date and day number
      if (tripStartDate) {
        const startDate = new Date(tripStartDate)
        startDate.setDate(startDate.getDate() + (day.day_number - 1))
        return startDate.toISOString().split('T')[0]
      }

      return null
    }

    // Prepare supplier status entries
    const supplierStatuses = services
      .map(service => {
        const day = days.find(d => d.id === service.itinerary_day_id)
        if (!day) {
          console.log(`⚠️ No day found for service: ${service.service_name}`)
          return null
        }

        // Use supplier_name if available, otherwise fall back to service_name
        const supplierName = service.supplier_name || service.service_name || 'Unknown Service'
        const serviceDate = calculateServiceDate(day)
        const supplierType = mapServiceType(service.service_type)
        const supplierId = service.supplier_id || null

        // Id-or-name dedup key — see dedupKey() defined above for the rule.
        // Resolved-FK rows group on supplier_id; unresolved rows group on
        // supplier_name; the two never collapse even when the display name
        // happens to match.
        const key = dedupKey({ supplier_id: supplierId, supplier_name: supplierName, supplier_type: supplierType, service_date: serviceDate })

        // Skip if already exists
        if (existingKeys.has(key)) {
          console.log(`⏭️ Skipping duplicate: ${supplierName} on ${serviceDate}`)
          return null
        }

        console.log(`✅ Adding supplier: ${supplierName} (${supplierType}) on ${serviceDate}`)

        return {
          booking_id: bookingId,
          supplier_id: service.supplier_id || null,
          supplier_type: supplierType,
          supplier_name: supplierName,
          service_description: service.notes || null,
          service_date: serviceDate,
          quoted_cost: service.total_cost || service.rate_eur || null,
          status: 'pending'
        }
      })
      .filter(Boolean)

    if (supplierStatuses.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All services already synced or no valid services found',
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

    console.log(`✅ Synced ${inserted?.length || 0} suppliers to booking ${booking.booking_code}`)

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
    'sleeping_train': 'transport',
    'tips': 'other',
    'supplies': 'other',
    'service_fee': 'other'
  }

  return typeMap[type.toLowerCase()] || 'other'
}
