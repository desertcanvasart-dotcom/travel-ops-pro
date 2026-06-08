import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { clientMessage } from '@/lib/api-errors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      documentId,
      supplierEmail,
      supplierName,
      documentNumber,
      documentType,
      clientName,
      pdfBase64,
    } = body

    if (!supplierEmail) {
      return NextResponse.json(
        { success: false, error: 'Supplier email is required' },
        { status: 400 }
      )
    }

    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, error: 'PDF attachment is required' },
        { status: 400 }
      )
    }

    // Build email content
    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    const businessEmail = process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'

    const emailSubject = `${documentType} - ${documentNumber} | Guest: ${clientName} | ${businessName}`

    const emailBody = `
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: linear-gradient(135deg, #647C47 0%, #4a5c35 100%); color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 25px; background: #ffffff; }
    .details { background: #f0f5eb; padding: 15px; border-left: 4px solid #647C47; margin: 15px 0; border-radius: 4px; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h2 style="margin: 0;">${businessName}</h2>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">${documentType}</p>
  </div>
  <div class="content">
    <p>Dear <strong>${supplierName}</strong>,</p>
    <p>Please find the attached ${documentType.toLowerCase()} for your reference.</p>
    <div class="details">
      <p><strong>Document:</strong> ${documentNumber}</p>
      <p><strong>Type:</strong> ${documentType}</p>
      <p><strong>Guest:</strong> ${clientName}</p>
    </div>
    <p>Please review the attached document and confirm at your earliest convenience.</p>
    <p>If you have any questions, please don't hesitate to contact us.</p>
    <p>Best regards,<br/><strong>${businessName} Team</strong></p>
  </div>
  <div class="footer">
    <p>${businessName} | ${businessEmail}</p>
  </div>
</body>
</html>`

    // Get first connected Gmail account
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
        },
        { status: 401 }
      )
    }

    // Get authenticated Gmail client
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

    // Build email with PDF attachment
    const filename = `${documentNumber}_${supplierName.replace(/\s+/g, '_')}.pdf`
    const rawEmail = buildEmailWithAttachment(
      supplierEmail,
      emailSubject,
      emailBody,
      filename,
      pdfBase64
    )

    // Send via Gmail API
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawEmail },
    })

    console.log('✅ Supplier document email sent:', response.data.id)

    return NextResponse.json({
      success: true,
      messageId: response.data.id,
      message: 'Email sent successfully',
    })
  } catch (error) {
    console.error('Error sending supplier document email:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        message: clientMessage(error, 'Failed to send email'),
      },
      { status: 500 }
    )
  }
}

// ============================================
// EMAIL BUILDING HELPER
// ============================================

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
