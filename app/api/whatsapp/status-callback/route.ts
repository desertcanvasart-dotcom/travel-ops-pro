import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyTwilioSignature, formDataToParams } from '@/lib/twilio-signature'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Twilio Status Callback
// Receives message delivery status updates from Twilio.
//
// SECURITY: this route has no user session and runs on the RLS-bypassing
// service-role client. It reached that state by accident — the middleware
// self-auth allowlist entry for '/api/whatsapp/status' matched it by PREFIX —
// and it verified nothing, so anyone on the internet could rewrite the delivery
// record of any message whose SID they could guess or observe: mark a delivered
// message "failed", or a failed one "delivered", and the operator's own audit
// of what reached a customer becomes fiction. It now verifies Twilio's HMAC
// signature before touching the database, exactly like the inbound webhook.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const params = formDataToParams(formData)

    if (!verifyTwilioSignature(request, params, 'WhatsApp status callback')) {
      return NextResponse.json({ error: 'Invalid Twilio signature' }, { status: 403 })
    }

    const messageSid = params.MessageSid
    const messageStatus = params.MessageStatus
    const errorCode = params.ErrorCode || null
    const errorMessage = params.ErrorMessage || null
    const to = params.To

    console.log('📊 Status Callback:', { messageSid, messageStatus, errorCode, to })

    if (!messageSid) {
      return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .update({
        status: messageStatus,
        error_code: errorCode,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('message_sid', messageSid)
      .select('id')
      .maybeSingle()

    if (error) {
      // A write failure is OUR problem, and answering 200 to it is how the
      // delivery log quietly drifts out of step with reality. Say so: Twilio
      // records the failed callback and it shows up in the console's error log
      // instead of nowhere at all.
      console.error('Error updating message status:', error)
      return NextResponse.json({ error: 'Failed to record status' }, { status: 500 })
    }

    if (!data) {
      // A status for a message we never stored (e.g. sent from another system
      // on the same Twilio number). Nothing to do, and nothing wrong.
      console.warn('⚠️ Status callback for unknown MessageSid:', messageSid)
      return new NextResponse('OK', { status: 200 })
    }

    console.log('✅ Message status updated:', messageSid, '→', messageStatus)

    if (messageStatus === 'failed' || messageStatus === 'undelivered') {
      console.error('❌ Message delivery failed:', { messageSid, errorCode, errorMessage, to })
    }

    return new NextResponse('OK', { status: 200 })

  } catch (error) {
    console.error('Status callback error:', error)
    return NextResponse.json({ error: 'Status callback failed' }, { status: 500 })
  }
}

// GET - Health check. Describes the endpoint only; no configuration, no data.
export async function GET() {
  return NextResponse.json({
    endpoint: 'WhatsApp Status Callback',
    status: 'active',
    description: 'Receives message delivery status updates from Twilio',
    statuses: ['queued', 'sent', 'delivered', 'read', 'failed', 'undelivered']
  })
}
