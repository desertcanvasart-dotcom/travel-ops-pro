import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createServiceClient } from '@/lib/supabase/service-client'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { orgIdentity } from '@/lib/org-identity'

export async function POST(request: NextRequest) {
  try {
    // The caller's org only; signed with its own name, not the install's
    // BUSINESS_NAME. This read any org's trip by id with the service client.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { itineraryId } = body

    console.log('📤 Send thank you request:', { itineraryId })

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get itinerary
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (itinError || !itinerary) {
      console.error('❌ Itinerary error:', itinError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    if (!itinerary.client_phone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found' },
        { status: 400 }
      )
    }

    const businessName = (await orgIdentity(orgId)).name
    const reviewUrl = process.env.REVIEW_URL || ''

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }

    const message = (businessName ? `🎉 *${businessName}* 🎉\n\n` : '') +
      `Dear ${itinerary.client_name},\n\n` +
      `Thank you for traveling with us! 🙏\n\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'your trip'}\n` +
      `📅 *Dates:* ${formatDate(itinerary.start_date)} - ${formatDate(itinerary.end_date)}\n\n` +
      `We hope you had an incredible trip!\n\n` +
      `We'd love to hear your feedback. If you enjoyed your tour, please consider leaving us a review:\n` +
      `⭐ ${reviewUrl}\n\n` +
      `Share your photos with us! We'd love to see them. 📸\n\n` +
      `We hope to see you again soon! 🌟\n\n` +
      `Best regards,\n${businessName ? `${businessName} Team` : 'Your travel team'}`

    console.log('📤 Sending thank you to:', itinerary.client_phone)

    const result = await sendWhatsAppMessage({
      to: itinerary.client_phone,
      body: message
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Update itinerary status to completed
    await supabase
      .from('itineraries')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)
      .eq('org_id', orgId)

    console.log('✅ Thank you message sent:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Thank you message sent successfully'
    })

  } catch (error: any) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}