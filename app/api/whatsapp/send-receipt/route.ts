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

    const { paymentId } = await request.json()

    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID required' }, { status: 400 })
    }

    const supabase = createServerClient()

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
          client_email
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

    const clientPhone = payment.itineraries?.client_phone
    if (!clientPhone) {
      return NextResponse.json({ success: false, error: 'Client phone not found' }, { status: 400 })
    }

    const receiptNumber = payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`
    const currencySymbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
    const currencySymbol = currencySymbols[payment.currency] || payment.currency
    const amount = `${currencySymbol}${Number(payment.amount).toFixed(2)}`
    // No payment_date printed "1 January 1970".
    const paymentDate = new Date(payment.payment_date || payment.created_at || Date.now()).toLocaleDateString('en-GB', {
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
      `Dear ${payment.itineraries?.client_name || 'Valued Customer'},\n\n` +
      `Thank you for your payment! Here are the details:\n\n` +
      `📋 *Receipt Number:* ${receiptNumber}\n` +
      `📅 *Date:* ${paymentDate}\n` +
      `💳 *Payment Method:* ${payment.payment_method?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}\n` +
      `💰 *Amount:* ${amount}\n` +
      `🎫 *Itinerary:* ${payment.itineraries?.itinerary_code || 'N/A'}\n\n` +
      `This receipt confirms your payment has been received and processed.\n\n` +
      (businessEmail || businessWebsite
        ? `For any questions, please contact us:\n` +
          (businessEmail ? `📧 ${businessEmail}\n` : '') +
          (businessWebsite ? `🌐 ${businessWebsite}\n` : '') + '\n'
        : '') +
      (businessName ? `Best regards,\n*${businessName} Team*` : 'Best regards,')

    console.log('📤 Sending receipt via WhatsApp:', {
      to: clientPhone,
      paymentId,
      receiptNumber
    })

    // Send via WhatsApp
    const result = await sendWhatsAppMessage({
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