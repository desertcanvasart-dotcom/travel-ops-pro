import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { google } from 'googleapis'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      // Itinerary email fields
      itineraryId,
      clientName,
      clientEmail,
      itineraryCode,
      tripName,
      totalCost,
      currency,
      pdfBase64,
      // Generic email fields (used by cron/reminders)
      to,
      subject: customSubject,
      html: customHtml,
    } = body

    const recipientEmail = clientEmail || to
    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, error: 'Recipient email is required' },
        { status: 400 }
      )
    }

    // Determine subject and body
    let emailSubject: string
    let emailBody: string

    if (customSubject && customHtml) {
      // Generic email (reminders, cron, etc.)
      emailSubject = customSubject
      emailBody = customHtml
    } else if (clientName && itineraryCode && tripName) {
      // Itinerary email with PDF
      emailSubject = `Your Egypt Tour Itinerary - ${tripName} (${itineraryCode})`
      emailBody = generateEmailTemplate(clientName, itineraryCode, tripName, totalCost, currency)
    } else {
      return NextResponse.json(
        { success: false, error: 'Missing email content parameters' },
        { status: 400 }
      )
    }

    // Get first connected Gmail account (system-level sending)
    const { data: tokenRecord } = await supabase
      .from('gmail_tokens')
      .select('user_id')
      .limit(1)
      .single()

    if (!tokenRecord) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gmail not connected. Please connect your Gmail account in Settings.',
          details: 'No Gmail OAuth tokens found. Connect Gmail from the Settings page.'
        },
        { status: 401 }
      )
    }

    // Get authenticated Gmail client via centralized helper
    let gmail
    try {
      const auth = await getAuthenticatedGmail(tokenRecord.user_id)
      gmail = auth.gmail
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: 401 }
        )
      }
      throw err
    }

    // Build email with or without PDF attachment
    let rawEmail: string

    if (pdfBase64) {
      const filename = itineraryCode && clientName
        ? `${itineraryCode}_${clientName.replace(/\s+/g, '_')}.pdf`
        : 'itinerary.pdf'
      rawEmail = buildEmailWithAttachment(recipientEmail, emailSubject, emailBody, filename, pdfBase64)
    } else {
      rawEmail = buildSimpleEmail(recipientEmail, emailSubject, emailBody)
    }

    // Send via Gmail API
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawEmail },
    })

    return NextResponse.json({
      success: true,
      messageId: response.data.id,
      message: 'Email sent successfully'
    })

  } catch (error) {
    console.error('Error sending email:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// ============================================
// EMAIL BUILDING HELPERS
// ============================================

function buildSimpleEmail(to: string, subject: string, body: string): string {
  const fromAddress = process.env.GMAIL_USER || 'info@travel2egypt.org'
  const fromName = 'Islam Mohamed - Travel2Egypt.org'

  const emailLines = [
    `From: ${fromName} <${fromAddress}>`,
    `To: ${to}`,
    `Bcc: ${fromAddress}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ]

  return Buffer.from(emailLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildEmailWithAttachment(
  to: string,
  subject: string,
  body: string,
  filename: string,
  attachmentBase64: string
): string {
  const fromAddress = process.env.GMAIL_USER || 'info@travel2egypt.org'
  const fromName = 'Islam Mohamed - Travel2Egypt.org'
  const boundary = `boundary_${Date.now()}`

  const emailParts = [
    `From: ${fromName} <${fromAddress}>`,
    `To: ${to}`,
    `Bcc: ${fromAddress}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    attachmentBase64,
    `--${boundary}--`,
  ]

  return Buffer.from(emailParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
