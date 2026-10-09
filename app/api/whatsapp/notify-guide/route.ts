import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createServiceClient } from '@/lib/supabase/service-client'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { orgIdentity } from '@/lib/org-identity'

/** "Mon, 12 October 2026" — a YYYY-MM-DD read as the calendar day it names. */
function guideDate(d: string | null | undefined): string {
  if (!d) return 'To be confirmed'
  const t = new Date(`${String(d).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t.getTime())
    ? 'To be confirmed'
    : t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export async function POST(request: NextRequest) {
  try {
    // The caller's org only. This was the one WhatsApp send with no org check:
    // with the service role it read any org's trip by id and sent its client's
    // name and phone to a guide.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { itineraryId, guideId } = body

    console.log('📤 Notify guide request:', { itineraryId, guideId })

    if (!itineraryId || !guideId) {
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
      .eq('org_id', orgId)
      .maybeSingle()

    if (itinError || !itinerary) {
      console.error('❌ Itinerary error:', itinError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Get guide details from SUPPLIERS table
    const { data: guide, error: guideError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', guideId)
      .single()

    if (guideError || !guide) {
      console.error('❌ Guide error:', guideError)
      return NextResponse.json(
        { success: false, error: 'Guide not found' },
        { status: 404 }
      )
    }

    // Use contact_phone or whatsapp field
    const guidePhone = guide.contact_phone || guide.whatsapp || guide.phone2
    
    console.log('📱 Guide:', { name: guide.name, contact_phone: guide.contact_phone, whatsapp: guide.whatsapp })

    if (!guidePhone) {
      return NextResponse.json(
        { success: false, error: 'Guide phone number not found. Please add contact_phone to the supplier.' },
        { status: 400 }
      )
    }

    // The org's own name, not the install's BUSINESS_NAME.
    const businessName = (await orgIdentity(orgId)).name

    // The guide's OWN days on this trip (a single day, or a range). It printed
    // the whole trip's dates — in the server's M/D/YYYY, which a Cairo guide
    // reads as D/M; a trip with no date printed 1/1/1970.
    const { data: assignment } = await supabase
      .from('itinerary_resources')
      .select('itinerary_day_id, start_date, end_date')
      .eq('itinerary_id', itineraryId)
      .eq('resource_type', 'guide')
      .eq('resource_id', guideId)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    let fromDate: string | null = itinerary.start_date
    let toDate: string | null = itinerary.end_date
    if (assignment?.itinerary_day_id) {
      const { data: day } = await supabase.from('itinerary_days').select('date').eq('id', assignment.itinerary_day_id).maybeSingle()
      if (day?.date) fromDate = toDate = day.date
    } else if (assignment?.start_date) {
      fromDate = assignment.start_date
      toDate = assignment.end_date || assignment.start_date
    }
    const dates = fromDate && fromDate === toDate
      ? `📅 *Date:* ${guideDate(fromDate)}\n`
      : `📅 *Start Date:* ${guideDate(fromDate)}\n📅 *End Date:* ${guideDate(toDate)}\n`

    const message = `🎯 *${businessName ? `${businessName} - ` : ''}New Assignment* 🎯\n\n` +
      `Hi ${guide.name},\n\n` +
      `You've been assigned to a new tour!\n\n` +
      `📋 *Tour Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Your tour'}\n` +
      dates +
      `👥 *Guests:* ${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}\n` +
      `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
      `📞 *Phone:* ${itinerary.client_phone || 'N/A'}\n` +
      `🏨 *Pickup:* ${itinerary.pickup_location || 'To be confirmed'}\n` +
      `🕐 *Time:* ${itinerary.pickup_time || 'To be confirmed'}\n\n` +
      `📝 *Notes:*\n${itinerary.guide_notes || 'None'}\n\n` +
      `Please confirm receipt of this assignment.\n\n` +
      `Good luck! 🌟\n\n` +
      `${businessName ? `${businessName} ` : ''}Operations Team`

    console.log('📤 Sending to:', guidePhone)

    const result = await sendWhatsAppMessage({
      to: guidePhone,
      body: message
    })

    if (!result.success) {
      console.error('❌ WhatsApp error:', result.error)
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
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}