import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@/app/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itineraryId, guideId } = body

    if (!itineraryId || !guideId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Get itinerary details
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    // Get guide details
    const { data: guide, error: guideError } = await supabase
      .from('guides')
      .select('*')
      .eq('id', guideId)
      .single()

    if (itinError || guideError || !itinerary || !guide) {
      return NextResponse.json(
        { success: false, error: 'Itinerary or guide not found' },
        { status: 404 }
      )
    }

    if (!guide.phone) {
      return NextResponse.json(
        { success: false, error: 'Guide phone number not found' },
        { status: 400 }
      )
    }

    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    
    const message = `🎯 *${businessName} - New Assignment* 🎯\n\n` +
      `Hi ${guide.name},\n\n` +
      `You've been assigned to a new tour!\n\n` +
      `📋 *Tour Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Egypt Tour'}\n` +
      `📅 *Start Date:* ${new Date(itinerary.start_date).toLocaleDateString()}\n` +
      `📅 *End Date:* ${new Date(itinerary.end_date).toLocaleDateString()}\n` +
      `👥 *Guests:* ${itinerary.num_adults || 1} adult${itinerary.num_adults > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}\n` +
      `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
      `📞 *Phone:* ${itinerary.client_phone || 'N/A'}\n` +
      `🏨 *Pickup:* ${itinerary.pickup_location || 'To be confirmed'}\n` +
      `🕐 *Time:* ${itinerary.pickup_time || 'To be confirmed'}\n\n` +
      `📝 *Notes:*\n${itinerary.guide_notes || 'None'}\n\n` +
      `Please confirm receipt of this assignment.\n\n` +
      `Good luck! 🌟\n\n` +
      `${businessName} Operations Team`

    // Send via WhatsApp
    const result = await sendWhatsAppMessage({
      to: guide.phone,
      body: message
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log('✅ Guide notified:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Guide notified successfully'
    })

  } catch (error: any) {
    console.error('❌ Error notifying guide:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
