import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { visibleToOrg } from '@/lib/templates/template-scope'
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
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

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
      // NOTE: any `userId` in the body is IGNORED — the sender is the signed-in
      // user (below), never a caller-supplied id.
    } = body

    if (!messageBody || !recipient) {
      return NextResponse.json({
        success: false,
        error: 'Message body and recipient are required'
      }, { status: 400 })
    }

    // WHO sends comes from the session. templates/send used to take `userId`
    // from the body and hand it to getAuthenticatedGmail — so any caller could
    // send email FROM another user's connected Gmail account. And when no
    // userId was given it fell back to "the first connected account in the
    // table", a cross-tenant sender. Both are closed: the sender is the
    // signed-in user, or the send fails.
    const sessionUserId = await getCurrentUserId()
    if (channel === 'email' && !sessionUserId) {
      return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })
    }

    let result

    if (channel === 'email') {
      result = await sendEmail(recipient, subject, messageBody, sessionUserId!)
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

    // template_send_log has client_id but no recipient_type / recipient_id:
    // writing them made PostgREST reject the whole row, so every send from
    // the Templates page vanished from history and analytics.
    if (recipientType === 'client' && recipientId) {
      logEntry.client_id = recipientId
    } else if (clientId) {
      logEntry.client_id = clientId
    }
    logEntry.sent_by = await getCurrentUserId()
    logEntry.org_id = orgId

    const { error: logError } = await supabase.from('template_send_log').insert(logEntry)
    if (logError) console.error('template_send_log insert failed:', logError.message)

    // Update template usage count
    if (templateId) {
      // Fetch current template to get usage_count
      // Only a template this org can see (its own or a shared default).
      const { data: template } = await supabase
        .from('message_templates')
        .select('usage_count')
        .eq('id', templateId)
        .or(visibleToOrg(orgId))
        .maybeSingle()

      if (template) {
        await supabase
          .from('message_templates')
          .update({
            usage_count: (template.usage_count || 0) + 1,
            last_used_at: new Date().toISOString()
          })
          .eq('id', templateId)
      }
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
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Sends from the SIGNED-IN user's own Gmail. The former "first connected
    // account" fallback is gone: it sent from whichever account happened to be
    // first in the table, regardless of tenant.
    const { accessToken, refreshToken } = await getAuthenticatedGmail(userId)
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
