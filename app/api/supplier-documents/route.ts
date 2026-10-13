import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { NextRequest, NextResponse } from 'next/server'
import { createDocumentNumberer, isDuplicateKey, supplierDocumentPrefix } from '@/lib/documents/numberer'
import { SUPPLIER_DOCUMENT_CREATE_FIELDS, pickFields } from '@/lib/documents/supplier-document-fields'
import { supplierDocumentStats } from '@/lib/documents/supplier-document-stats'
import { rowInOrg } from '@/lib/api/org-scope'
import { SUPPLIER_DOCUMENT_PAGE_SIZE, pageRange, supplierDocumentPage } from '@/lib/documents/supplier-document-page'

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
  // A page at a time, newest first, with an exact count of every match
  // (lib/documents/supplier-document-page): the whole list was one read.
  const page = supplierDocumentPage(searchParams.get('page'))

  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  let query = supabase
    .from('supplier_documents')
    .select(`
      *,
      itinerary:itineraries(id, itinerary_code, trip_name, client_name),
      supplier:suppliers(id, name, type)
    `, { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    // Same created_at (one Generate run writes several): a stable order, so a
    // voucher never shows on two pages or none.
    .order('id', { ascending: false })
  
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
  
  const [from, to] = pageRange(page)
  const { data, error, count } = await query.range(from, to)
  
  if (error) {
    console.error('Error fetching supplier documents:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
  
  // The tiles: the company's (or this trip's) documents by status, counted by
  // the database — not the filtered rows above (lib/documents/supplier-document-stats).
  let stats
  try {
    stats = await supplierDocumentStats(supabase, orgId, itineraryId)
  } catch (statsError) {
    console.error('Error counting supplier documents:', statsError)
    stats = null
  }

  return NextResponse.json({
    success: true,
    data,
    total: count ?? (data ?? []).length,
    page,
    pageSize: SUPPLIER_DOCUMENT_PAGE_SIZE,
    stats
  })
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Only the document's own columns, as a draft (lib/documents/
    // supplier-document-fields): the raw body used to be inserted, so a
    // caller could create a voucher already 'confirmed', or choose its id.
    const body: Record<string, any> = pickFields(await request.json(), SUPPLIER_DOCUMENT_CREATE_FIELDS)
    body.status = 'draft'

    // The supplier must be this company's (suppliers.org_id, 20261205).
    if (body.supplier_id && !(await rowInOrg(supabase, 'suppliers', String(body.supplier_id), orgId))) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // If supplier_id provided, fetch supplier details
    if (body.supplier_id && !body.supplier_name) {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('name, contact_name, contact_email, contact_phone, whatsapp, address, city, country')
        .eq('id', body.supplier_id)
        .eq('org_id', orgId)
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

    // A number typed by hand is the caller's: a clash is theirs to resolve
    // (409). One we draw (this company's sequence) is retried with the next.
    const typedNumber = !!body.document_number
    const nextNumber = createDocumentNumberer(supabase, supplierDocumentPrefix, orgId)
    if (!typedNumber) body.document_number = await nextNumber(String(body.document_type ?? ''))

    let { data, error } = await supabase
      .from('supplier_documents')
      .insert([body])
      .select()
      .single()
    for (let attempt = 0; !typedNumber && isDuplicateKey(error) && attempt < 3; attempt++) {
      body.document_number = await nextNumber(String(body.document_type ?? ''))
      ;({ data, error } = await supabase
        .from('supplier_documents')
        .insert([body])
        .select()
        .single())
    }
    if (typedNumber && isDuplicateKey(error)) {
      return NextResponse.json({ error: 'Another of your documents already has this number' }, { status: 409 })
    }
    
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