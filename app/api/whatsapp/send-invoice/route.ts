import { NextRequest, NextResponse } from 'next/server'
import { uploadOutboundPdf } from '@/lib/storage/outbound-documents'
import { orgIdentity } from '@/lib/org-identity'
import { safeKeySegment } from '@/lib/storage-key'
import { clientMessage } from '@/lib/api-errors'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createServiceClient } from '@/lib/supabase/service-client'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { formatMoney } from '@/lib/currency-totals'
import { toCompanyInfo } from '@/lib/company-info-client'
import { inlineImage } from '@/lib/documents/inline-image'
import { loadJapaneseFont } from '@/lib/pdf-fonts-node'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// The invoice PDF is the shared one (lib/invoice-pdf-generator), as the
// portal and the invoice page draw it, with Noto Sans JP. This route had its
// own pdf-lib invoice in Latin-only Helvetica, which cannot encode Japanese:
// every invoice with insurance lines (海外旅行傷害保障…), a kanji client name
// or Japanese notes failed to send. It also crashed on a null client name.

export async function POST(request: NextRequest) {
  try {
    // The service client below sees every org: the caller's org is the
    // boundary. It read the invoice by id alone, so anyone signed in could
    // send another org's invoice and flip it to "sent".
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { invoiceId } = body

    console.log('📤 Send invoice request:', { invoiceId })

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'Invoice ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('org_id', orgId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: `Invoice not found: ${invoiceError?.message || 'No data'}` },
        { status: 404 }
      )
    }

    // Output gate (harness Layer 2): never send an invoice with a non-deliverable total.
    const priceCheck = checkAmountDeliverable(invoice.total_amount, { currency: invoice.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Invoice total is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // Get client phone
    let clientPhone = null
    if (invoice.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', invoice.client_id)
        .eq('org_id', orgId)
        .single()
      clientPhone = client?.phone
    }

    if (!clientPhone && invoice.itinerary_id) {
      const { data: itinerary } = await supabase
        .from('itineraries')
        .select('client_phone')
        .eq('id', invoice.itinerary_id)
        .eq('org_id', orgId)
        .single()
      clientPhone = itinerary?.client_phone
    }

    if (!clientPhone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found. Please add phone to client profile.' },
        { status: 400 }
      )
    }

    // Generate PDF
    console.log('📄 Generating invoice PDF...')
    const identity = await orgIdentity(orgId)
    const { data: org } = await supabase
      .from('organizations')
      .select('name, contact_email, company_phone, company_website, company_address, offices, logo_url')
      .eq('id', orgId)
      .maybeSingle()
    // When the balance is due, from the trip's booking — the office and portal
    // copies print "Balance by <date>"; this one said only "Balance".
    let balanceDueDate: string | null = null
    if (invoice.itinerary_id) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('balance_due_date')
        .eq('itinerary_id', invoice.itinerary_id)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      balanceDueDate = (booking?.balance_due_date as string | null) ?? null
    }
    const doc = generateInvoicePDF(
      { ...invoice, line_items: invoice.line_items || [], balance_due_date: balanceDueDate },
      toCompanyInfo({ ...(org ?? {}), logo_data_url: await inlineImage((org as { logo_url?: string } | null)?.logo_url) }),
      { font: await loadJapaneseFont() }
    )
    const pdfBytes = new Uint8Array(doc.output('arraybuffer'))

    // Upload to Supabase Storage
    console.log('📤 Uploading PDF to storage...')
    const fileName = `invoices/invoice-${safeKeySegment(invoice.invoice_number, 'invoice')}-${Date.now()}.pdf`
    
    // Private bucket + a signed link that expires — see lib/storage/outbound-documents.
    
    const pdfUrl = await uploadOutboundPdf(supabase, fileName, pdfBytes)
    console.log('✅ PDF uploaded (private, signed link)')

    const businessName = identity.name
    const businessEmail = identity.email

    const issueDate = new Date(invoice.issue_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
    // As the PDF: a final invoice is due on the booking's balance date.
    const dueOn = invoice.due_date || (invoice.invoice_type === 'final' ? balanceDueDate : null)
    const dueDate = dueOn
      ? new Date(dueOn).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        })
      : '-'

    const typeLabel = invoice.invoice_type === 'deposit' 
      ? `Deposit Invoice (${invoice.deposit_percent}%)`
      : invoice.invoice_type === 'final'
        ? 'Final Balance Invoice'
        : 'Invoice'

    const message = (businessName ? `📄 *${businessName}* 📄\n\n` : '') +
      `Dear ${invoice.client_name},\n\n` +
      `Please find your invoice attached.\n\n` +
      `🧾 *${typeLabel}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Invoice:* ${invoice.invoice_number}\n` +
      `📅 *Issue Date:* ${issueDate}\n` +
      `⏰ *Due Date:* ${dueDate}\n\n` +
      // The currency's own decimals (JPY has none): formatMoney, as the PDF.
      `💰 *Balance Due: ${formatMoney(Number(invoice.balance_due), invoice.currency)}*\n\n` +
      (businessEmail ? `For questions, contact us:\n📧 ${businessEmail}\n\n` : '') +
      `Thank you! 🙏` + (businessName ? `\n${businessName} Team` : '')

    console.log('📤 Sending to:', clientPhone)

    const result = await sendWhatsAppMessage({
      to: clientPhone,
      body: message,
      mediaUrl: pdfUrl
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Update invoice status
    if (invoice.status === 'draft') {
      await supabase
        .from('invoices')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', invoiceId)
        .eq('org_id', orgId)
    }

    console.log('✅ Invoice sent with PDF:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      pdfUrl: pdfUrl,
      message: 'Invoice sent successfully via WhatsApp with PDF'
    })

  } catch (error: any) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}