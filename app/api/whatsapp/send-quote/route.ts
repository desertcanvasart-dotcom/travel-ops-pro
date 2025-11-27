// ============================================
// API: SEND QUOTE VIA WHATSAPP
// ============================================
// POST /api/whatsapp/send-quote
// Sends a quote to a client via WhatsApp with PDF attachment
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { sendQuoteViaWhatsApp } from '@/lib/twilio-whatsapp'
import { createClient } from '@/app/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      itineraryId,
      clientName,
      clientPhone,
      clientEmail
    } = body

    // Validate required fields
    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    if (!clientPhone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number is required' },
        { status: 400 }
      )
    }

    // Get itinerary details from database
    const supabase = createClient()
    const { data: itinerary, error: dbError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (dbError || !itinerary) {
      console.error('❌ Database error:', dbError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Generate PDF URL (assuming you have a PDF generation endpoint)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const pdfUrl = `${appUrl}/api/pdf/quote/${itineraryId}`

    // Prepare quote data
    const quoteData = {
      clientName: clientName || itinerary.client_name,
      clientPhone: clientPhone,
      itineraryId: itinerary.id,
      tourName: itinerary.tour_name || 'Egypt Tour',
      startDate: itinerary.start_date,
      endDate: itinerary.end_date,
      adults: itinerary.adults || 1,
      children: itinerary.children || 0,
      totalCost: itinerary.total_cost || 0,
      pdfUrl: pdfUrl
    }

    console.log('📤 Sending quote via WhatsApp:', {
      to: clientPhone,
      itineraryId,
      tourName: quoteData.tourName
    })

    // Send quote via WhatsApp
    const result = await sendQuoteViaWhatsApp(quoteData)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Update itinerary to mark quote as sent
    await supabase
      .from('itineraries')
      .update({
        quote_sent: true,
        quote_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)

    console.log('✅ Quote sent successfully via WhatsApp:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Quote sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error sending quote:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// ============================================
// USAGE EXAMPLE
// ============================================
// 
// Frontend call:
// 
// const response = await fetch('/api/whatsapp/send-quote', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({
//     itineraryId: '123e4567-e89b-12d3-a456-426614174000',
//     clientPhone: '+201234567890',
//     clientName: 'Ahmed Mohamed' // Optional, will use DB value if not provided
//   })
// })
// 
// const data = await response.json()
// if (data.success) {
//   console.log('Quote sent!', data.messageId)
// }
// ============================================