import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { createDocumentNumberer, supplierDocumentPrefix } from '@/lib/documents/numberer'
import { requestedDocTypes } from '@/lib/documents/group-services'
import { planDocuments, documentedKeys, missingDocuments, staleDocuments, type PlanGuide } from '@/lib/documents/plan-documents'

/**
 * The trip's days, suppliers, assigned guides and planned documents, and what
 * its documents already hold — shared by POST (create what is missing) and
 * GET (list what is missing and what no longer matches).
 */
async function planTrip(supabase: ReturnType<typeof createServerClient>, itineraryId: string) {
  // Fetch all days with services
  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select(`
      *,
      services:itinerary_services(*)
    `)
    .eq('itinerary_id', itineraryId)
    .order('day_number', { ascending: true })
  
  if (daysError) {
    console.error('❌ Days fetch error:', daysError)
    return { error: NextResponse.json({ error: clientMessage(daysError, 'Internal server error') }, { status: 500 }) }
  }
  
  console.log(`✅ Found ${days?.length || 0} days`)
  
  // Collect all supplier IDs from services
  const supplierIds = new Set<string>()
  for (const day of days || []) {
    for (const service of day.services || []) {
      if (service.supplier_id) supplierIds.add(service.supplier_id)
    }
  }

  // Fetch all suppliers at once
  let suppliersMap: Record<string, any> = {}
  if (supplierIds.size > 0) {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('*')
      .in('id', Array.from(supplierIds))
    if (suppliers) suppliersMap = Object.fromEntries(suppliers.map(s => [s.id, s]))
  }

  // The guides assigned to the trip (Operations → Resources): guiding goes
  // on ONE assignment per guide, addressed to that guide.
  const { data: guideRows } = await supabase
    .from('itinerary_resources')
    .select('resource_id, resource_name, itinerary_day_id, start_date, end_date, status')
    .eq('itinerary_id', itineraryId)
    .eq('resource_type', 'guide')
  const guideIds = [...new Set((guideRows ?? []).map(r => r.resource_id).filter(Boolean))]
  const { data: guideRecords } = guideIds.length > 0
    ? await supabase.from('guides').select('id, name, phone, email, whatsapp, languages').in('id', guideIds)
    : { data: [] as any[] }
  const guideById = new Map((guideRecords ?? []).map((g: any) => [g.id, g]))
  const guides: PlanGuide[] = (guideRows ?? []).map(r => {
    const g = guideById.get(r.resource_id)
    return {
      guide_id: r.resource_id,
      name: g?.name || r.resource_name || 'Guide',
      languages: g?.languages ?? null,
      phone: g?.phone ?? null,
      email: g?.email ?? null,
      whatsapp: g?.whatsapp ?? null,
      itinerary_day_id: r.itinerary_day_id,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status,
    }
  })

  // One document per supplier, split only for a real reason: a hotel per
  // stay, a cruise per sailing, transport per place (lib/documents/plan-documents).
  const plans = planDocuments({ days: days || [], suppliers: suppliersMap, guides })

  // A service already on a document (not cancelled) is not put on another:
  // "Generate" again makes only what is missing — also for a trip whose
  // documents were made before this grouping, whatever they were called.
  const { data: existingDocs } = await supabase
    .from('supplier_documents')
    .select('id, document_number, supplier_name, services')
    .eq('itinerary_id', itineraryId)
    .neq('status', 'cancelled')
  const documented = documentedKeys(existingDocs ?? [])

  return { plans, suppliersMap, existingDocs: existingDocs ?? [], documented }
}

