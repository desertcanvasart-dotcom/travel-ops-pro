// POST /api/portal/[token]/verify — the confirmation gate's one endpoint.
//
// The visitor states one fact the traveller knows (booking number, or the
// lead traveller's family name in any script). A match sets the verification
// cookie; the cookie is an HMAC over the token with a server-side secret, so
// it cannot be forged from the URL alone. Failures are uniform and rate
// limited — this endpoint must not become an oracle for guessing names.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isValidPortalToken,
  portalLinkState,
  portalVerifyCookieName,
  portalVerifyCookieValue,
  verifyAnswerMatches,
} from '@/lib/booking-portal'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FAIL = NextResponse.json(
  // One uniform failure body: not-found, revoked, and wrong-answer are
  // indistinguishable from outside.
  { success: false, error: '入力内容が予約情報と一致しません。' },
  { status: 403 }
)

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!isValidPortalToken(token)) return FAIL

    // Tighter than the general portal limit: 10 guesses a minute per client.
    const limit = checkRateLimit(`${getClientIdentifier(request)}:${token.slice(0, 8)}`, 'auth')
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => ({}))
    const answer = body?.answer

    const { data: link } = await supabase
      .from('booking_portal_links')
      .select('id, booking_id, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle()
    if (!link || !portalLinkState(link).usable) return FAIL

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, booking_code, client_name')
      .eq('id', link.booking_id)
      .maybeSingle()
    if (!booking) return FAIL

    const { data: lead } = await supabase
      .from('booking_passengers')
      .select('last_name, family_name_kanji, family_name_kana')
      .eq('booking_id', booking.id)
      .eq('is_lead_passenger', true)
      .maybeSingle()

    const ok = verifyAnswerMatches(answer, {
      booking_code: booking.booking_code,
      client_name: booking.client_name,
      lead_names: lead ? [lead.last_name, lead.family_name_kanji, lead.family_name_kana] : [],
    })
    if (!ok) return FAIL

    const res = NextResponse.json({ success: true })
    res.cookies.set(portalVerifyCookieName(token), portalVerifyCookieValue(token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // The link itself expires around departure + 30 days; the cookie need
      // not outlive a typical planning window.
      maxAge: 60 * 60 * 24 * 60,
    })
    return res
  } catch {
    return FAIL
  }
}
