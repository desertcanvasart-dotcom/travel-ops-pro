import { NextRequest, NextResponse } from 'next/server'
import { uploadOutboundPdf } from '@/lib/storage/outbound-documents'
import { safeKeySegment } from '@/lib/storage-key'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createServerClient } from '@/lib/supabase-server'
import { generateContractPDF } from '@/lib/contract-pdf-generator'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { orgIdentity } from '@/lib/org-identity'
import { contractNumberFor, contractPrice, describeDestinations } from '@/lib/contract-facts'

export async function POST(request: NextRequest) {
  try {
    // The service-role client below sees every org: the caller's org is the
    // boundary. It read the itinerary by id alone, so anyone signed in could
    // send another org's contract to that org's client.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { itineraryId } = body

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Get itinerary details
    const { data: itinerary, error: dbError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .single()

    if (dbError || !itinerary) {
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

    // Generate contract PDF
    console.log('📄 Generating contract PDF...')
    // No price yet = "To be confirmed": total_cost.toFixed threw here after
    // the PDF had already been uploaded.
    const totalCost: number | null = typeof itinerary.total_cost === 'number' ? itinerary.total_cost : null
    const tourName = itinerary.trip_name || 'Your tour'
    const contractData = {
      contractNumber: contractNumberFor(itinerary),
      contractDate: new Date().toISOString(),
      clientName: itinerary.client_name || 'Valued Guest',
      clientEmail: itinerary.client_email,
      numTravelers: (itinerary.num_adults || 1) + (itinerary.num_children || 0),
      tourName,
      startDate: itinerary.start_date,
      endDate: itinerary.end_date,
      // The trip's own destinations — it printed "Cairo, Luxor, Aswan" for all.
      destinations: describeDestinations(itinerary.destinations),
      totalCost,
      currency: itinerary.currency || 'EUR',
      inclusions: itinerary.inclusions || undefined,
      exclusions: itinerary.exclusions || undefined,
    }

    const pdfBytes = await generateContractPDF(contractData)
    
    // Upload to Supabase Storage
    console.log('📤 Uploading PDF to storage...')
    const fileName = `contracts/contract-${safeKeySegment(itineraryId, 'trip')}-${Date.now()}.pdf`
    
    // Private bucket + a signed link that expires — see lib/storage/outbound-documents.
    
    const pdfUrl = await uploadOutboundPdf(supabase, fileName, pdfBytes)
    console.log('✅ PDF uploaded (private, signed link)')

    // Build message
    // The org's own name and contacts (Settings), not one install-wide name.
    const identity = await orgIdentity(orgId)
    const businessName = identity.name

    const message = (businessName ? `📄 *${businessName}* 📄\n\n` : '') +
      `Dear ${itinerary.client_name || 'Valued Guest'},\n\n` +
      `Your tour contract is ready! 🎉\n\n` +
      `📋 *Contract Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${tourName}\n` +
      `📅 *Dates:* ${new Date(itinerary.start_date).toLocaleDateString()} - ${new Date(itinerary.end_date).toLocaleDateString()}\n` +
      `👥 *Travelers:* ${itinerary.num_adults} adult${itinerary.num_adults > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}\n` +
      `💰 *Total:* ${contractPrice(totalCost, itinerary.currency)}\n\n` +
      `📄 Please review the attached contract carefully.\n\n` +
      `✍️ *Next Steps:*\n` +
      `1. Review all terms and conditions\n` +
      `2. Sign the contract\n` +
      `3. Return signed copy to us\n` +
      `4. Complete payment\n\n` +
      `If you have any questions, please don't hesitate to reach out!\n\n` +
      (identity.email ? `📧 ${identity.email}\n` : '') +
      (identity.website ? `🌐 ${identity.website}\n` : '') + '\n' +
      `Looking forward to your adventure! ✨\n\n` +
      (businessName ? `Best regards,\n${businessName} Team` : 'Best regards,')

    // Send via WhatsApp WITH PDF attachment
    const result = await sendWhatsAppMessage({
      to: itinerary.client_phone,
      body: message,
      mediaUrl: pdfUrl
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log('✅ Contract sent with PDF:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      pdfUrl: pdfUrl,
      message: 'Contract sent successfully via WhatsApp with PDF attachment'
    })

  } catch (error: any) {
    console.error('❌ Error sending contract:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}