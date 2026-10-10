import { formatMoney } from '@/lib/currency-totals'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { orgIdentity } from '@/lib/org-identity'

export async function POST(request: NextRequest) {
  try {
    // The service-role client below sees every org: the caller's org is the
    // boundary. It looked the payment up by id alone, so anyone signed in
    // could send another org's receipt to that org's client.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { paymentId, invoicePaymentId } = await request.json()

    if (!paymentId && !invoicePaymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // What the receipt says, from either kind of payment. A payment recorded
    // against an invoice is a receipt too: the receipts page sent those the
    // INVOICE ("Balance Due …") and marked a draft invoice 'sent'.
    let receipt: {
      clientName: string | null
      clientPhone: string | null
      receiptNumber: string
      amount: unknown
      currency: string | null
      paymentDate: string | null
      paymentMethod: string | null
      referenceLabel: string
      reference: string
    }

    if (invoicePaymentId) {
      // invoice_payments has no org_id: the organisation is its invoice's.
      const { data: ip, error: ipError } = await supabase
        .from('invoice_payments')
        .select('id, amount, currency, payment_method, payment_date, transaction_reference, created_at, invoices!inner (invoice_number, client_name, client_id, itinerary_id, org_id)')
        .eq('id', invoicePaymentId)
        .eq('invoices.org_id', orgId)
        .single()

      if (ipError || !ip) {
        return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
      }
      const inv = (ip as unknown as { invoices: { invoice_number: string; client_name: string | null; client_id: string | null; itinerary_id: string | null } }).invoices

      // The same phone the invoice send uses: the client's, else the trip's.
      let phone: string | null = null
      if (inv.client_id) {
        const { data: client } = await supabase.from('clients').select('phone').eq('id', inv.client_id).eq('org_id', orgId).maybeSingle()
        phone = client?.phone ?? null
      }
      if (!phone && inv.itinerary_id) {
        const { data: itin } = await supabase.from('itineraries').select('client_phone').eq('id', inv.itinerary_id).eq('org_id', orgId).maybeSingle()
        phone = itin?.client_phone ?? null
      }

      receipt = {
        clientName: inv.client_name,
        clientPhone: phone,
        receiptNumber: ip.transaction_reference || `RCP-${String(ip.id).slice(0, 8).toUpperCase()}`,
        amount: ip.amount,
        currency: ip.currency,
        paymentDate: ip.payment_date || ip.created_at,
        paymentMethod: ip.payment_method,
        referenceLabel: 'Invoice',
        reference: inv.invoice_number || 'N/A',
      }
    } else {
      // Get payment details with itinerary
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select(`
          *,
          itineraries (
            id,
            itinerary_code,
            client_name,
            client_phone,
            client_email,
            org_id
          )
        `)
        .eq('id', paymentId)
        .eq('org_id', orgId)
        .single()

      if (paymentError || !payment) {
        return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
      }

      // A receipt says the money arrived; never send one for a pending, failed
      // or refunded payment.
      if (payment.payment_status !== 'completed') {
        return NextResponse.json(
          { success: false, error: `This payment is ${payment.payment_status ?? 'not completed'}; a receipt is only sent once it is completed.` },
          { status: 409 }
        )
      }

      // Only this org's trip: the key was stored as given (lib/org-refs), and
      // another org's would send our receipt to their client.
      const trip = payment.itineraries?.org_id === orgId ? payment.itineraries : null
      receipt = {
        clientName: trip?.client_name ?? null,
        clientPhone: trip?.client_phone ?? null,
        receiptNumber: payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`,
        amount: payment.amount,
        currency: payment.currency,
        paymentDate: payment.payment_date || payment.created_at,
        paymentMethod: payment.payment_method,
        referenceLabel: 'Itinerary',
        reference: trip?.itinerary_code || 'N/A',
      }
    }

    const clientPhone = receipt.clientPhone
    if (!clientPhone) {
      return NextResponse.json({ success: false, error: 'Client phone not found' }, { status: 400 })
    }

    const receiptNumber = receipt.receiptNumber
    // Its own symbol map had no JPY: "JPY150000.00".
    const amount = formatMoney(Number(receipt.amount), receipt.currency || 'EUR')
    // No payment_date printed "1 January 1970".
    const paymentDate = new Date(receipt.paymentDate || Date.now()).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    // The org's own name and contacts (Settings), not one install-wide name.
    const identity = await orgIdentity(orgId)
    const businessName = identity.name
    const businessEmail = identity.email
    const businessWebsite = identity.website

    // Build message
    const message = `🧾 *PAYMENT RECEIPT*\n\n` +
      `Dear ${receipt.clientName || 'Valued Customer'},\n\n` +
      `Thank you for your payment! Here are the details:\n\n` +
      `📋 *Receipt Number:* ${receiptNumber}\n` +
      `📅 *Date:* ${paymentDate}\n` +
      `💳 *Payment Method:* ${receipt.paymentMethod?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}\n` +
      `💰 *Amount:* ${amount}\n` +
      `🎫 *${receipt.referenceLabel}:* ${receipt.reference}\n\n` +
      `This receipt confirms your payment has been received and processed.\n\n` +
      (businessEmail || businessWebsite
        ? `For any questions, please contact us:\n` +
          (businessEmail ? `📧 ${businessEmail}\n` : '') +
          (businessWebsite ? `🌐 ${businessWebsite}\n` : '') + '\n'
        : '') +
      (businessName ? `Best regards,\n*${businessName} Team*` : 'Best regards,')

    console.log('📤 Sending receipt via WhatsApp:', {
      to: clientPhone,
      paymentId: paymentId || invoicePaymentId,
      receiptNumber
    })

    // Send via WhatsApp
    const result = await sendWhatsAppMessage({
      orgId,
      to: clientPhone,
      body: message
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    console.log('✅ Receipt sent successfully via WhatsApp:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Receipt sent successfully'
    })

  } catch (error: any) {
    console.error('❌ Send receipt error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}