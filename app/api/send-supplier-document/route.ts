import { NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { orgGmailSenderId } from '@/lib/email/org-gmail-sender'
import { escapeHtml } from '@/lib/html-escape'
import { orgIdentity } from '@/lib/org-identity'
import { markSupplierDocumentSent } from '@/lib/documents/mark-sent'
import { headerSafe, safeEmailAddress } from '@/lib/http/safe-header'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // The recipient, number and names come from the voucher row, not the
    // request: the browser chooses only which voucher, its display title and
    // the PDF it rendered from that row.
    const { documentId, documentType: documentTitle, pdfBase64 } = body

    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, error: 'PDF attachment is required' },
        { status: 400 }
      )
    }

    // Only this organization's vouchers, from this organization's mailbox.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { data: document } = documentId
      ? await supabase
          .from('supplier_documents')
          .select('id, document_type, document_number, supplier_name, supplier_contact_email, client_name')
          .eq('id', documentId)
          .eq('org_id', orgId)
          .maybeSingle()
      : { data: null }
    if (!document) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }

    const supplierEmail = document.supplier_contact_email
    if (!safeEmailAddress(supplierEmail)) {
      return NextResponse.json(
        { success: false, error: 'Supplier email is required' },
        { status: 400 }
      )
    }
    const supplierName = document.supplier_name || ''
    const documentNumber = document.document_number
    const clientName = document.client_name || ''
    const documentType = String(documentTitle || document.document_type)

    // Signed by the organization sending it (Settings), not the platform.
    const identity = await orgIdentity(orgId)
    const businessName = identity.name
    const businessEmail = identity.email

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
    <h2 style="margin: 0;">${escapeHtml(businessName)}</h2>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">${escapeHtml(documentType)}</p>
  </div>
  <div class="content">
    <p>Dear <strong>${escapeHtml(supplierName)}</strong>,</p>
    <p>Please find the attached ${escapeHtml(String(documentType).toLowerCase())} for your reference.</p>
    <div class="details">
      <p><strong>Document:</strong> ${escapeHtml(documentNumber)}</p>
      <p><strong>Type:</strong> ${escapeHtml(documentType)}</p>
      <p><strong>Guest:</strong> ${escapeHtml(clientName)}</p>
    </div>
    <p>Please review the attached document and confirm at your earliest convenience.</p>
    <p>If you have any questions, please don't hesitate to contact us.</p>
    <p>Best regards,<br/><strong>${escapeHtml(businessName)} Team</strong></p>
  </div>
  <div class="footer">
    <p>${escapeHtml(businessName)} | ${escapeHtml(businessEmail)}</p>
  </div>
</body>
</html>`

    const senderId = await orgGmailSenderId(supabase, orgId, await getCurrentUserId())

    if (!senderId) {
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
      const auth = await getAuthenticatedGmail(senderId)
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

    // The email has gone: record it here, not in a second request from the page.
    const marked = await markSupplierDocumentSent(supabase, { documentId: document.id, orgId, via: 'email' })
    if (marked.error) console.error('Supplier document sent but not marked sent:', marked.error)

    return NextResponse.json({
      success: true,
      messageId: response.data.id,
      message: 'Email sent successfully',
      markedSent: !marked.error,
    })
  } catch (error) {
    console.error('Error sending supplier document email:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error',
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
  const boundary = `boundary_${Date.now()}`
  const safeFilename = headerSafe(filename).replace(/"/g, '')

  // No From: Gmail sends as the account the organization's mail goes out
  // from (lib/email/org-gmail-sender), and the copy is in its Sent folder.
  // There used to be a From and a Bcc to the platform-wide GMAIL_USER, which
  // copied every organization's vouchers to one mailbox.
  const emailParts = [
    `To: ${safeEmailAddress(to)}`,
    `Subject: ${headerSafe(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${safeFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${safeFilename}"`,
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
