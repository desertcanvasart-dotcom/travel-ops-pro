// ============================================
// The website's order emails → quotes, with no click
// ============================================
// Operator, 2026-10-02: the ATS website's form "comes as a request" by email;
// every answer must reach "the correct email, the correct program", the
// customer linked to it, and the operation start "as per the existing
// pipeline". The customer never leaves the website — so the email is the
// connection.
//
// After the scheduled Gmail sync stores new mail (app/api/cron/gmail-sync),
// each new inbound message is looked at ONCE (email_messages.order_checked_at):
//
//   not an order               → checked, nothing else (no AI, no cost)
//   an order (lib/intake/tup-mail.ts, or the canonical form document)
//     → claimed in web_order_intakes (unique per message: never twice)
//     → the same customer, code and date already made a quote: 'duplicate',
//       linked to that quote
//     → else the shared pipeline (lib/intake/process-order.ts): programme by
//       website page then code, client by email (found or created), ONE
//       priced draft quote, a pending seat hold on the date's departure
//         - done: 'quote_created', managers notified with the quote
//         - not (unknown programme, a rate hole, an unreadable form):
//           'needs_attention' with the reason, managers notified with a link
//           that opens the order on /intake/order to finish by hand
//
// The conversation is marked 'web_order' for the lead detector
// (lib/email/email-leads.ts): the website's notifications are not a lead
// for the AI to judge — the order made the client already. Per message, not
// per conversation: the notifications share a subject, so Gmail threads
// different customers' orders together.
import type { SupabaseClient } from '@supabase/supabase-js'
import { looksLikeTourUpOrder, parseTourUpOrder, type TourUpOrder } from '@/lib/intake/tour-up-order'
import { emailOrderText } from '@/lib/intake/tup-mail'
import { processTourUpOrder } from '@/lib/intake/process-order'
import { notifyOrgManagers } from '@/lib/notify-managers'
import { orgForMailbox } from '@/lib/email/email-leads'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export type WebOrderOutcome = 'quote_created' | 'needs_attention' | 'duplicate' | 'not_an_order' | 'already_taken' | 'error'

export interface WebOrderResult {
  messageId: string
  outcome: WebOrderOutcome
  intakeId?: string
  quoteId?: string
  reason?: string
}

/** A duplicate is the same customer, code and date within this many days. */
const DUPLICATE_WINDOW_DAYS = 14

/** Where the operator finishes an order the pipeline could not. */
export const intakeLink = (intakeId: string) => `/intake/order?intake=${intakeId}`

const customerName = (o: TourUpOrder) =>
  (o.lead.lastNameKanji || o.lead.firstNameKanji
    ? `${o.lead.lastNameKanji ?? ''} ${o.lead.firstNameKanji ?? ''}`
    : `${o.lead.lastNameRomaji} ${o.lead.firstNameRomaji}`).trim() || null

/**
 * Take in every new inbound message that is a website order. Returns what
 * happened to each order (messages that are not orders are only marked).
 * `process` is injectable for tests.
 */
