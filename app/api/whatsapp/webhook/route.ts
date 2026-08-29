// ============================================
// API: WHATSAPP WEBHOOK HANDLER
// ============================================
// POST /api/whatsapp/webhook
// Receives incoming WhatsApp messages from Twilio
// Stores in conversation-based structure for chat UI
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCopilotInboxEntry } from '@/lib/copilot-intake'
import { verifyTwilioSignature, formDataToParams } from '@/lib/twilio-signature'

// Use service role key to bypass RLS — webhooks have no user session
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// SECURITY: this endpoint is on the middleware self-auth allowlist (no session),
// uses the RLS-bypassing service-role client, and creates clients/conversations/
// Copilot inbox entries. The X-Twilio-Signature check that protects it now lives
// in lib/twilio-signature.ts, shared with the status callback.

export async function POST(request: NextRequest) {
  try {
    // Parse Twilio webhook data (form-urlencoded)
    const formData = await request.formData()

    // Build a plain params object for signature verification + field access.
    const params = formDataToParams(formData)

    // SECURITY: verify the request genuinely came from Twilio BEFORE any DB writes.
    if (!verifyTwilioSignature(request, params, 'WhatsApp inbound webhook')) {
      return NextResponse.json({ error: 'Invalid Twilio signature' }, { status: 403 })
    }

    const from = formData.get('From') as string // e.g., "whatsapp:+201234567890"
    const to = formData.get('To') as string // Your WhatsApp number
    const body = formData.get('Body') as string // Message text
    const messageSid = formData.get('MessageSid') as string
    const numMedia = parseInt(formData.get('NumMedia') as string) || 0
    const mediaUrl = formData.get('MediaUrl0') as string || null
    const mediaType = formData.get('MediaContentType0') as string || null

    console.log('📥 Received WhatsApp message:', {
      from,
      to,
      messageSid,
      body: body?.substring(0, 50) + '...',
      hasMedia: numMedia > 0
    })

    // Extract phone number (remove "whatsapp:" prefix)
    const phoneNumber = from.replace('whatsapp:', '')
    const toNumber = to.replace('whatsapp:', '')
    
    // ============================================
    // STEP 1: Find or create client
    // ============================================
    let clientId = null
    let clientName = null
    
    // `full_name` is not a column on clients (it is first_name / last_name), so
    // this query returned 42703 every time. The error was discarded, so
    // existingClient was permanently null: NO inbound WhatsApp message has ever
    // been matched to the customer who sent it. Found while fixing the swallowed
    // errors below — the same failure mode, one step earlier in the handler.
    const { data: existingClient, error: clientLookupError } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('phone', phoneNumber)
      .maybeSingle()

    if (clientLookupError) {
      // Not fatal: an unmatched message is still worth storing, and the inbox
      // shows it against the phone number. Just never again in silence.
      console.error('⚠️ Client lookup failed for', phoneNumber, clientLookupError)
    }

    if (existingClient) {
      clientId = existingClient.id
      clientName = `${existingClient.first_name || ''} ${existingClient.last_name || ''}`.trim() || null
    }

    // ============================================
    // STEP 2: Find or create conversation
    // ============================================
    let conversationId = null
    
    const { data: existingConversation } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('phone_number', phoneNumber)
      .maybeSingle()

    if (existingConversation) {
      conversationId = existingConversation.id
      
      // Update conversation with client info if we found one and it wasn't linked
      if (clientId) {
        await supabase
          .from('whatsapp_conversations')
          .update({ 
            client_id: clientId, 
            client_name: clientName,
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId)
          .is('client_id', null) // Only update if not already linked
      }
    } else {
      // Create new conversation
      const { data: newConversation, error: convError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone_number: phoneNumber,
          client_id: clientId,
          client_name: clientName,
          status: 'active'
        })
        .select()
        .single()

      if (convError) {
        // A customer's message with nowhere to be filed. This used to be logged
        // and then swallowed by the 200 below; ask Twilio to send it again.
        console.error('❌ Error creating conversation:', convError)
        return retryable('could not create conversation')
      }
      conversationId = newConversation.id
      console.log('✅ Created new conversation:', conversationId)
    }

    // ============================================
    // STEP 3: Store the incoming message
    // ============================================
    const { error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversationId,
        message_sid: messageSid,
        direction: 'inbound',
        message_body: body,
        media_url: mediaUrl,
        media_type: mediaType,
        status: 'delivered',
        sent_at: new Date().toISOString()
      })

    if (msgError) {
      // 23505 = unique violation on message_sid. That is Twilio redelivering a
      // message we already stored, which is the SUCCESS case for a retry, not a
      // failure: acknowledge it and stop, or we would loop forever. Any other
      // error is a real write failure and must be retried.
      if (msgError.code === '23505') {
        console.log('↩️ Duplicate delivery for', messageSid, '— already stored, acknowledging')
        return twilioAck()
      }
      console.error('❌ Error storing message:', msgError)
      return retryable('could not store message')
    }

    console.log('✅ Message stored successfully')

    // Update conversation metadata (last_message, last_message_at, unread_count)
    // so the Unified Inbox shows the latest snippet and an accurate badge.
    if (conversationId) {
      const messageSnippet = body || (numMedia > 0 ? '📎 Media' : '')

      // ATOMIC. This was a read of unread_count, a +1 in JavaScript, and a write
      // back — two messages arriving together both read the same number and both
      // wrote the same number, so one of the increments simply vanished and the
      // badge under-counted. The increment now happens inside the database, in
      // one statement, under the row lock the UPDATE takes anyway.
      const { error: bumpError } = await supabase.rpc('bump_whatsapp_conversation', {
        p_conversation_id: conversationId,
        p_last_message: messageSnippet,
      })

      if (bumpError) {
        // The badge is cosmetic and the message is already safely stored — do
        // NOT ask Twilio to redeliver over this, or a missing function would
        // turn into an infinite retry loop that duplicates nothing but load.
        console.error('❌ Error updating conversation metadata (non-blocking):', bumpError)
      }
    }

    // ============================================
    // STEP 4: Create copilot inbox entry for AI draft generation
    // ============================================
    if (conversationId && body) {
      try {
        await createCopilotInboxEntry(
          {
            channel: 'whatsapp',
            whatsappConversationId: conversationId,
            sourceMessageId: messageSid,
            senderName: clientName,
            senderContact: phoneNumber,
            messageBody: body,
            receivedAt: new Date().toISOString(),
            clientId: clientId,
            clientName: clientName,
          },
          supabase
        )
        console.log('✅ Copilot inbox entry created for WhatsApp message')
      } catch (copilotError) {
        // Copilot failures must never break the webhook
        console.error('⚠️ Copilot intake failed (non-blocking):', copilotError)
      }
    }

    // ============================================
    // STEP 5: Auto-respond to common queries
    // ============================================
    const lowerBody = body?.toLowerCase() || ''
    
    if (lowerBody.includes('booking') || lowerBody.includes('quote') || lowerBody.includes('reservation')) {
      // Find recent itineraries for this client or phone number
      let itineraryQuery = supabase
        .from('itineraries')
        .select('id, tour_name, start_date, status')
        .order('created_at', { ascending: false })
        .limit(1)

      // Search by client_id if available, otherwise try phone
      if (clientId) {
        itineraryQuery = itineraryQuery.eq('client_id', clientId)
      } else {
        itineraryQuery = itineraryQuery.eq('client_phone', phoneNumber)
      }

      const { data: itineraries } = await itineraryQuery

      if (itineraries && itineraries.length > 0) {
        const itinerary = itineraries[0]
        const businessName = process.env.BUSINESS_NAME || ''
        
        const autoResponse = `Thank you for your message! 😊\n\n` +
          `Your most recent booking:\n` +
          `🎯 ${itinerary.tour_name}\n` +
          `📅 ${new Date(itinerary.start_date).toLocaleDateString()}\n` +
          `📋 Status: ${itinerary.status}\n\n` +
          `Our team will respond to your inquiry shortly. For urgent matters, please call us directly.\n\n` +
          `Best regards,\n${businessName} Team`

        // TODO: Uncomment to enable auto-responses via Twilio
        // await sendAutoResponse(phoneNumber, autoResponse, conversationId, supabase)
        console.log('💬 Auto-response prepared (not sent):', autoResponse.substring(0, 100) + '...')
      }
    }

    // Check for greeting keywords
    if (lowerBody.match(/^(hi|hello|hola|مرحبا|bonjour|hey)[\s!]?$/i)) {
      const businessName = process.env.BUSINESS_NAME || ''
      const greetingResponse = `Hello! 👋 Welcome to ${businessName}.\n\n` +
        `How can we help you today?\n\n` +
        `• Type "booking" to check your reservation\n` +
        `• Type "quote" to request a new quote\n` +
        `• Or just tell us what you need!\n\n` +
        `Our team typically responds within 30 minutes during business hours.`
      
      console.log('💬 Greeting prepared (not sent):', greetingResponse.substring(0, 100) + '...')
    }

    return twilioAck()

  } catch (error: any) {
    console.error('❌ Error processing WhatsApp webhook:', error)
    return retryable('unhandled error')
  }
}

