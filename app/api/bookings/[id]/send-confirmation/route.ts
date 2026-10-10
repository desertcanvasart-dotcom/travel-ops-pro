// =====================================================
// POST /api/bookings/[id]/send-confirmation
// Send a booking confirmation to the client via email or WhatsApp.
// Ported from the sibling app (autoura-saas), but ACTUALLY WIRED to ours'
// send infra: email → /api/send-email (Gmail, same path the cron uses),
// WhatsApp → sendWhatsAppMessage (Twilio). Manager+ only.
// body: { send_via?: 'email' | 'whatsapp' }
// =====================================================

import { formatMoney } from '@/lib/currency-totals'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { sendEmailInternal } from '@/lib/email-send'
import { orgIdentity } from '@/lib/org-identity'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The currency's own decimals and separators: "JPY 450000.00" was how a yen
// booking confirmation read.
const money = (v: unknown, currency: string) => {
  const n = Number(v)
  return formatMoney(Number.isFinite(n) ? n : 0, currency)
}
const date = (v: unknown) => {
  if (!v) return 'TBC'
  const d = new Date(v as string)
  return Number.isNaN(d.getTime()) ? 'TBC' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Outward-facing action (messages a customer) — restrict to manager+.
    const denied = await requireRole(['owner', 'admin', 'manager'])
    if (denied) return denied

    const body = await request.json().catch(() => ({}))
    const sendVia: 'email' | 'whatsapp' = body.send_via === 'whatsapp' ? 'whatsapp' : 'email'

    const { data: booking, error } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }

    const currency = booking.currency || 'EUR'
    const travelers = (booking.num_adults || 0) + (booking.num_children || 0)

    if (sendVia === 'email' && !booking.client_email) {
      return NextResponse.json({ success: false, error: 'Client email not found on this booking' }, { status: 400 })
    }
    if (sendVia === 'whatsapp' && !booking.client_phone) {
      return NextResponse.json({ success: false, error: 'Client phone not found on this booking' }, { status: 400 })
    }

    const greeting = `Dear ${booking.client_name || 'Valued Customer'},`
    const lines = [
      greeting,
      '',
      'Thank you for booking with us! Your booking is confirmed.',
      '',
      `Booking Reference: ${booking.booking_code}`,
      `Trip: ${booking.trip_name || ''}`,
      `Dates: ${date(booking.start_date)} – ${date(booking.end_date)}`,
      `Travellers: ${travelers}`,
      `Total: ${money(booking.total_cost, currency)}`,
      `Balance Due: ${money(booking.balance_due, currency)}`,
    ]
    // payment_deadline is the DEPOSIT's due date (lib/booking-creation); it
    // was printed as the date the whole balance was due. While the deposit is
    // unpaid: the deposit, by its date. After: the balance, by balance_due_date.
    if (Number(booking.balance_due) > 0) {
      const depositOwed = !booking.deposit_paid && Number(booking.deposit_amount) > 0
      if (depositOwed) {
        lines.push(`Deposit Due: ${money(booking.deposit_amount, currency)}${booking.payment_deadline ? ` by ${date(booking.payment_deadline)}` : ''}`)
        if (booking.balance_due_date) lines.push(`Balance Due By: ${date(booking.balance_due_date)}`)
      } else if (booking.balance_due_date) {
        lines.push(`Balance Due By: ${date(booking.balance_due_date)}`)
      }
    }
    if (booking.special_requests) {
      lines.push('', `Special Requests: ${booking.special_requests}`)
    }
    // Signed by the organization sending it (Settings), not the platform.
    lines.push('', 'We look forward to welcoming you.', '', 'Best regards,', (await orgIdentity(orgId)).name)
    const messageText = lines.join('\n')

    if (sendVia === 'whatsapp') {
      const result = await sendWhatsAppMessage({ orgId, to: booking.client_phone, body: messageText })
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'WhatsApp send failed' }, { status: 502 })
      }
      return NextResponse.json({ success: true, channel: 'whatsapp', to: booking.client_phone, messageId: result.messageId })
    }

    // Email — same internal path the reminder cron uses (Gmail under the hood).
    const subject = `Booking Confirmation – ${booking.booking_code}`
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;white-space:pre-wrap;line-height:1.6">${
      messageText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</div>`

    const result = await sendEmailInternal({ to: booking.client_email, subject, html, orgId, senderUserId: await getCurrentUserId() })
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Email send failed' }, { status: 502 })
    }

    return NextResponse.json({ success: true, channel: 'email', to: booking.client_email })
  } catch (error: any) {
    console.error('Error sending booking confirmation:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
