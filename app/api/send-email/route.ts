import { NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { google } from 'googleapis'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { lookupServerMessage } from '@/lib/i18n/server-messages'
import { resolveClientLocaleByEmail, type RecipientLocale } from '@/lib/i18n/recipient-locale'

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
      // Optional explicit recipient locale (caller may pass it; otherwise we
      // resolve it from the client record below).
      locale: bodyLocale,
    } = body

    const recipientEmail = clientEmail || to
    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, error: 'Recipient email is required' },
        { status: 400 }
      )
    }

    // Tier 2: the email is written in the CLIENT's language, not the operator's.
    // Prefer an explicit locale from the caller; else resolve from
    // clients.preferred_language by email; else default 'en'. (The generic
    // reminder/cron path arrives pre-localized, so this only affects the
    // itinerary email composed below.)
    const recipientLocale: RecipientLocale =
      bodyLocale === 'ja' || bodyLocale === 'en'
        ? bodyLocale
        : await resolveClientLocaleByEmail(supabase, recipientEmail)

    // Determine subject and body
    let emailSubject: string
    let emailBody: string

    if (customSubject && customHtml) {
      // Generic email (reminders, cron, etc.)
      emailSubject = customSubject
      emailBody = customHtml
    } else if (clientName && itineraryCode && tripName) {
      // Itinerary email with PDF — output gate (harness Layer 2): never email a
      // non-deliverable price. (Generic reminder/cron emails carry no price.)
      const priceCheck = checkAmountDeliverable(totalCost, { currency })
      if (!priceCheck.ok) {
        return NextResponse.json(
          { success: false, error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
          { status: 422 }
        )
      }
      emailSubject = lookupServerMessage(recipientLocale, 'email.itinerary.subject', { tripName, itineraryCode })
      emailBody = generateEmailTemplate(clientName, itineraryCode, tripName, totalCost, currency, recipientLocale)
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
          { success: false, error: clientMessage(err, 'Internal server error') },
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

// RFC 2047 encoded-word for a header value (e.g. a Japanese Subject). Email
// headers must be 7-bit ASCII; a raw non-ASCII Subject mojibakes in many
// clients. ASCII subjects are passed through unchanged.
function encodeEmailHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function buildSimpleEmail(to: string, subject: string, body: string): string {
  const fromAddress = process.env.GMAIL_USER || 'info@travel2egypt.org'
  const fromName = 'Islam Mohamed - Travel2Egypt.org'

  // The HTML body is base64-encoded (Content-Transfer-Encoding: base64) so
  // multi-byte UTF-8 (Japanese) survives intact rather than being emitted as
  // raw 8-bit text under a default 7-bit assumption.
  const emailLines = [
    `From: ${fromName} <${fromAddress}>`,
    `To: ${to}`,
    `Bcc: ${fromAddress}`,
    `Subject: ${encodeEmailHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
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
    `Subject: ${encodeEmailHeader(subject)}`,
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
