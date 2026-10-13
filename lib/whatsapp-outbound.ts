// ============================================
// Filing a WhatsApp message we sent in its conversation
// ============================================
// The inbox reply (/api/whatsapp/messages POST) files what it sends in the
// org's thread for that number. A send from elsewhere — the Templates page —
// went out through Twilio and was filed nowhere, so the conversation never
// showed it and the next person to reply could not see it had been said.
// This does what the inbox reply does: find (or open) the org's thread for the
// number, keyed (org_id, phone_number) like the webhook, and add the message.

import { toWhatsAppE164 } from '@/lib/whatsapp-phone'

export interface OutboundWhatsApp {
  orgId: string
  phone: string
  body: string
  messageSid?: string | null
  /** Link a newly opened thread to this client, as the webhook does. */
  clientId?: string | null
}

// The few query shapes used here; the service-role client satisfies them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Returns the conversation id, or null when the message could not be filed. */
export async function recordOutboundWhatsApp(db: Db, msg: OutboundWhatsApp): Promise<string | null> {
  const phone = toWhatsAppE164(msg.phone)
  if (!phone) return null

  const { data: existing, error: lookupError } = await db
    .from('whatsapp_conversations')
    .select('id')
    .eq('org_id', msg.orgId)
    .eq('phone_number', phone)
    .maybeSingle()
  if (lookupError) return null

  let conversationId: string | null = existing?.id ?? null
  if (!conversationId) {
    const { data: created, error: createError } = await db
      .from('whatsapp_conversations')
      .insert({ org_id: msg.orgId, phone_number: phone, client_id: msg.clientId ?? null, status: 'active' })
      .select('id')
      .single()
    if (createError || !created) return null
    conversationId = created.id
  }

  const { error } = await db.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    message_sid: msg.messageSid ?? null,
    direction: 'outbound',
    message_body: msg.body,
    status: 'sent',
    sent_at: new Date().toISOString(),
  })
  return error ? null : conversationId
}