// Empty TwiML, HTTP 200: "received and dealt with, send nothing back".
function twilioAck() {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  )
}

// A 5xx is how you tell Twilio to try again. The handler used to answer 200 no
// matter what went wrong, which reads as "stored" — so a database failure threw
// a real customer's message away silently and permanently, with nothing but a
// container log to say it ever arrived.
function retryable(reason: string) {
  console.error('↩️ Asking Twilio to retry:', reason)
  return NextResponse.json({ error: reason }, { status: 503 })
}

// ============================================
// HELPER: Send auto-response (uncomment to enable)
// ============================================
// async function sendAutoResponse(
//   toPhone: string, 
//   message: string, 
//   conversationId: string,
//   supabase: any
// ) {
//   try {
//     const twilio = require('twilio')(
//       process.env.TWILIO_ACCOUNT_SID,
//       process.env.TWILIO_AUTH_TOKEN
//     )
//     
//     const twilioMessage = await twilio.messages.create({
//       body: message,
//       from: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
//       to: `whatsapp:${toPhone}`
//     })
//     
//     // Store outbound message
//     await supabase.from('whatsapp_messages').insert({
//       conversation_id: conversationId,
//       message_sid: twilioMessage.sid,
//       direction: 'outbound',
//       message_body: message,
//       status: twilioMessage.status,
//       sent_at: new Date().toISOString()
//     })
//     
//     console.log('✅ Auto-response sent:', twilioMessage.sid)
//   } catch (error) {
//     console.error('❌ Failed to send auto-response:', error)
//   }
// }

