import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createDocumentNumberer } from '@/lib/documents/numberer'
import { requestedDocTypes } from '@/lib/documents/group-services'
import { planDocuments, serviceDocKeys, type PlanGuide } from '@/lib/documents/plan-documents'

// Document number prefixes
const DOC_PREFIXES: Record<string, string> = {
  hotel_voucher: 'HV',
  service_order: 'SO',
  transport_voucher: 'TV',
  guide_assignment: 'GA',
  cruise_voucher: 'CV',
  activity_voucher: 'AV'
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
    const nextNumber = createDocumentNumberer(supabase, t => DOC_PREFIXES[t] || 'SD')

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
      return NextResponse.json({ error: clientMessage(daysError, 'Internal server error') }, { status: 500 })
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
      .select('services')
      .eq('itinerary_id', itineraryId)
      .neq('status', 'cancelled')
    const documented = new Set<string>()
    for (const doc of existingDocs || []) {
      for (const s of (Array.isArray(doc.services) ? doc.services : []) as any[]) {
        for (const k of serviceDocKeys(s)) documented.add(k)
      }
    }

    const documentsToCreate: any[] = []
    for (const plan of plans) {
      if (document_types && !document_types.includes(plan.docType)) continue
      const services = plan.services.filter(s => !serviceDocKeys(s).some(k => documented.has(k)))
      if (services.length === 0) continue

      const supplier = plan.supplierId ? suppliersMap[plan.supplierId] : null
      const guide = plan.guide
      const nightly = plan.docType === 'hotel_voucher' || plan.docType === 'cruise_voucher'
      const isTransport = plan.docType === 'transport_voucher'
      const docNumber = await nextNumber(plan.docType)

      documentsToCreate.push({
        itinerary_id: itineraryId,
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
        const renumber = createDocumentNumberer(supabase, t => DOC_PREFIXES[t] || 'SD')
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