// ============================================
// API Route: /api/guides
// ============================================
// Fetches guides from suppliers table (type='guide')
// GET: List all guides (with filters)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createServiceClient } from '@/lib/supabase/service-client'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { supplierTypeKeysMatching } from '@/lib/supplier-types'
import { supplierTypesForCurrentOrg } from '@/lib/vocabulary-server'
import { emptyTotals, addToTotals } from '@/lib/currency-totals'

function getSupabase() {
  return createServiceClient()
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    
    // Parse query parameters
    const search = sanitizeSearchTerm(searchParams.get('search')) || ''
    const is_active = searchParams.get('is_active')
    const availability_from = searchParams.get('availability_from')
    const availability_to = searchParams.get('availability_to')
    const exclude_itinerary_id = searchParams.get('exclude_itinerary_id')
    const with_stats = searchParams.get('with_stats') === 'true'
    
    // Every supplier who GUIDES — matched on `types`, the full set of roles,
    // like /api/suppliers and the `guides` view. `type` is only the primary
    // role, so a driver who also guides (type 'driver', types
    // {driver,guide}) or an agency's own guide-like type never appeared in
    // the trip's guide picker.
    let query = supabase
      .from('suppliers')
      .select('*')
      .overlaps('types', supplierTypeKeysMatching(['guide'], await supplierTypesForCurrentOrg()))
      .order('name', { ascending: true })
    
    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,contact_email.ilike.%${search}%`)
    }
    
    if (is_active === 'true') {
      query = query.eq('status', 'active')
    }
    
    const { data: suppliers, error } = await query
    
    if (error) {
      console.error('Error fetching guides:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch guides' },
        { status: 500 }
      )
    }

    // Map supplier fields to guide format - use contact_phone for phone
    let guides = (suppliers || []).map(g => ({
      id: g.id,
      name: g.name,
      phone: g.contact_phone || g.whatsapp || g.phone2,
      email: g.contact_email,
      city: g.city,
      languages: g.languages || [],
      specialties: g.specialties || [],
      is_active: g.status === 'active',
      daily_rate: g.daily_rate,
      hourly_rate: g.hourly_rate,
      notes: g.notes,
      contact_phone: g.contact_phone,
      whatsapp: g.whatsapp,
      ...g
    }))

    console.log(`✅ Found ${guides.length} guides from suppliers table`)
    
    // If checking availability, filter out guides with conflicting bookings
    if (availability_from && availability_to) {
      let bookingsQuery = supabase
        .from('itineraries')
        .select('assigned_guide_id')
        .not('assigned_guide_id', 'is', null)
        .or(`and(start_date.lte.${availability_to},end_date.gte.${availability_from})`)
      
      if (exclude_itinerary_id) {
        bookingsQuery = bookingsQuery.neq('id', exclude_itinerary_id)
      }
      
      const { data: bookings } = await bookingsQuery
      
      const bookedGuideIds = bookings?.map(b => b.assigned_guide_id) || []
      guides = guides.filter(g => !bookedGuideIds.includes(g.id))
    }
    
    // Add statistics if requested. Only this organisation's trips: the guide
    // is shared by the install, another agency's bookings and revenue are not.
    // Revenue is per currency — trips are priced in different currencies and
    // a sum across them is no amount at all.
    if (with_stats && guides.length > 0) {
      const guidesWithStats = await Promise.all(
        guides.map(async (guide) => {
          const { data: bookings } = await supabase
            .from('itineraries')
            .select('id, start_date, end_date, total_cost, currency')
            .eq('assigned_guide_id', guide.id)
            .eq('org_id', orgId)
          
          const now = new Date()
          const activeBookings = bookings?.filter(b => 
            new Date(b.start_date) <= now && new Date(b.end_date) >= now
          ).length || 0
          
          const upcomingBookings = bookings?.filter(b => 
            new Date(b.start_date) > now
          ).length || 0
          
          const revenueByCurrency = emptyTotals()
          for (const b of bookings ?? []) addToTotals(revenueByCurrency, b.total_cost, b.currency)
          const currencies = Object.keys(revenueByCurrency)
          
          return {
            ...guide,
            active_bookings: activeBookings,
            upcoming_bookings: upcomingBookings,
            // A single number only when there is a single currency.
            total_revenue: currencies.length === 1 ? revenueByCurrency[currencies[0]] : currencies.length === 0 ? 0 : null,
            revenue_by_currency: revenueByCurrency,
          }
        })
      )
      
      return NextResponse.json(guidesWithStats)
    }
    
    // Return as array (ResourceAssignment expects array, not {success, data})
    return NextResponse.json(guides)
    
  } catch (error) {
    console.error('Error in guides GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Guide name is required' },
        { status: 400 }
      )
    }
    
    // Create guide as a supplier with type='guide'
    // `types` too: suppliers_type_in_types_check requires the primary type
    // to be one of the roles, and the column defaults to '{}' — without it
    // every guide created here was refused by the database.
    const guideData = {
      type: 'guide',
      types: ['guide'],
      name: body.name,
      contact_email: body.email || null,
      contact_phone: body.phone || body.contact_phone || null,
      whatsapp: body.whatsapp || null,
      city: body.city || null,
      languages: body.languages || [],
      specialties: body.specialties || [],
      status: body.is_active !== false ? 'active' : 'inactive',
      daily_rate: body.daily_rate || null,
      hourly_rate: body.hourly_rate || null,
      notes: body.notes || null,
    }
    
    const { data, error } = await supabase
      .from('suppliers')
      .insert([guideData])
      .select()
      .single()
    
    if (error) {
      console.error('Error creating guide:', error)
      
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A guide with this email already exists' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { success: false, error: 'Failed to create guide' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: 'Guide created successfully',
    }, { status: 201 })
    
  } catch (error) {
    console.error('Error in guides POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}