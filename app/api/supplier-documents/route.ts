import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { NextRequest, NextResponse } from 'next/server'
import { createDocumentNumberer, supplierDocumentPrefix } from '@/lib/documents/numberer'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)
  
  // Filter parameters
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const itineraryId = searchParams.get('itineraryId')
  const supplierId = searchParams.get('supplierId')
  const search = sanitizeSearchTerm(searchParams.get('search'))
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  let query = supabase
    .from('supplier_documents')
    .select(`
      *,
      itinerary:itineraries(id, itinerary_code, trip_name, client_name),
      supplier:suppliers(id, name, type)
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  
  // Apply filters
  if (type) {
    query = query.eq('document_type', type)
  }
  
  if (status) {
    query = query.eq('status', status)
  }
  
  if (itineraryId) {
    query = query.eq('itinerary_id', itineraryId)
  }
  
  if (supplierId) {
    query = query.eq('supplier_id', supplierId)
  }
  
  if (search) {
    query = query.or(`document_number.ilike.%${search}%,supplier_name.ilike.%${search}%,client_name.ilike.%${search}%,city.ilike.%${search}%`)
  }
  
  if (startDate) {
    query = query.gte('service_date', startDate)
  }
  
  if (endDate) {
    query = query.lte('service_date', endDate)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching supplier documents:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
  
  // Calculate summary stats
  const stats = {
    total: data?.length || 0,
    draft: data?.filter(d => d.status === 'draft').length || 0,
    sent: data?.filter(d => d.status === 'sent').length || 0,
    confirmed: data?.filter(d => d.status === 'confirmed').length || 0,
    completed: data?.filter(d => d.status === 'completed').length || 0,
    by_type: {
      hotel_voucher: data?.filter(d => d.document_type === 'hotel_voucher').length || 0,
      service_order: data?.filter(d => d.document_type === 'service_order').length || 0,
      transport_voucher: data?.filter(d => d.document_type === 'transport_voucher').length || 0,
      activity_voucher: data?.filter(d => d.document_type === 'activity_voucher').length || 0,
      guide_assignment: data?.filter(d => d.document_type === 'guide_assignment').length || 0,
      cruise_voucher: data?.filter(d => d.document_type === 'cruise_voucher').length || 0
    }
  }
  
  return NextResponse.json({
    success: true,
    data,
    stats
  })
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    
    // Generate document number if not provided
    if (!body.document_number) {
      body.document_number = await createDocumentNumberer(supabase, supplierDocumentPrefix)(body.document_type)
    }
    
    // If supplier_id provided, fetch supplier details
    if (body.supplier_id && !body.supplier_name) {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('name, contact_name, contact_email, contact_phone, whatsapp, address, city, country')
        .eq('id', body.supplier_id)
        .single()

      if (supplier) {
        body.supplier_name = supplier.name
        body.supplier_contact_name = body.supplier_contact_name || supplier.contact_name
        body.supplier_contact_email = body.supplier_contact_email || supplier.contact_email
        body.supplier_contact_phone = body.supplier_contact_phone || supplier.contact_phone
        body.supplier_whatsapp = body.supplier_whatsapp || supplier.whatsapp
        body.supplier_address = body.supplier_address || [supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ')
      }
    }
    
    // A voucher goes on one of this org's trips, or on none.
    if (body.itinerary_id) {
      const { data: itinerary } = await supabase
        .from('itineraries')
        .select('client_name, num_adults, num_children')
        .eq('id', body.itinerary_id)
        .eq('org_id', orgId)
        .maybeSingle()

      if (!itinerary) {
        return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
      }
      if (!body.client_name) {
        body.client_name = itinerary.client_name
        body.num_adults = body.num_adults || itinerary.num_adults
        body.num_children = body.num_children || itinerary.num_children
      }
    }
    body.org_id = orgId
    body.created_by = await getCurrentUserId()

    const { data, error } = await supabase
      .from('supplier_documents')
      .insert([body])
      .select()
      .single()
    
    if (error) {
      console.error('Error creating supplier document:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      data
    })
    
  } catch (error) {
    console.error('Error in POST supplier-documents:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}