// ============================================
// Unread messages per channel — one definition
// ============================================
// The dashboard's "unread" figures (app/api/dashboard/summary) and the
// sidebar's Email and WhatsApp badges (app/api/unified/unread-counts) both
// count here, so the two numbers cannot disagree. Straight from the
// conversation tables: this company's rows, hidden (deleted) ones left out,
// and for email only the addresses still connected (lib/email/connected-
// mailboxes).

import type { createServerClient } from '@/lib/supabase-server'
import { scopedToConnectedMailboxes } from '@/lib/email/connected-mailboxes'

type Client = ReturnType<typeof createServerClient>

export function unreadWhatsAppRows(supabase: Client, orgId: string) {
  return supabase.from('whatsapp_conversations')
    .select('unread_count')
    .eq('org_id', orgId)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .gt('unread_count', 0)
}

export function unreadEmailRows(supabase: Client, orgId: string) {
  return scopedToConnectedMailboxes(supabase, orgId, (mailboxFilter) => {
    return supabase.from('email_conversations')
      .select('unread_count')
      .eq('org_id', orgId)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .gt('unread_count', 0)
      .or(mailboxFilter)
  })
}

export const sumUnread = (rows: { unread_count: number | null }[] | null) =>
  (rows || []).reduce((s, r) => s + (r.unread_count || 0), 0)