// GET endpoint for webhook verification
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'WhatsApp webhook endpoint is active',
    webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`,
    features: [
      'Conversation-based message storage',
      'Auto client matching',
      'Keyword detection (booking, quote, greetings)',
      'Media support'
    ]
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
// ============================================
// DATABASE SCHEMA (NEW)
// ============================================
// 
// whatsapp_conversations:
//   - id UUID PRIMARY KEY
//   - phone_number VARCHAR(50) UNIQUE
//   - client_id UUID REFERENCES clients(id)
//   - client_name VARCHAR(255)
//   - last_message TEXT (auto-updated by trigger)
//   - last_message_at TIMESTAMP (auto-updated by trigger)
//   - unread_count INTEGER (auto-updated by trigger)
//   - status VARCHAR(20): active, archived, blocked
//
// whatsapp_messages:
//   - id UUID PRIMARY KEY
//   - conversation_id UUID REFERENCES whatsapp_conversations(id)
//   - message_sid VARCHAR(255) UNIQUE
//   - direction: inbound, outbound
//   - message_body TEXT
//   - media_url TEXT
//   - media_type VARCHAR(50)
//   - status: queued, sent, delivered, read, failed
//   - sent_at TIMESTAMP
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
//   "MediaUrl0": "https://...", (if media attached)
//   "MediaContentType0": "image/jpeg", (if media attached)
//   "FromCity": "Cairo",
//   "FromCountry": "EG"
// }
// ============================================
