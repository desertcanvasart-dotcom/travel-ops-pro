import { NextRequest, NextResponse } from 'next/server'
import { safeKeySegment } from '@/lib/storage-key'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      documentId,
      supplierPhone,
      supplierName,
      documentNumber,
      documentType,
      clientName,
      serviceDate,
      pdfBase64,
    } = body

    if (!supplierPhone) {
      return NextResponse.json(
        { success: false, error: 'Supplier phone number is required' },
        { status: 400 }
      )
    }

    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, error: 'PDF attachment is required' },
        { status: 400 }
      )
    }

    // Upload PDF to Supabase Storage so Twilio can access it.
    // documentNumber comes straight off the request body and is checked against
    // nothing — it was the only key here built from arbitrary caller text. The
    // `documents` bucket is public, so a key of the caller's choosing is a file
    // of the caller's choosing at a URL of the caller's choosing.
    const fileName = `supplier-documents/${safeKeySegment(documentNumber, 'document')}-${Date.now()}.pdf`
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw new Error(`Failed to upload PDF: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName)

    const pdfUrl = urlData.publicUrl

    // Build WhatsApp message
    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'

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
