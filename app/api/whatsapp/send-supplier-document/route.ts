import { NextRequest, NextResponse } from 'next/server'
import { uploadOutboundPdf } from '@/lib/storage/outbound-documents'
import { safeKeySegment } from '@/lib/storage-key'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@supabase/supabase-js'
import { orgIdentity } from '@/lib/org-identity'
import { markSupplierDocumentSent } from '@/lib/documents/mark-sent'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
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

    // Only this organization's vouchers.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { data: document } = documentId
      ? await supabase
          .from('supplier_documents')
          .select('id, document_type, document_number, supplier_name, supplier_contact_name, supplier_whatsapp, supplier_contact_phone, client_name, check_in, service_date')
          .eq('id', documentId)
          .eq('org_id', orgId)
          .maybeSingle()
      : { data: null }
    if (!document) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }

    const supplierPhone = document.supplier_whatsapp || document.supplier_contact_phone
    if (!supplierPhone) {
      return NextResponse.json(
        { success: false, error: 'Supplier phone number is required' },
        { status: 400 }
      )
    }
    const supplierName = document.supplier_contact_name || document.supplier_name || ''
    const documentNumber = document.document_number
    const clientName = document.client_name || ''
    const documentType = String(documentTitle || document.document_type)
    const serviceDate = document.check_in || document.service_date || null

    // Upload PDF to Supabase Storage so Twilio can access it. The key is still
    // made safe: document numbers are editable text.
    const fileName = `supplier-documents/${safeKeySegment(documentNumber, 'document')}-${Date.now()}.pdf`
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')

    // Private bucket + a signed link that expires — see lib/storage/outbound-documents.

    const pdfUrl = await uploadOutboundPdf(supabase, fileName, pdfBuffer)

    // Build WhatsApp message, signed by the organization sending it (Settings).
    const businessName = (await orgIdentity(orgId)).name

    const message =
      `*${businessName}*\n\n` +
      `Dear ${supplierName},\n\n` +
      `Please find the attached *${documentType}* (${documentNumber}) for our guest *${clientName}*.\n\n` +
      (serviceDate ? `Date: ${serviceDate}\n\n` : '') +
      `Please review and confirm at your earliest convenience.\n\n` +
      `Best regards,\n${businessName} Team`

    // Send via Twilio WhatsApp with PDF attachment
    const result = await sendWhatsAppMessage({
      to: supplierPhone,
      body: message,
      mediaUrl: pdfUrl,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log('✅ Supplier document sent via WhatsApp:', result.messageId)

    // The message has gone: record it here, not in a second request from the page.
    const marked = await markSupplierDocumentSent(supabase, { documentId: document.id, orgId, via: 'whatsapp' })
    if (marked.error) console.error('Supplier document sent but not marked sent:', marked.error)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      pdfUrl,
      message: 'Supplier document sent successfully via WhatsApp',
    })
  } catch (error: any) {
    console.error('Error sending supplier document via WhatsApp:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
