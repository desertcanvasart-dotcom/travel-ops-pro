// ============================================
// WhatsApp delivery status — only ever forward
// ============================================
// Twilio posts each status of a message (queued → sent → delivered → read,
// or failed / undelivered) and does not promise the order they arrive in. The
// callback overwrote the stored status with whatever came last, so a late
// "sent" turned a "read" back into "sent". It also refused "undelivered" —
// the commonest WhatsApp failure — with a CHECK violation, leaving the
// message at "sent" as if it had arrived.

const RANK: Record<string, number> = {
  queued: 0,
  accepted: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  // Terminal failures outrank anything short of "read": a message the
  // customer read was delivered, whatever a straggler says.
  undelivered: 5,
  failed: 5,
}

export const KNOWN_WHATSAPP_STATUSES = Object.keys(RANK)

/** The stored statuses a callback reporting `next` may replace. Empty for a
 *  status we do not track (e.g. "receiving", "canceled"). */
export function statusesBelow(next: string): string[] {
  const r = RANK[next]
  if (r === undefined) return []
  if (r === 5) return KNOWN_WHATSAPP_STATUSES.filter(s => RANK[s] < 4)
  return KNOWN_WHATSAPP_STATUSES.filter(s => RANK[s] < r)
}
