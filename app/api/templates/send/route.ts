import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError, sendEmail as gmailSendEmail } from '@/lib/gmail'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      templateId,
      channel,
      clientId,      // Legacy - for clients
      recipientId,   // New - for any recipient
      recipientType, // New - 'client', 'hotel', 'cruise', 'transport', 'guide'
      recipient,
      subject,
      body: messageBody,
      userId,        // Required for email channel
    } = body

    if (!messageBody || !recipient) {
      return NextResponse.json({
        success: false,
        error: 'Message body and recipient are required'
      }, { status: 400 })
    }

    let result

    if (channel === 'email') {
      result = await sendEmail(recipient, subject, messageBody, userId)
    } else if (channel === 'whatsapp') {
      result = await sendWhatsApp(recipient, messageBody)
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid channel'
      }, { status: 400 })
    }

    // Log the send - support both old and new fields
    const logEntry: any = {
      template_id: templateId,
      channel,
      recipient_email: channel === 'email' ? recipient : null,
      recipient_phone: channel === 'whatsapp' ? recipient : null,
      subject,
      body_preview: messageBody.substring(0, 500),
      status: result.success ? 'sent' : 'failed',
      error_message: result.error,
    }

    // Add recipient info based on type
    if (recipientType && recipientId) {
      logEntry.recipient_type = recipientType
      logEntry.recipient_id = recipientId

      // Also set client_id if it's a client (for backwards compatibility)
      if (recipientType === 'client') {
        logEntry.client_id = recipientId
      }
    } else if (clientId) {
      // Legacy support
      logEntry.client_id = clientId
      logEntry.recipient_type = 'client'
      logEntry.recipient_id = clientId
    }

    await supabase.from('template_send_log').insert(logEntry)

    // Update template usage count
    if (templateId) {
      // Fetch current template to get usage_count
      const { data: template } = await supabase
        .from('message_templates')
        .select('usage_count')
        .eq('id', templateId)
        .single()

      await supabase
        .from('message_templates')
        .update({
          usage_count: (template?.usage_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', templateId)
    }

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Message sent via ${channel}`
    })

  } catch (error) {
    console.error('Template send error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// ============================================
// EMAIL SENDING (via Gmail OAuth API)
// ============================================

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // If no userId provided, look up the first connected Gmail account
    let effectiveUserId = userId
    if (!effectiveUserId) {
      const { data: tokens } = await supabase
        .from('gmail_tokens')
        .select('user_id')
        .limit(1)
        .single()

      if (!tokens) {
        return {
          success: false,
          error: 'Gmail not connected. Please connect your Gmail account in Settings.'
        }
      }
      effectiveUserId = tokens.user_id
    }

    // Use the centralized Gmail auth helper
    const { accessToken, refreshToken } = await getAuthenticatedGmail(effectiveUserId!)
    await gmailSendEmail(accessToken, refreshToken, to, subject, body)

    return { success: true }
  } catch (error: any) {
    if (error instanceof GmailAuthError) {
      return { success: false, error: clientMessage(error, 'Internal server error') }
    }
    console.error('Email send error:', error)
    return { success: false, error: clientMessage(error, 'Failed to send email') }
  }
}

// ============================================
// WHATSAPP SENDING (via lib/twilio-whatsapp)
// ============================================

async function sendWhatsApp(
  to: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await sendWhatsAppMessage({ to, body })
    return { success: result.success, error: result.error }
  } catch (error: any) {
    console.error('WhatsApp send error:', error)
    return { success: false, error: clientMessage(error, 'Failed to send WhatsApp message') }
  }
}
