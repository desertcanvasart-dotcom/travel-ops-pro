import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createServiceClient } from '@/lib/supabase/service-client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itineraryId, resourceId, resourceType, resourceName, startDate, endDate, notes } = body

    console.log('📤 Notify resource request:', { itineraryId, resourceId, resourceType })

    if (!itineraryId || !resourceId || !resourceType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get itinerary details
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (itinError || !itinerary) {
      console.error('❌ Itinerary error:', itinError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Get resource details — vehicles now reference transportation_rates (with linked supplier)
    let resource: any = null
    let resourcePhone: string | null = null

    if (resourceType === 'vehicle') {
      // Vehicle resource_id points to transportation_rates — look up the rate, then get supplier
      const { data: rate, error: rateError } = await supabase
        .from('transportation_rates')
        .select('*, supplier:supplier_id (id, name, contact_phone, whatsapp, contact_email)')
        .eq('id', resourceId)
        .single()

      if (rate?.supplier) {
        resource = rate.supplier
        resourcePhone = resource.contact_phone || resource.whatsapp || null
      } else if (!rateError && rate) {
        // Rate found but no supplier linked — use rate info
        resource = { name: rate.supplier_name || resourceName || 'Transport Service' }
        resourcePhone = null
      } else {
        // Backward compat: try direct supplier lookup (for old assignments)
        const { data: supplierData } = await supabase
          .from('suppliers')
          .select('*')
          .eq('id', resourceId)
          .single()

        if (supplierData) {
          resource = supplierData
          resourcePhone = resource.contact_phone || resource.whatsapp || resource.phone2
        }
      }
    } else {
      // All other types: direct supplier lookup
      const { data: supplierData, error: resourceError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', resourceId)
        .single()

      if (resourceError || !supplierData) {
        console.error('❌ Resource error:', resourceError)
        return NextResponse.json(
          { success: false, error: 'Resource not found' },
          { status: 404 }
        )
      }
      resource = supplierData
      resourcePhone = resource.contact_phone || resource.whatsapp || resource.phone2
    }

    if (!resource) {
      return NextResponse.json(
        { success: false, error: 'Resource not found' },
        { status: 404 }
      )
    }

    console.log('📱 Resource:', { name: resource.name, contact_phone: resource.contact_phone, whatsapp: resource.whatsapp })

    if (!resourcePhone) {
      return NextResponse.json(
        { success: false, error: `No phone number found for ${resource.name || resourceName}. Please add contact_phone to the supplier.` },
        { status: 400 }
      )
    }

    const businessName = process.env.BUSINESS_NAME || ''
    
    // Format dates
    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      })
    }

    // Guest count string
    const guestCount = `${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}`

    // Generate message based on resource type
    let message = ''
    
    if (resourceType === 'restaurant') {
      message = `🍽️ *${businessName} - Reservation Request*\n\n` +
        `Hello ${resource.name},\n\n` +
        `We would like to make a reservation:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `👤 *Client Name:* ${itinerary.client_name || 'N/A'}\n` +
        `${notes ? `📝 *Special Requests:* ${notes}\n` : ''}\n` +
        `Please confirm availability.\n\n` +
        `Thank you!\n` +
        `${businessName} Team`
        
    } else if (resourceType === 'airport_staff') {
      message = `✈️ *${businessName} - Airport Assignment*\n\n` +
        `Hello ${resource.name},\n\n` +
        `You have been assigned to airport duty:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `📞 *Client Phone:* ${itinerary.client_phone || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${itinerary.pickup_location ? `📍 *Location:* ${itinerary.pickup_location}\n` : ''}` +
        `${itinerary.pickup_time ? `🕐 *Time:* ${itinerary.pickup_time}\n` : ''}` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt of this assignment.\n\n` +
        `${businessName} Operations`
        
    } else if (resourceType === 'hotel_staff') {
      message = `🏨 *${businessName} - Hotel Assignment*\n\n` +
        `Hello ${resource.name},\n\n` +
        `You have been assigned to hotel duty:\n\n` +
        `📅 *Dates:* ${formatDate(startDate)}` +
        `${endDate && endDate !== startDate ? ` - ${formatDate(endDate)}` : ''}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `📞 *Client Phone:* ${itinerary.client_phone || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt of this assignment.\n\n` +
        `${businessName} Operations`

    } else if (resourceType === 'vehicle') {
      // Strip tier metadata from notes for display
      const displayNotes = notes?.replace(/^\[tier:\w+\]\s*/, '') || ''
      message = `🚗 *${businessName} - Transport Assignment*\n\n` +
        `Hello ${resource.name},\n\n` +
        `Transport service needed:\n\n` +
        `📋 *Service:* ${resourceName || 'Transport'}\n` +
        `📅 *Date:* ${formatDate(startDate)}` +
        `${endDate && endDate !== startDate ? ` - ${formatDate(endDate)}` : ''}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${displayNotes ? `📝 *Notes:* ${displayNotes}\n` : ''}\n` +
        `Please confirm availability.\n\n` +
        `${businessName} Operations`

    } else {
      // Generic message for other resource types
      message = `📋 *${businessName} - Assignment*\n\n` +
        `Hello ${resource.name},\n\n` +
        `You have been assigned:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}` +
        `${endDate && endDate !== startDate ? ` - ${formatDate(endDate)}` : ''}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt.\n\n` +
        `${businessName} Operations`
    }

    console.log('📤 Sending to:', resourcePhone)

    const result = await sendWhatsAppMessage({
      to: resourcePhone,
      body: message
    })

    if (!result.success) {
      console.error('❌ WhatsApp error:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log(`✅ WhatsApp sent to ${resourceType}:`, result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: `${resource.name || resourceName} notified successfully`
    })

  } catch (error: any) {
    console.error('❌ Error notifying resource:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}