// GET: what Generate would make, and the documents the trip no longer
// matches — for the trip's documents page. Creates nothing.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id: itineraryId } = await params
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!itinerary) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

    const planned = await planTrip(supabase, itineraryId)
    if (planned.error) return planned.error
    return NextResponse.json({
      success: true,
      missing: missingDocuments(planned.plans, planned.documented).map(p => ({
        document_type: p.docType,
        supplier_name: p.supplierName,
        lines: p.services.length,
      })),
      stale: staleDocuments(planned.plans, planned.existingDocs),
    })
  } catch (error) {
    console.error('❌ Error checking documents:', error)
    return NextResponse.json({ success: false, error: 'Failed to check documents' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id: itineraryId } = await params

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json().catch(() => ({}))
    const document_types = requestedDocTypes(body)
    const nextNumber = createDocumentNumberer(supabase, supplierDocumentPrefix)

    const createdBy = await getCurrentUserId()

    console.log('📄 Generating documents for itinerary:', itineraryId)
    console.log('📋 Requested types:', document_types || 'ALL')

    // Fetch itinerary with client details
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .single()
    
    if (itinError) {
      console.error('❌ Itinerary fetch error:', itinError)
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }
    
    if (!itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Output gate (harness Layer 2): don't generate operational paperwork for an
    // itinerary whose price isn't deliverable. Deliberately NOT the completeness
    // gate the customer sends use: these are supplier vouchers, and a hotel with
    // no rate entered still has to be booked — blocking the voucher would stop
    // the very work that fixes the gap.
    const priceCheck = checkAmountDeliverable(itinerary.total_cost, { currency: itinerary.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    console.log('✅ Found itinerary:', itinerary.itinerary_code)
    
    const planned = await planTrip(supabase, itineraryId)
    if (planned.error) return planned.error
    const { plans, suppliersMap, documented } = planned

    const documentsToCreate: any[] = []
    for (const plan of missingDocuments(plans, documented)) {
      if (document_types && !document_types.includes(plan.docType)) continue
      const services = plan.services

      const supplier = plan.supplierId ? suppliersMap[plan.supplierId] : null
      const guide = plan.guide
      const nightly = plan.docType === 'hotel_voucher' || plan.docType === 'cruise_voucher'
      const isTransport = plan.docType === 'transport_voucher'
      const docNumber = await nextNumber(plan.docType)

      documentsToCreate.push({
        itinerary_id: itineraryId,
        org_id: orgId,
        created_by: createdBy,
        supplier_id: plan.supplierId,
        document_type: plan.docType,
        document_number: docNumber,
        supplier_name: plan.supplierName,
        supplier_contact_name: supplier?.contact_name ?? (guide ? guide.name : null),
        supplier_contact_email: supplier?.contact_email ?? guide?.email ?? null,
        supplier_contact_phone: supplier?.contact_phone ?? guide?.phone ?? null,
        supplier_whatsapp: supplier?.whatsapp ?? guide?.whatsapp ?? null,
        supplier_address: supplier
          ? [supplier.address, supplier.city, supplier.country].filter(Boolean).join(', ')
          : plan.city,
        client_name: itinerary.client_name,
        client_nationality: itinerary.client_nationality,
        num_adults: itinerary.num_adults || 1,
        num_children: itinerary.num_children || 0,
        services,
        city: plan.city,
        service_date: nightly ? null : (plan.firstDate || itinerary.start_date),
        check_in: nightly ? plan.checkIn : null,
        check_out: nightly ? plan.checkOut : null,
        // The trip's pickup, for the transport supplier; each route's own
        // times are on its line.
        pickup_time: isTransport ? itinerary.pickup_time || null : null,
        pickup_location: isTransport ? itinerary.pickup_location || null : null,
        special_requests: plan.details,
        currency: itinerary.currency || 'EUR',
        total_cost: services.reduce((sum, s) => sum + (parseFloat(String(s.total_cost ?? 0)) || 0), 0),
        payment_terms: supplier ? supplier.payment_terms || 'commission' : 'pay_direct',
        status: 'draft'
      })
      console.log(`📝 Will create: ${docNumber} - ${plan.supplierName} (${services.length} services)`)
    }

    // Insert all documents
    if (documentsToCreate.length > 0) {
      console.log(`💾 Inserting ${documentsToCreate.length} documents...`)
      
      let { data: createdDocs, error: createError } = await supabase
        .from('supplier_documents')
        .insert(documentsToCreate)
        .select()
      // Another request took one of these numbers between our read and our
      // insert (the column is UNIQUE): renumber from the new highest and retry.
      for (let attempt = 0; createError?.code === '23505' && attempt < 3; attempt++) {
        const renumber = createDocumentNumberer(supabase, supplierDocumentPrefix)
        for (const doc of documentsToCreate) doc.document_number = await renumber(doc.document_type)
        ;({ data: createdDocs, error: createError } = await supabase
          .from('supplier_documents')
          .insert(documentsToCreate)
          .select())
      }
      
      if (createError) {
        console.error('❌ Error creating documents:', createError)
        return NextResponse.json({ error: clientMessage(createError, 'Internal server error') }, { status: 500 })
      }
      
      createdDocs = createdDocs ?? []
      console.log(`🎉 Successfully created ${createdDocs.length} documents`)
      
      return NextResponse.json({
        success: true,
        message: `Generated ${createdDocs.length} document(s)`,
        count: createdDocs.length,
        documents: createdDocs
      })
    }
    
    console.log('⚠️ No documents to create')
    
    return NextResponse.json({
      success: true,
      message: 'No new documents to generate. Documents may already exist or no services found.',
      count: 0,
      documents: []
    })
    
  } catch (error) {
    console.error('❌ Error generating documents:', error)
    return NextResponse.json({ error: 'Failed to generate documents' }, { status: 500 })
  }
}