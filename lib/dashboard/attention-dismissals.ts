// ============================================
// Needs attention, dismissed — "seen it, handled elsewhere"
// ============================================
// An operator can dismiss a row (migration 20261108). The dismissal is
// remembered with a fingerprint of the state it was made in and holds only
// while that state does: when the situation changes the row comes back,
// because that is new news. The clock alone (how long a customer has waited)
// never brings one back. Ported from autoura-saas (#574). Pure, client-safe.

export interface DismissableItem {
  type: string
  /** Empty for an item that is not about a booking (reply_overdue). */
  bookingId: string
  detail: Record<string, unknown>
  href: string
}

export interface AttentionDismissal {
  item_key: string
  fingerprint: string
}

export const MAX_KEY = 500
export const MAX_FINGERPRINT = 2000

/** Detail fields the clock moves by itself: "5h" becomes "6h" with nothing new. */
const CLOCK_FIELDS = new Set(['waiting', 'hours'])

/** Which item this is, stable across reloads: its kind and the record it is
 *  about. A booking can carry several requests, so those add when they were
 *  made (and an extra its title); a waiting email is its conversation. */
export function attentionKey(item: DismissableItem): string {
  const d = item.detail ?? {}
  const parts: string[] = [item.type, item.bookingId]
  if (item.type === 'reply_overdue') parts.push(String(d.conversationId ?? ''))
  if (item.type === 'change_request' || item.type === 'extra_request') parts.push(String(d.requestedAt ?? ''))
  if (item.type === 'extra_request') parts.push(String(d.title ?? ''))
  if (item.type === 'no_guide') parts.push(item.href)
  return parts.join(':').slice(0, MAX_KEY)
}

/** The state the item is in, minus what the clock changes. Keys sorted, so
 *  the same state always reads the same wherever it is computed. */
export function attentionFingerprint(item: DismissableItem): string {
  const d = item.detail ?? {}
  const kept = Object.keys(d)
    .filter(k => !CLOCK_FIELDS.has(k))
    .sort()
    .map(k => [k, d[k] ?? null])
  return JSON.stringify(kept).slice(0, MAX_FINGERPRINT)
}

/** Drops the items dismissed in their current state; a dismissal made in a
 *  state that no longer holds is ignored, so the item shows again. */
export function withoutDismissed<T extends DismissableItem>(
  items: T[],
  dismissals: readonly AttentionDismissal[],
): { items: T[]; dismissed: number } {
  if (dismissals.length === 0) return { items, dismissed: 0 }
  const held = new Map(dismissals.map(r => [r.item_key, r.fingerprint]))
  const kept = items.filter(i => held.get(attentionKey(i)) !== attentionFingerprint(i))
  return { items: kept, dismissed: items.length - kept.length }
}
