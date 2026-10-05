// =====================================================
// SYNC SUPPLIERS FROM ITINERARY API
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { syncSupplierExpense } from '@/lib/bookings/supplier-expense'
import { supplierLinesFromServices, supplierKey } from '@/lib/bookings/supplier-lines'

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

    // Rows confirmed before confirmation made expenses (lib/bookings/
    // supplier-expense) catch up here: each confirmed row without an
    // expense gets one. Idempotent.
    const { data: confirmedRows } = await supabaseAdmin
      .from('booking_supplier_status')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('status', 'confirmed')
    let expensesAdded = 0
    for (const r of confirmedRows || []) {
      const res = await syncSupplierExpense(supabaseAdmin, orgId, r.id as string)
      if (res.ok && res.action === 'create') expensesAdded++
      else if (!res.ok) console.error('[sync-suppliers] expense for', r.id, res.error)
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

    // One row per supplier per day, without the lines nobody confirms
    // (water, tips…) — lib/bookings/supplier-lines, shared with booking
    // creation. The id-or-name key keeps a linked supplier on its id and an
    // unlinked line on its name; rows already listed are skipped.
    const existingKeys = new Set((existingSuppliers || []).map(supplierKey))
    const dayById = new Map(days.map(d => [d.id as string, d]))
    const lines = supplierLinesFromServices(
      services.map(service => {
        const day = dayById.get(service.itinerary_day_id as string)
        return { ...service, day_number: day?.day_number ?? null, day_date: day?.date ?? null }
      }),
      tripStartDate,
    )
    const supplierStatuses = lines
      .filter(l => !existingKeys.has(supplierKey(l)))
      .map(l => ({ ...l, booking_id: bookingId, status: 'pending' }))

    if (supplierStatuses.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All services already synced or no valid services found'
          + (expensesAdded ? `; recorded ${expensesAdded} expense${expensesAdded === 1 ? '' : 's'} for confirmed suppliers` : ''),
        data: { added: 0, expenses_added: expensesAdded }
      })
    }

    // Insert supplier statuses
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('booking_supplier_status')
      .insert(supplierStatuses)
      .select()

    if (insertError) {
      console.error('Error inserting supplier statuses:', insertError)
      return NextResponse.json({ success: false, error: clientMessage(insertError, 'Internal server error') }, { status: 500 })
    }

    console.log(`✅ Synced ${inserted?.length || 0} suppliers to booking ${booking.booking_code}`)

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${inserted?.length || 0} suppliers from itinerary`
        + (expensesAdded ? `; recorded ${expensesAdded} expense${expensesAdded === 1 ? '' : 's'} for confirmed suppliers` : ''),
      data: {
        added: inserted?.length || 0,
        expenses_added: expensesAdded,
        suppliers: inserted
      }
    })
  } catch (error: unknown) {
    console.error('Sync suppliers error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
