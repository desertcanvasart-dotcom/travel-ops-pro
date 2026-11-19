// ============================================================================
// Numbers a company blocked on WhatsApp (migration 20270120)
// ============================================================================
// A message from a blocked number is not stored: no conversation, no message,
// no unread count, no Copilot draft, no auto-reply (app/api/whatsapp/webhook).
// The block row keeps only a count and the time of the last ignored message,
// never what was said, so a manager can see the block is working.
//
// Per company: one company's block never touches another's inbox.
//
// Inside the app only: the sender's WhatsApp still delivers to the number.
// Twilio has no way to block a sender. Ported from autoura-saas #816.

import { toWhatsAppE164, PHONE_NEEDS_COUNTRY_CODE } from './whatsapp-phone'

export interface BlockedNumber {
  id: string
  phone_number: string
  reason: string | null
  blocked_by: string | null
  blocked_message_count: number
  last_blocked_at: string | null
  created_at: string
}

/** Who may block and unblock (everyone in the company sees the list). */
export const BLOCK_ROLES = ['admin', 'manager'] as const

/** A number a manager may block: E.164, else refused saying why. */
export function checkBlockNumber(raw: unknown):
  | { ok: true; number: string }
  | { ok: false; error: string } {
  const number = toWhatsAppE164(raw)
  if (!number) return { ok: false, error: PHONE_NEEDS_COUNTRY_CODE }
  return { ok: true, number }
}

/** The block (if any) for this number in a list the page already holds. */
export function findBlocked<T extends { phone_number: string }>(list: readonly T[], phone: unknown): T | null {
  const number = toWhatsAppE164(phone)
  if (!number) return null
  return list.find(b => b.phone_number === number) ?? null
}

/** Postgres "no such table" and PostgREST "table not in the schema cache". */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

// The service client's shape, as far as the webhook's check needs it.
export interface BlockedReader {
  from(table: 'whatsapp_blocked_numbers'): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>
        }
      }
    }
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>
    }
  }
}

/**
 * Whether the company blocked this sender. When it did, the ignored message
 * is counted on the block row (best-effort: a failed count still blocks).
 * A failed lookup throws: the webhook asks Twilio to deliver again rather
 * than file a message that may be from a blocked number.
 */
export async function inboundIsBlocked(db: BlockedReader, orgId: string, phone: unknown): Promise<boolean> {
  const number = toWhatsAppE164(phone)
  if (!number) return false
  const { data, error } = await db
    .from('whatsapp_blocked_numbers')
    .select('id, blocked_message_count')
    .eq('org_id', orgId)
    .eq('phone_number', number)
    .maybeSingle()
  if (error) {
    // The table not there yet (the code went out before migration 20270120):
    // nothing can be blocked, and every message must still be filed. Refusing
    // them would have Twilio redeliver every customer message for hours.
    if (error.code && MISSING_TABLE.has(error.code)) return false
    throw new Error(`blocked-number lookup: ${error.message}`)
  }
  const row = data as { id?: string; blocked_message_count?: number | null } | null
  if (!row?.id) return false
  try {
    const { error: countError } = await db
      .from('whatsapp_blocked_numbers')
      .update({ blocked_message_count: (row.blocked_message_count ?? 0) + 1, last_blocked_at: new Date().toISOString() })
      .eq('id', row.id)
    if (countError) console.error('Blocked WhatsApp count not recorded:', countError.message)
  } catch (e) {
    console.error('Blocked WhatsApp count not recorded:', (e as Error).message)
  }
  return true
}