export async function processNewWebOrders(
  db: Db,
  opts: { limit?: number; process?: typeof processTourUpOrder } = {},
): Promise<WebOrderResult[]> {
  const runPipeline = opts.process ?? processTourUpOrder
  const { data: pending, error } = await db.from('email_messages')
    .select('id, message_id, conversation_id, subject, body_text, body_html, sent_at')
    .is('order_checked_at', null)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: true })
    .limit(opts.limit ?? 50)
  if (error) throw error

  const results: WebOrderResult[] = []
  const orgByConversation = new Map<string, string | null>()

  for (const msg of (pending ?? []) as Array<{
    id: string; message_id: string; conversation_id: string | null; subject: string | null
    body_text: string | null; body_html: string | null; sent_at: string
  }>) {
    const checked = () => db.from('email_messages').update({ order_checked_at: new Date().toISOString() }).eq('id', msg.id)
    try {
      const text = emailOrderText(msg.body_text, msg.body_html)
      if (!looksLikeTourUpOrder(text)) { await checked(); continue }

      // The organisation: the mailbox's.
      let orgId: string | null = null
      if (msg.conversation_id) {
        if (!orgByConversation.has(msg.conversation_id)) {
          const { data: conv } = await db.from('email_conversations').select('user_id').eq('id', msg.conversation_id).maybeSingle()
          orgByConversation.set(msg.conversation_id, await orgForMailbox(db, (conv?.user_id as string | null) ?? null))
        }
        orgId = orgByConversation.get(msg.conversation_id) ?? null
      } else {
        orgId = await orgForMailbox(db, null)
      }
      if (!orgId) {
        // Left unchecked: the next run tries again once the mailbox has an org.
        console.error('[web-order] no organisation for message', msg.id)
        results.push({ messageId: msg.id, outcome: 'error', reason: 'No organisation for this mailbox' })
        continue
      }

      // Not a lead for the AI: the order makes the client.
      if (msg.conversation_id) {
        await db.from('email_conversations')
          .update({ lead_checked_at: new Date().toISOString(), lead_check: 'web_order' })
          .eq('id', msg.conversation_id)
          .is('lead_checked_at', null)
      }

      const order = parseTourUpOrder(text)

      // Claim the message first: a crash after the quote must not make a
      // second one next run — the unique email_message_id refuses it.
      const { data: claim, error: claimErr } = await db.from('web_order_intakes').insert({
        org_id: orgId,
        email_message_id: msg.id,
        conversation_id: msg.conversation_id,
        received_at: msg.sent_at,
        subject: msg.subject,
        outcome: 'needs_attention',
        reason: 'Processing',
        tour_code: order?.tourCode ?? null,
        travel_date: order?.departureDate1 ?? null,
        customer_email: order?.email || null,
        customer_name: order ? customerName(order) : null,
        order_text: text,
        order_data: order,
      }).select('id').single()
      if (claimErr || !claim) {
        // Already taken (a re-run after a partial failure): just mark it.
        await checked()
        results.push({ messageId: msg.id, outcome: 'already_taken' })
        continue
      }
      const intakeId = claim.id as string
      const settle = (patch: Record<string, unknown>) => db.from('web_order_intakes').update(patch).eq('id', intakeId)

      const summary = order
        ? `${order.tourCode} / ${order.departureDate1} / 大人${order.adults}人${order.children ? ` 子供${order.children}人` : ''}${order.infants ? ` 幼児${order.infants}人` : ''} / ${customerName(order) ?? ''} <${order.email}>`
        : (msg.subject ?? '')

      if (!order) {
        const reason = 'The form could not be read (tour code or date missing).'
        await settle({ reason })
        await notifyOrgManagers(db as never, orgId, {
          type: 'order_received',
          title: '要対応のウェブ注文（読み取り不可）',
          message: `ウェブサイトの注文メールを読み取れませんでした。リンク先で確認してください。${summary}`,
          link: intakeLink(intakeId),
        })
        await checked()
        results.push({ messageId: msg.id, outcome: 'needs_attention', intakeId, reason })
        continue
      }

      // The same order sent twice is one order.
      const since = new Date(Date.parse(msg.sent_at) - DUPLICATE_WINDOW_DAYS * 86_400_000).toISOString()
      const { data: earlier } = order.email
        ? await db.from('web_order_intakes')
          .select('id, quote_id, client_id')
          .eq('org_id', orgId)
          .eq('outcome', 'quote_created')
          .eq('tour_code', order.tourCode)
          .eq('travel_date', order.departureDate1)
          .ilike('customer_email', order.email)
          .gte('received_at', since)
          .limit(1)
        : { data: [] }
      const first = (earlier ?? [])[0] as { id: string; quote_id: string | null; client_id: string | null } | undefined
      if (first) {
        await settle({ outcome: 'duplicate', reason: `Same order as intake ${first.id}`, quote_id: first.quote_id, client_id: first.client_id, resolved_at: new Date().toISOString() })
        await checked()
        results.push({ messageId: msg.id, outcome: 'duplicate', intakeId, quoteId: first.quote_id ?? undefined })
        continue
      }

      let result: Awaited<ReturnType<typeof processTourUpOrder>> | null = null
      let thrown: string | null = null
      try {
        result = await runPipeline(db as unknown as SupabaseClient, { orgId, userId: null, order, dryRun: false })
      } catch (e) {
        thrown = e instanceof Error ? e.message : String(e)
        console.error('[web-order] pipeline threw:', e)
      }

      const quote = result?.body.quote
      if (result?.body.success && quote) {
        const client = result.body.client as { id: string } | null | undefined
        await settle({
          outcome: 'quote_created',
          reason: null,
          client_id: client?.id ?? null,
          quote_id: quote.id,
          departure_booking_id: result.body.departureBooking?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        await notifyOrgManagers(db as never, orgId, {
          type: 'order_received',
          title: `ウェブ注文 ${quote.quote_number}: ${order.tourCode}`,
          message: `ウェブサイトの注文メールより自動作成。${summary}`,
          link: `/b2b/quotes/${quote.id}`,
        })
        await checked()
        results.push({ messageId: msg.id, outcome: 'quote_created', intakeId, quoteId: quote.id })
        continue
      }

      const reason = (result?.body.error as string | undefined) ?? thrown ?? 'Internal error'
      await settle({ reason, client_id: (result?.body.client as { id?: string } | null | undefined)?.id ?? null })
      await notifyOrgManagers(db as never, orgId, {
        type: 'order_received',
        title: `要対応のウェブ注文: ${order.tourCode}`,
        message: `自動処理できませんでした（${reason}）。リンク先で内容を確認し、取り込んでください。${summary}`,
        link: intakeLink(intakeId),
      })
      await checked()
      results.push({ messageId: msg.id, outcome: 'needs_attention', intakeId, reason })
    } catch (e) {
      // Left unchecked: retried next run (the claim keeps it from doubling).
      console.error('[web-order] message', msg.id, e)
      results.push({ messageId: msg.id, outcome: 'error', reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return results
}
