import { NextRequest, NextResponse } from 'next/server'
import { toWhatsAppE164, PHONE_NEEDS_COUNTRY_CODE } from '@/lib/whatsapp-phone'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { senderForOrg, NO_WHATSAPP_SENDER } from '@/lib/whatsapp-org'
import twilio from 'twilio'
import { splitWhatsAppText, TWILIO_TEXT_LIMIT } from '@/lib/whatsapp-split'

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

// No deployment-wide sender any more: each org replies from its own number
// (lib/whatsapp-org senderForOrg) — the customer's answer comes back to that
// number, and so to that org's inbox. The Twilio sandbox number this used to
// fall back to is never right for a real customer.
//
// whatsapp_messages has no org_id: a message is reached only through a
// conversation this route has already found in the caller's org.

// GET /api/whatsapp/messages - Get messages for a conversation
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const before = searchParams.get('before') // For pagination

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    const { data: conv, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (convError) throw convError
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (before) {
      query = query.lt('sent_at', before)
    }

    const { data, error } = await query

    if (error) throw error

    // Return in chronological order for display
    const messages = (data || []).reverse()

    return NextResponse.json({ messages })
  } catch (error: any) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST /api/whatsapp/messages - Send a new message
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const body = await request.json()
    const { conversation_id, phone_number, message } = body

    if (!message || !String(message).trim() || (!conversation_id && !phone_number)) {
      return NextResponse.json({ 
        error: 'Message and either conversation_id or phone_number required' 
      }, { status: 400 })
    }

    // Before any thread is created: an org that may not send stops here.
    const from = await senderForOrg(supabase, orgId)
    if (!from) {
      return NextResponse.json({ error: NO_WHATSAPP_SENDER }, { status: 400 })
    }

    // Get or create conversation
    let convId = conversation_id
    let toPhone = phone_number

    // A conversation_id is always the thread's number — a phone_number sent
    // with it used to be trusted, writing another number's message into
    // whichever thread the id named.
    if (conversation_id) {
      const { data: conv } = await supabase
        .from('whatsapp_conversations')
        .select('phone_number')
        .eq('id', conversation_id)
        .eq('org_id', orgId)
        .maybeSingle()

      if (!conv) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      toPhone = conv.phone_number
    }

    if (!conversation_id && phone_number) {
      // Create conversation if needed
      const cleanPhone = toWhatsAppE164(phone_number)
      if (!cleanPhone) {
        return NextResponse.json({ error: PHONE_NEEDS_COUNTRY_CODE }, { status: 400 })
      }
      const { data: existing } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('org_id', orgId)
        .eq('phone_number', cleanPhone)
        .maybeSingle()

      if (existing) {
        convId = existing.id
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('whatsapp_conversations')
          .insert({ org_id: orgId, phone_number: cleanPhone })
          .select()
          .single()
        
        if (convError) throw convError
        convId = newConv.id
      }
      toPhone = cleanPhone
    }

    // Format phone number for Twilio
    const formattedPhone = toPhone.startsWith('+') ? toPhone : `+${toPhone}`

    // Longer than one WhatsApp message may be (Twilio: 1,600 characters):
    // sent as several, in order, each kept as its own message in the thread
    // so it shows what the customer received. Twilio's refusal used to leave
    // the agent cutting the text up by hand.
    const parts = splitWhatsAppText(String(message), TWILIO_TEXT_LIMIT)
    const saved: Record<string, unknown>[] = []
    let firstSid: string | null = null
    let warning: string | undefined
    for (let i = 0; i < parts.length; i++) {
      let twilioMessage
      try {
        twilioMessage = await twilioClient.messages.create({
          body: parts[i],
          from,
          to: `whatsapp:${formattedPhone}`,
          statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || "https://autoura.net"}/api/whatsapp/status-callback`
        })
      } catch (sendError: any) {
        // The first part failing is the send failing, as before.
        if (i === 0) throw sendError
        warning = `Only ${i} of ${parts.length} parts were sent: ${clientMessage(sendError, 'unknown error')}`
        break
      }
      firstSid ??= twilioMessage.sid

      // Store in database
      const { data: savedMessage, error: saveError } = await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: convId,
          message_sid: twilioMessage.sid,
          direction: 'outbound',
          message_body: parts[i],
          status: twilioMessage.status,
          sent_at: new Date().toISOString()
        })
        .select()
        .single()

      if (saveError) throw saveError
      saved.push(savedMessage)
    }
    if (!warning && parts.length > 1) {
      warning = `Sent as ${parts.length} messages (WhatsApp allows ${TWILIO_TEXT_LIMIT.toLocaleString('en-US')} characters in one).`
    }

    return NextResponse.json({
      success: true,
      // `message` is the first part (older callers read one); `messages` is every part sent.
      message: saved[0],
      messages: saved,
      twilio_sid: firstSid,
      ...(warning ? { warning } : {}),
    })
  } catch (error: any) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
