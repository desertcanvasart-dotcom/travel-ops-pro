import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// Map service types to document types
const SERVICE_TO_DOC_TYPE: Record<string, string> = {
  accommodation: 'hotel_voucher',
  hotel: 'hotel_voucher',
  transportation: 'transport_voucher',
  transport: 'transport_voucher',
  transfer: 'transport_voucher',
  guide: 'guide_assignment',
  cruise: 'cruise_voucher',
  activity: 'activity_voucher',
  entrance: 'activity_voucher',
  tour: 'activity_voucher',
  excursion: 'activity_voucher'
}

// Map supplier types to document types
const SUPPLIER_TO_DOC_TYPE: Record<string, string> = {
  hotel: 'hotel_voucher',
  transport: 'transport_voucher',
  driver: 'transport_voucher',
  guide: 'guide_assignment',
  cruise: 'cruise_voucher',
  activity_provider: 'activity_voucher',
  attraction: 'activity_voucher',
  tour_operator: 'service_order',
  ground_handler: 'service_order',
  restaurant: 'service_order',
  shop: 'service_order'
}

// Document number prefixes
const DOC_PREFIXES: Record<string, string> = {
  hotel_voucher: 'HV',
  service_order: 'SO',
  transport_voucher: 'TV',
  activity_voucher: 'AV',
  guide_assignment: 'GA',
  cruise_voucher: 'CV'
}

// Track offsets per document type during batch generation
const typeOffsets: Record<string, number> = {}

