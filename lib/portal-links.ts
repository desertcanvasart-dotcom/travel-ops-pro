// ============================================
// Mint / reuse / deliver a per-traveller portal link
// ============================================
// Shared by the operator coordinator (bookings/[id]/portal-link) and the lead
// coordinator inside the portal (portal/[token]/coordinator), so the
// one-live-link-per-(booking,passenger) rule, the expiry and the delivery live
// in ONE place rather than drifting between two surfaces.

import type { SupabaseClient } from '@supabase/supabase-js'
import { generatePortalToken } from '@/lib/booking-portal'
import { sendEmailInternal } from '@/lib/email-send'

type Admin = SupabaseClient<any, any, any, any, any>

/** A link outlives the trip by a month, then stops answering. */
const DAYS_AFTER_DEPARTURE = 30

export function expiryFromStartDate(startDate: string | null | undefined): string | null {
  if (!startDate) return null
  return new Date(
    Date.parse(`${startDate.slice(0, 10)}T23:59:59Z`) + DAYS_AFTER_DEPARTURE * 86_400_000
  ).toISOString()
}

/** The one live link for a (booking, passenger) — reused if it exists, minted
 *  otherwise. passengerId null = the booking-level (family) link. */
export async function mintOrReusePassengerLink(
  admin: Admin,
  opts: { orgId: string; bookingId: string; passengerId: string | null; startDate: string | null | undefined }
): Promise<{ token: string; created: boolean } | { error: string }> {
  const base = admin
    .from('booking_portal_links')
    .select('token')
    .eq('booking_id', opts.bookingId)
    .eq('org_id', opts.orgId)
    .is('revoked_at', null)
  const { data: existing } = await (opts.passengerId
    ? base.eq('passenger_id', opts.passengerId)
    : base.is('passenger_id', null)
  ).maybeSingle()

  if (existing) return { token: existing.token as string, created: false }

  const { data, error } = await admin
    .from('booking_portal_links')
    .insert({
      org_id: opts.orgId,
      booking_id: opts.bookingId,
      passenger_id: opts.passengerId,
      token: generatePortalToken(),
      expires_at: expiryFromStartDate(opts.startDate),
    })
    .select('token')
    .single()
  if (error) return { error: error.message }
  return { token: data.token as string, created: true }
}

/** Stamp a link as sent and best-effort email it. Never throws — a delivery
 *  failure must not fail the caller; the URL can always be copied. */
export async function markSentAndDeliver(
  admin: Admin,
  opts: { token: string; passengerId: string; orgId: string; url: string }
): Promise<{ sent: boolean }> {
  await admin
    .from('booking_portal_links')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('token', opts.token)
    .eq('org_id', opts.orgId)

  const { data: pax } = await admin
    .from('booking_passengers')
    .select('email, first_name')
    .eq('id', opts.passengerId)
    .maybeSingle()
  if (!pax?.email) return { sent: false }

  try {
    await sendEmailInternal({
      to: pax.email,
      subject: 'ご旅行の参加者情報のご登録のお願い',
      html:
        `<p>${pax.first_name ? pax.first_name + ' 様' : 'お客様'}</p>` +
        `<p>ご旅行の参加者情報をご登録ください。下記のリンクからお進みいただけます。</p>` +
        `<p><a href="${opts.url}">${opts.url}</a></p>` +
        `<p>ご本人確認のため、姓と生年月日の入力をお願いいたします。</p>`,
    })
    return { sent: true }
  } catch (e) {
    console.error('Portal link email failed (link still valid):', e)
    return { sent: false }
  }
}
