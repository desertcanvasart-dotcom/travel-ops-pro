// ============================================
// POST /api/b2c/quotes/[id]/send
// Send a B2C offer to the client (email via /api/send-email, WhatsApp via
// Twilio) and mark it 'sent'. Manager+ only. body: { send_via?: 'email'|'whatsapp' }
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole } from '@/lib/auth/current-org'
import { sendEmailInternal } from '@/lib/email-send'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const money = (v: unknown, currency: string) => {
  const n = Number(v)
  return `${currency} ${Number.isFinite(n) ? n.toFixed(2) : '0.00'}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const role = await getCurrentUserRole()
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Requires manager role or higher.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const sendVia: 'email' | 'whatsapp' = body.send_via === 'whatsapp' ? 'whatsapp' : 'email'

    const { data: quote, error } = await supabaseAdmin
      .from('b2c_quotes')
      .select('*, itineraries (trip_name, client_name, client_email)')
      .eq('id', id)
      .single()
    if (error || !quote) {
      return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
    }

    const itin = (quote as any).itineraries || {}
    const clientEmail = itin.client_email
    const clientName = itin.client_name || 'Valued Customer'
    const currency = quote.currency || 'EUR'

    const lines = [
      `Dear ${clientName},`,
      '',
      `Please find your quote for ${itin.trip_name || 'your trip'}.`,
      '',
      `Reference: ${quote.quote_number}`,
      `Travellers: ${quote.num_travelers}`,
      `Total: ${money(quote.selling_price, currency)}  (${money(quote.price_per_person, currency)} per person)`,
      quote.valid_until ? `Valid until: ${quote.valid_until}` : '',
      quote.client_notes ? `\n${quote.client_notes}` : '',
      '',
      'We look forward to welcoming you.',
      '',
      'Best regards,',
      process.env.BUSINESS_NAME || 'Travel2Egypt',
    ].filter((l) => l !== '')
    const messageText = lines.join('\n')

    if (sendVia === 'whatsapp') {
      const phone = body.to // WhatsApp number must be provided (itineraries carry no phone here)
      if (!phone) return NextResponse.json({ success: false, error: 'A WhatsApp number (to) is required' }, { status: 400 })
      const result = await sendWhatsAppMessage({ to: phone, body: messageText })
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'WhatsApp send failed' }, { status: 502 })
      }
    } else {
      if (!clientEmail) return NextResponse.json({ success: false, error: 'Client email not found on the itinerary' }, { status: 400 })
      const subject = `Your Quote – ${quote.quote_number}`
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;white-space:pre-wrap;line-height:1.6">${
        messageText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }</div>`
      const result = await sendEmailInternal({ to: clientEmail, subject, html })
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'Email send failed' }, { status: 502 })
      }
    }

    await supabaseAdmin
      .from('b2c_quotes')
      .update({ status: 'sent', sent_via: sendVia, sent_at: new Date().toISOString() })
      .eq('id', id)

    try {
      await supabaseAdmin.rpc('create_b2c_quote_revision', {
        p_quote_id: id,
        p_changed_by: null,
        p_change_reason: `Sent via ${sendVia}`,
      })
    } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, channel: sendVia })
  } catch (error: any) {
    console.error('Error sending B2C quote:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
