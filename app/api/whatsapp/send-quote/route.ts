// ============================================
// API: SEND QUOTE VIA WHATSAPP
// ============================================

import { formatMoney } from '@/lib/currency-totals'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createServerClient } from '@/lib/supabase-server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { allowsIncomplete } from '@/lib/pricing/quote-completeness'
import { loadItineraryServiceLines } from '@/lib/pricing/itinerary-completeness'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { orgIdentity } from '@/lib/org-identity'

export async function POST(request: NextRequest) {
  try {
    // The service-role client below sees every org: the caller's org is the
    // boundary, and the itinerary is read within it.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()

    const { itineraryId, allow_incomplete } = body

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const { data: itinerary, error: dbError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .single()

    if (dbError || !itinerary) {
      console.error('❌ Database error:', dbError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // The recipient is the trip's client, never a number the request names.
    const clientPhone = itinerary.client_phone
    if (!clientPhone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number is required' },
        { status: 400 }
      )
    }

    // Output gate (harness Layer 2): never send a non-deliverable price.
    const loaded = await loadItineraryServiceLines(supabase, String(itineraryId), orgId)
    if (!loaded.ok) {
      return NextResponse.json({ success: false, error: loaded.error }, { status: loaded.status })
    }
    const priceCheck = checkAmountDeliverable(itinerary.total_cost, {
      currency: itinerary.currency,
      servicesSnapshot: loaded.lines,
      allowIncomplete: allowsIncomplete(allow_incomplete),
    })
    if (!priceCheck.ok) {
      return NextResponse.json(
        {
          success: false,
          error: priceCheck.incomplete
            ? `This itinerary has ${priceCheck.gaps?.length ?? 0} service(s) with no cost.`
            : 'Quote price is not deliverable',
          violations: priceCheck.violations,
          incomplete: priceCheck.incomplete ?? false,
          gaps: priceCheck.gaps ?? [],
        },
        { status: 422 }
      )
    }

    // The org's own name and contacts (Settings), not the install's
    // BUSINESS_NAME / BUSINESS_EMAIL / BUSINESS_WEBSITE.
    const identity = await orgIdentity(orgId)
    const businessName = identity.name

    // No date: no line — it printed "1 January 1970" / "Invalid Date".
    const day = (d: string | null | undefined) => {
      const t = d ? new Date(d) : null
      return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null
    }
    const startDate = day(itinerary.start_date)
    const endDate = day(itinerary.end_date)

    // Build message
    const message = (businessName ? `🌟 *${businessName}* 🌟\n\n` : '') +
      `Dear ${itinerary.client_name || 'Valued Guest'},\n\n` +
      `Thank you for your interest in travelling with us!\n\n` +
      `📋 *Your Tour Quote*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Your tour'}\n` +
      (startDate ? `📅 *Dates:* ${startDate}${endDate ? ` - ${endDate}` : ''}\n` : '') +
      `👥 *Travelers:* ${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}\n` +
      `💰 *Total Cost:* ${formatMoney(Number(itinerary.total_cost || 0), itinerary.currency || 'EUR')}\n\n` +
      // No fixed "What's Included" list: it promised a guide, entrance fees,
      // meals and pickups whatever the trip held.
      `💳 *Ready to Book?*\n` +
      `Reply to this message${identity.email || identity.website ? ' or contact us:' : '.'}\n` +
      (identity.email ? `📧 ${identity.email}\n` : '') +
      (identity.website ? `🌐 ${identity.website}\n` : '') + '\n' +
      `We look forward to creating unforgettable memories with you! ✨\n\n` +
      (businessName ? `Best regards,\n${businessName} Team` : 'Best regards,')

    console.log('📤 Sending quote via WhatsApp:', {
      to: clientPhone,
      itineraryId,
      tourName: itinerary.trip_name
    })

    // Send message (text only - no PDF attachment)
    const result = await sendWhatsAppMessage({
      to: clientPhone,
      body: message
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Mark the quote sent — only a trip still in draft. Re-sending the quote
    // for a confirmed trip moved it back to "sent", which the confirm flow
    // (app/api/itineraries/[id]) keys on.
    if (!itinerary.status || itinerary.status === 'draft') {
      const { error: statusError } = await supabase
        .from('itineraries')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', itineraryId)
        .eq('org_id', orgId)
      if (statusError) console.error('send-quote: status not updated:', statusError.message)
    }

    console.log('✅ Quote sent successfully via WhatsApp:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Quote sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error sending quote:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}