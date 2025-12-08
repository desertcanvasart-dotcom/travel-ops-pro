import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Twilio Status Callback
// This endpoint receives message delivery status updates from Twilio
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    // Extract status callback data
    const messageSid = formData.get('MessageSid') as string
    const messageStatus = formData.get('MessageStatus') as string
    const errorCode = formData.get('ErrorCode') as string | null
    const errorMessage = formData.get('ErrorMessage') as string | null
    const to = formData.get('To') as string
    const from = formData.get('From') as string

    console.log('📊 Status Callback:', {
      messageSid,
      messageStatus,
      errorCode,
      to,
      from
    })

    if (!messageSid) {
      return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 })
    }

    // Update message status in database
    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .update({
        status: messageStatus,
        error_code: errorCode,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('message_sid', messageSid)
      .select()
      .single()

    if (error) {
      console.error('Error updating message status:', error)
      // Don't return error - Twilio expects 200 OK
    } else {
      console.log('✅ Message status updated:', messageSid, '→', messageStatus)
    }

    // Log failed messages for debugging
    if (messageStatus === 'failed' || messageStatus === 'undelivered') {
      console.error('❌ Message delivery failed:', {
        messageSid,
        errorCode,
        errorMessage,
        to
      })
    }

    // Twilio expects a 200 OK response
    return new NextResponse('OK', { status: 200 })

  } catch (error) {
    console.error('Status callback error:', error)
    // Always return 200 to Twilio to prevent retries
    return new NextResponse('OK', { status: 200 })
  }
}

// GET - Health check
export async function GET() {
  return NextResponse.json({
    endpoint: 'WhatsApp Status Callback',
    status: 'active',
    description: 'Receives message delivery status updates from Twilio',
    statuses: ['queued', 'sent', 'delivered', 'read', 'failed', 'undelivered']
  })
}
