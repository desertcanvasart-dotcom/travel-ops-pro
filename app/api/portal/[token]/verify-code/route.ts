// POST /api/portal/[token]/verify-code — "send me a new code" on the gate of a
// per-traveller link. The code goes ONLY to the traveller's own email on
// file, never back in the response: the lead coordinator can open the gate
// but cannot receive it. The answer is the same whether or not a code went
// out, so it tells a visitor nothing about the booking.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidPortalToken, portalLinkState } from '@/lib/booking-portal'
import { issueVerifyCode, RESEND_CODE_TTL_MS, RESEND_COOLDOWN_MS, codeEmailHtml } from '@/lib/portal/verify-code'
import { sendEmailInternal } from '@/lib/email-send'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DONE = () => NextResponse.json({
  success: true,
  message: 'ご登録のメールアドレスに確認コードをお送りしました。届かない場合は担当者までご連絡ください。',
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isValidPortalToken(token)) return DONE()

  // Same tight bucket as the gate itself: each send is an email.
  const limit = checkRateLimit(`${getClientIdentifier(request)}:code:${token.slice(0, 8)}`, 'auth')
  if (!limit.success) return rateLimitResponse(limit)

  const { data: link } = await supabase
    .from('booking_portal_links')
    .select('org_id, booking_id, passenger_id, revoked_at, expires_at, verify_code_issued_at')
    .eq('token', token)
    .maybeSingle()
  if (!link || !portalLinkState(link).usable || !link.passenger_id) return DONE()

  const { data: pax } = await supabase
    .from('booking_passengers')
    .select('email, first_name')
    .eq('id', link.passenger_id)
    .eq('booking_id', link.booking_id)
    .maybeSingle()
  const to = pax?.email?.trim()
  if (!to) return DONE()

  // One code a minute per link: each is an email in the traveller's inbox, and
  // each new code is five more guesses for whoever is pressing the button.
  const issuedAt = link.verify_code_issued_at ? Date.parse(link.verify_code_issued_at) : 0
  if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) return DONE()

  const code = await issueVerifyCode(supabase, token, RESEND_CODE_TTL_MS)
  if (!code) return NextResponse.json({ success: false, error: '確認コードを発行できませんでした。' }, { status: 500 })

  const result = await sendEmailInternal({
    orgId: link.org_id,
    to,
    subject: 'ご本人確認コードのお知らせ',
    html: `<p>${pax?.first_name ? pax.first_name + ' 様' : 'お客様'}</p>` +
      `<p>参加者情報ページのご本人確認コードをお送りします。</p>` +
      codeEmailHtml(code, '30分間'),
  }).catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
  if (!result.success) {
    console.error('Portal verify code email failed:', result.error)
    return NextResponse.json({ success: false, error: 'メールを送信できませんでした。担当者までご連絡ください。' }, { status: 502 })
  }
  return DONE()
}