async function generateDocumentNumber(supabase: any, docType: string): Promise<string> {
  const prefix = DOC_PREFIXES[docType] || 'SD'
  const year = new Date().getFullYear()
  const pattern = `${prefix}-${year}-%`
  
  const { data } = await supabase
    .from('supplier_documents')
    .select('document_number')
    .like('document_number', pattern)
    .order('document_number', { ascending: false })
    .limit(1)
  
  let nextNum = 1
  if (data && data.length > 0) {
    const lastNum = data[0].document_number
    const match = lastNum.match(/-(\d+)$/)
    if (match) {
      nextNum = parseInt(match[1], 10) + 1
    }
  }
  
  // Add offset for batch generation (multiple docs of same type)
  const offset = typeOffsets[docType] || 0
  nextNum += offset
  
  // Increment offset for next call of same type
  typeOffsets[docType] = offset + 1
  
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient()
  const { id: itineraryId } = await params
  
  // Reset offsets for each request
  Object.keys(typeOffsets).forEach(key => delete typeOffsets[key])
  
  try {
    const body = await request.json().catch(() => ({}))
    const { document_types } = body
    
    // Fetch itinerary with client details
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()
    
    if (itinError) {
      console.error('Itinerary fetch error:', itinError)
      return NextResponse.json({ error: 'Itinerary not found', details: itinError.message }, { status: 404 })
    }
    
    if (!itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }
    
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
      console.error('Days fetch error:', daysError)
      return NextResponse.json({ error: daysError.message }, { status: 500 })
    }
    
    // Collect all supplier IDs from services
    const supplierIds = new Set<string>()
    for (const day of days || []) {
      for (const service of day.services || []) {
        if (service.supplier_id) {
          supplierIds.add(service.supplier_id)
        }
      }
    }
    
    // Fetch all suppliers at once
    let suppliersMap: Record<string, any> = {}
    if (supplierIds.size > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('*')
        .in('id', Array.from(supplierIds))
      
      if (suppliers) {
        suppliersMap = Object.fromEntries(suppliers.map(s => [s.id, s]))
      }
    }
    
    // Group services by supplier
    const supplierGroups: Record<string, {
      supplier: any,
      services: any[],
      cities: Set<string>,
      dates: { min: string, max: string },
      docType: string
    }> = {}
    
    // Also track services without suppliers for service orders
    const unassignedServices: any[] = []
    
    for (const day of days || []) {
      for (const service of day.services || []) {
        const serviceDate = day.date
        
        if (service.supplier_id && suppliersMap[service.supplier_id]) {
          const supplierId = service.supplier_id
          const supplier = suppliersMap[supplierId]
          
          if (!supplierGroups[supplierId]) {
            // Determine document type based on supplier type or service type
            let docType = SUPPLIER_TO_DOC_TYPE[supplier.type] || 
                          SERVICE_TO_DOC_TYPE[service.service_type] || 
                          'service_order'
            
            supplierGroups[supplierId] = {
              supplier,
              services: [],
              cities: new Set(),
              dates: { min: serviceDate || '', max: serviceDate || '' },
              docType
            }
          }
          
          supplierGroups[supplierId].services.push({
            ...service,
            day_number: day.day_number,
            date: serviceDate,
            city: day.city
          })
          
          if (day.city) {
            supplierGroups[supplierId].cities.add(day.city)
          }
          
          // Track date range
          if (serviceDate && (!supplierGroups[supplierId].dates.min || serviceDate < supplierGroups[supplierId].dates.min)) {
            supplierGroups[supplierId].dates.min = serviceDate
          }
          if (serviceDate && (!supplierGroups[supplierId].dates.max || serviceDate > supplierGroups[supplierId].dates.max)) {
            supplierGroups[supplierId].dates.max = serviceDate
          }
        } else {
          unassignedServices.push({
            ...service,
            day_number: day.day_number,
            date: serviceDate,
            city: day.city
          })
        }
      }
    }
    
    // Check for existing documents
    const { data: existingDocs } = await supabase
      .from('supplier_documents')
      .select('supplier_id, document_type')
      .eq('itinerary_id', itineraryId)
      .neq('status', 'cancelled')
    
    const existingDocKeys = new Set(
      (existingDocs || []).map(d => `${d.supplier_id}-${d.document_type}`)
    )
    
    // Generate documents for each supplier group
    const documentsToCreate: any[] = []
    
    for (const [supplierId, group] of Object.entries(supplierGroups)) {
      // Skip if document already exists
      const docKey = `${supplierId}-${group.docType}`
      if (existingDocKeys.has(docKey)) {
        continue
      }
      
      // Skip if filtering by type and this type not requested
      if (document_types && !document_types.includes(group.docType)) {
        continue
      }
      
      const docNumber = await generateDocumentNumber(supabase, group.docType)
      
      // Format services for JSON storage
      const formattedServices = group.services.map(s => ({
        service_type: s.service_type,
        service_name: s.service_name,
        quantity: s.quantity,
        date: s.date,
        day_number: s.day_number,
        city: s.city,
        notes: s.notes,
        total_cost: s.total_cost
      }))
      
      // Calculate total cost for this supplier
      const totalCost = group.services.reduce((sum, s) => sum + (parseFloat(s.total_cost) || 0), 0)
      
      // Determine check-in/check-out for hotels
      const isHotel = group.docType === 'hotel_voucher'
      
      documentsToCreate.push({
        itinerary_id: itineraryId,
        supplier_id: supplierId,
        document_type: group.docType,
        document_number: docNumber,
        supplier_name: group.supplier.name,
        supplier_contact_name: group.supplier.contact_name,
        supplier_contact_email: group.supplier.contact_email,
        supplier_contact_phone: group.supplier.contact_phone,
        supplier_address: [group.supplier.address, group.supplier.city, group.supplier.country].filter(Boolean).join(', '),
        client_name: itinerary.client_name,
        client_nationality: itinerary.client_nationality,
        num_adults: itinerary.num_adults || 1,
        num_children: itinerary.num_children || 0,
        services: formattedServices,
        city: Array.from(group.cities).join(', '),
        service_date: isHotel ? null : group.dates.min,
        check_in: isHotel ? group.dates.min : null,
        check_out: isHotel ? group.dates.max : null,
        currency: itinerary.currency || 'EUR',
        total_cost: totalCost,
        payment_terms: group.supplier.payment_terms || 'commission',
        status: 'draft'
      })
    }
    
    // Create a general service order for unassigned services if any
    if (unassignedServices.length > 0 && (!document_types || document_types.includes('service_order'))) {
      // Group by city
      const citiesWithServices = new Map<string, any[]>()
      for (const service of unassignedServices) {
        const city = service.city || 'General'
        if (!citiesWithServices.has(city)) {
          citiesWithServices.set(city, [])
        }
        citiesWithServices.get(city)!.push(service)
      }
      
      for (const [city, services] of citiesWithServices) {
        const docNumber = await generateDocumentNumber(supabase, 'service_order')
        
        const formattedServices = services.map(s => ({
          service_type: s.service_type,
          service_name: s.service_name,
          quantity: s.quantity,
          date: s.date,
          day_number: s.day_number,
          city: s.city,
          notes: s.notes,
          total_cost: s.total_cost
        }))
        
        const totalCost = services.reduce((sum, s) => sum + (parseFloat(s.total_cost) || 0), 0)
        const dates = services.map(s => s.date).filter(Boolean)
        
        documentsToCreate.push({
          itinerary_id: itineraryId,
          document_type: 'service_order',
          document_number: docNumber,
          supplier_name: `${city} Ground Services`,
          client_name: itinerary.client_name,
          client_nationality: itinerary.client_nationality,
          num_adults: itinerary.num_adults || 1,
          num_children: itinerary.num_children || 0,
          services: formattedServices,
          city: city,
          service_date: dates.length > 0 ? dates.sort()[0] : itinerary.start_date,
          currency: itinerary.currency || 'EUR',
          total_cost: totalCost,
          payment_terms: 'pay_direct',
          status: 'draft'
        })
      }
    }
    
    // Insert all documents
    if (documentsToCreate.length > 0) {
      const { data: createdDocs, error: createError } = await supabase
        .from('supplier_documents')
        .insert(documentsToCreate)
        .select()
      
      if (createError) {
        console.error('Error creating documents:', createError)
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
      
      return NextResponse.json({
        success: true,
        message: `Generated ${createdDocs.length} document(s)`,
        count: createdDocs.length,
        documents: createdDocs
      })
    }
    
    return NextResponse.json({
      success: true,
      message: 'No new documents to generate. Assign suppliers to services first.',
      count: 0,
      documents: []
    })
    
  } catch (error) {
    console.error('Error generating documents:', error)
    return NextResponse.json({ error: 'Failed to generate documents' }, { status: 500 })
  }
}