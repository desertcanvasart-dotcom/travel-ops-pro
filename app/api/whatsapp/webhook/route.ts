// ============================================
// API: WHATSAPP WEBHOOK HANDLER
// ============================================
// POST /api/whatsapp/webhook
// Receives incoming WhatsApp messages from Twilio
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

export async function POST(request: NextRequest) {
  try {
    // Parse Twilio webhook data (form-urlencoded)
    const formData = await request.formData()
    
    const from = formData.get('From') as string // e.g., "whatsapp:+201234567890"
    const to = formData.get('To') as string // Your WhatsApp number
    const body = formData.get('Body') as string // Message text
    const messageId = formData.get('MessageSid') as string
    const numMedia = parseInt(formData.get('NumMedia') as string) || 0

    console.log('📥 Received WhatsApp message:', {
      from,
      to,
      messageId,
      body: body?.substring(0, 50) + '...',
      hasMedia: numMedia > 0
    })

    // Extract phone number (remove "whatsapp:" prefix)
    const phoneNumber = from.replace('whatsapp:', '')

    // Store message in database
    const supabase = createClient()
    
    // Find or create client
    let clientId = null
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', phoneNumber)
      .single()

    if (existingClient) {
      clientId = existingClient.id
    }

    // Store the incoming message
    await supabase
      .from('whatsapp_messages')
      .insert({
        message_id: messageId,
        from_number: phoneNumber,
        to_number: to.replace('whatsapp:', ''),
        message_body: body,
        num_media: numMedia,
        direction: 'inbound',
        client_id: clientId,
        created_at: new Date().toISOString()
      })

    // Check for keywords and auto-respond
    const lowerBody = body?.toLowerCase() || ''
    
    // Auto-respond to common queries
    if (lowerBody.includes('booking') || lowerBody.includes('quote')) {
      // Find recent itineraries for this phone number
      const { data: itineraries } = await supabase
        .from('itineraries')
        .select('id, tour_name, start_date, status')
        .eq('client_phone', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(1)

      if (itineraries && itineraries.length > 0) {
        const itinerary = itineraries[0]
        const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
        
        const autoResponse = `Thank you for your message! 😊\n\n` +
          `Your most recent booking:\n` +
          `🎯 ${itinerary.tour_name}\n` +
          `📅 ${new Date(itinerary.start_date).toLocaleDateString()}\n` +
          `📋 Status: ${itinerary.status}\n\n` +
          `Our team will respond to your inquiry shortly. For urgent matters, please call us directly.\n\n` +
          `Best regards,\n${businessName} Team`

        // Note: To send auto-responses, you'd call your send message API here
        // For now, we just log it
        console.log('💬 Auto-response prepared:', autoResponse)
      }
    }

    // Respond to Twilio with 200 OK
    return new NextResponse('OK', { status: 200 })

  } catch (error: any) {
    console.error('❌ Error processing WhatsApp webhook:', error)
    // Still return 200 to Twilio to avoid retries
    return new NextResponse('OK', { status: 200 })
  }
}

// GET endpoint for webhook verification
export async function GET(request: NextRequest) {
  // Twilio doesn't need webhook verification like some other services,
  // but we can provide a simple test endpoint
  return NextResponse.json({
    success: true,
    message: 'WhatsApp webhook endpoint is active',
    webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`
  })
}

// ============================================
// TWILIO WEBHOOK SETUP INSTRUCTIONS
// ============================================
// 
// 1. In Twilio Console, go to:
//    Messaging → Try it out → WhatsApp sandbox settings
// 
// 2. Set "When a message comes in" webhook to:
//    https://yourdomain.com/api/whatsapp/webhook
//    (For local testing, use ngrok: https://ngrok.com)
// 
// 3. For local development with ngrok:
//    - Install ngrok: npm install -g ngrok
//    - Run: ngrok http 3000
//    - Use the https URL: https://abc123.ngrok.io/api/whatsapp/webhook
// 
// 4. Database table for storing messages:
//    Create table whatsapp_messages (
//      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//      message_id VARCHAR(255) UNIQUE NOT NULL,
//      from_number VARCHAR(50) NOT NULL,
//      to_number VARCHAR(50) NOT NULL,
//      message_body TEXT,
//      num_media INTEGER DEFAULT 0,
//      direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
//      client_id UUID REFERENCES clients(id),
//      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
//    )
// 
// ============================================
// WEBHOOK PAYLOAD EXAMPLE
// ============================================
// {
//   "MessageSid": "SM1234567890",
//   "From": "whatsapp:+201234567890",
//   "To": "whatsapp:+14155238886",
//   "Body": "Hello, I have a question about my booking",
//   "NumMedia": "0",
//   "FromCity": "Cairo",
//   "FromCountry": "EG"
// }
// ============================================