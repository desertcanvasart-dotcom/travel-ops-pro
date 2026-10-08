// ============================================
// Telling the traveller the office replied in the trip chat
// ============================================
// The traveller is not sitting on their trip page waiting. When the office
// replies in the trip chat (the trip page's Messages tab or the unified
// inbox, both through /api/itineraries/[id]/messages), the traveller gets an
// email saying a reply is waiting, with the link to read it — the trip's
// share link.
//
// Like the booking portal's reply email (lib/portal/chat-reply.ts), it does
// NOT quote the reply: the conversation may concern a passport or a payment,
// and email is the less private channel. It is written in the client's
// language (Japanese unless their record says English).
//
// Never throws: the reply is already stored, and a mail failure must not
// lose it. Each outcome is a different thing for the operator to do:
//
//   sent          the traveller was emailed
//   no-recipient  the itinerary has no client email   → add one
//   no-link       the trip has no live share link     → create one
//   no-account    no Gmail is connected               → connect one
//   failed        Gmail was asked and refused

import type { SendEmailInternalResult } from '@/lib/email-send'
import { splitTourCode } from '@/lib/itineraries/content-language'

export type TripNotifyTravellerOutcome = 'sent' | 'no-recipient' | 'no-link' | 'no-account' | 'failed'

export type MailLanguage = 'en' | 'ja'

export interface TripReplyEmailInput {
  language: MailLanguage
  clientName: string | null
  tripName: string | null
  itineraryCode: string | null
  agency: string | null
  url: string
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The email: who replied about which trip, and where to read it. Pure, so tested. */
export function tripReplyEmail(m: TripReplyEmailInput): { subject: string; html: string } {
  const trip = m.tripName?.trim() || null
  const url = escapeHtml(m.url)
  const agency = m.agency?.trim() ? escapeHtml(m.agency.trim()) : null
  if (m.language === 'ja') {
    return {
      subject: `【${trip || 'ご旅行'}】担当者からのご返信`,
      html: `
        <p>${escapeHtml(m.clientName?.trim() || 'お客様')} 様</p>
        <p>${trip ? `「${escapeHtml(trip)}」について、` : ''}担当者よりメッセージにご返信いたしました。下記のページよりご確認ください。</p>
        <p><a href="${url}">${url}</a></p>
        ${m.itineraryCode ? `<p>旅程番号：${escapeHtml(m.itineraryCode)}</p>` : ''}
        ${agency ? `<p>${agency}</p>` : ''}
      `,
    }
  }
  return {
    subject: `${trip || 'Your trip'}: a reply from your travel team`,
    html: `
      <p>Dear ${escapeHtml(m.clientName?.trim() || 'traveller')},</p>
      <p>We have replied to your message${trip ? ` about ${escapeHtml(trip)}` : ''}. You can read it on your trip page:</p>
      <p><a href="${url}">${url}</a></p>
      ${m.itineraryCode ? `<p>Reference: ${escapeHtml(m.itineraryCode)}</p>` : ''}
      ${agency ? `<p>${agency}</p>` : ''}
    `,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export interface NotifyTravellerDeps {
  mail: (input: { to: string; subject: string; html: string }) => Promise<SendEmailInternalResult>
}

const liveDeps = (): NotifyTravellerDeps => ({
  // Loaded on use: lib/email-send makes its database client at import.
  mail: async input => (await import('@/lib/email-send')).sendEmailInternal(input),
})

const toLanguage = (v: string | null | undefined): MailLanguage => {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'en' || s.startsWith('english') || s === '英語' ? 'en' : 'ja'
}

/**
 * Email the trip's client that a reply is waiting. The itinerary must already
 * be proven to belong to `orgId` by the caller.
 */
export async function notifyTravellerOfTripReply(
  db: Db,
  args: { itineraryId: string; orgId: string; appUrl?: string },
  deps: NotifyTravellerDeps = liveDeps()
): Promise<TripNotifyTravellerOutcome> {
  try {
    const { data: trip } = await db
      .from('itineraries')
      .select('itinerary_code, trip_name, client_name, client_email, client_id')
      .eq('id', args.itineraryId)
      .eq('org_id', args.orgId)
      .maybeSingle()
    const to = trip?.client_email?.trim()
    if (!to) return 'no-recipient'

    // The newest live share link: the page that holds the conversation.
    const { data: share } = await db
      .from('itinerary_shares')
      .select('token')
      .eq('itinerary_id', args.itineraryId)
      .eq('org_id', args.orgId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!share?.token) return 'no-link'

    const [{ data: client }, { data: org }] = await Promise.all([
      trip.client_id
        ? db.from('clients').select('preferred_language').eq('id', trip.client_id).eq('org_id', args.orgId).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from('organizations').select('name').eq('id', args.orgId).maybeSingle(),
    ])

    const base = (args.appUrl || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const email = tripReplyEmail({
      language: toLanguage(client?.preferred_language),
      clientName: trip.client_name,
      // The client's title, without the programme code the office prefixes.
      tripName: splitTourCode(trip.trip_name).title || null,
      itineraryCode: trip.itinerary_code,
      agency: org?.name ?? null,
      url: `${base}/share/${share.token}`,
    })
    const result = await deps.mail({ to, ...email })
    if (result?.success) return 'sent'
    return result?.noAccount ? 'no-account' : 'failed'
  } catch (err) {
    console.warn('[trip-chat] reply email failed:', err)
    return 'failed'
  }
}
