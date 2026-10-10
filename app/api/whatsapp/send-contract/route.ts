import { NextRequest, NextResponse } from 'next/server'
import { businessToday } from '@/lib/today'
import { uploadOutboundPdf } from '@/lib/storage/outbound-documents'
import { safeKeySegment } from '@/lib/storage-key'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createServerClient } from '@/lib/supabase-server'
import { generateContractPDF } from '@/lib/contract-pdf-generator'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { orgIdentity } from '@/lib/org-identity'
import { contractNumberFor, contractPrice, describeDestinations } from '@/lib/contract-facts'
import { sanitizeContractDocument } from '@/lib/contract-document'
import { loadJapaneseFont } from '@/lib/pdf-fonts-node'

/** A calendar date as words, on its own day (no timezone shift). */
function contractDay(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export async function POST(request: NextRequest) {
  try {
    // The service-role client below sees every org: the caller's org is the
    // boundary. It read the itinerary by id alone, so anyone signed in could
    // send another org's contract to that org's client.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { itineraryId } = body
    // The contract as the page shows it (bounded, text only). The parties and
    // the recipient still come from the database.
    const contract = sanitizeContractDocument(body.contract)

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
    const totalCost: number | null = contract.totalCost !== undefined
      ? contract.totalCost
      : typeof itinerary.total_cost === 'number' ? itinerary.total_cost : null
    const tourName = contract.tourName?.trim() || itinerary.trip_name || 'Your tour'
    const identity = await orgIdentity(orgId)
    const contractData = {
      provider: { name: identity.name, website: identity.website, email: identity.email, location: identity.address },
      contractNumber: contractNumberFor(itinerary),
      // Noon UTC on the business's date: formatted anywhere, it stays that date
      // (the UTC instant read as the previous day before 09:00 in Japan).
      contractDate: `${businessToday()}T12:00:00Z`,
      clientName: itinerary.client_name || 'Valued Guest',
      clientEmail: itinerary.client_email,
      numTravelers: (itinerary.num_adults || 1) + (itinerary.num_children || 0),
      tourName,
      startDate: itinerary.start_date,
      endDate: itinerary.end_date,
      // The trip's own destinations — it printed "Cairo, Luxor, Aswan" for all.
      destinations: contract.destinations?.trim() || describeDestinations(itinerary.destinations),
      totalCost,
      document: {
        ...contract,
        // Sent without the page (an older client): the trip's own lists.
        inclusions: contract.inclusions ?? (itinerary.inclusions || undefined),
        exclusions: contract.exclusions ?? (itinerary.exclusions || undefined),
      },
      currency: itinerary.currency || 'EUR',
    }

    // Noto Sans JP, so a contract translated into Japanese or Russian prints.
    const pdfBytes = await generateContractPDF(contractData, { font: await loadJapaneseFont() })
    
    // Upload to Supabase Storage
    console.log('📤 Uploading PDF to storage...')
    const fileName = `contracts/contract-${safeKeySegment(itineraryId, 'trip')}-${Date.now()}.pdf`
    
    // Private bucket + a signed link that expires — see lib/storage/outbound-documents.
    
    const pdfUrl = await uploadOutboundPdf(supabase, fileName, pdfBytes)
    console.log('✅ PDF uploaded (private, signed link)')

    // Build message
    // The org's own name and contacts (Settings), not one install-wide name.
    const businessName = identity.name

    const message = (businessName ? `📄 *${businessName}* 📄\n\n` : '') +
      `Dear ${itinerary.client_name || 'Valued Guest'},\n\n` +
      `Your tour contract is ready! 🎉\n\n` +
      `📋 *Contract Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${tourName}\n` +
      // "8 November 2026", not Node's default US "11/8/2026".
      `📅 *Dates:* ${contractDay(itinerary.start_date)} - ${contractDay(itinerary.end_date)}\n` +
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
      orgId,
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