// ============================================
// Who a "Reply all" goes to
// ============================================
// Gmail's rule: To is whoever wrote the message (or, for a message the office
// sent, whoever it went to); Cc is everyone else it was addressed or copied
// to. The office's own addresses are never on it — the reply would come back
// to the inbox it was sent from — and nobody is on it twice.

import { parseRecipients, addressesOf } from '@/lib/email/compose-mime'

export interface ReplyAllSource {
  from: string
  to?: string | null
  cc?: string | null
}

export function replyAllRecipients(
  message: ReplyAllSource,
  ownAddresses: string[]
): { to: string[]; cc: string[] } {
  const own = new Set(ownAddresses.filter(Boolean).map(a => a.trim().toLowerCase()))
  const isOwn = (entry: string) => own.has(addressesOf([entry])[0])

  const sender = parseRecipients(message.from).list
  const addressed = parseRecipients(message.to ?? '').list
  const copied = parseRecipients(message.cc ?? '').list

  // A message the office sent: reply to the people it went to.
  const fromMe = sender.length > 0 && sender.every(isOwn)
  const to = (fromMe ? addressed : sender).filter(e => !isOwn(e))

  const taken = new Set(addressesOf(to))
  const cc: string[] = []
  for (const entry of [...(fromMe ? [] : addressed), ...copied]) {
    const key = addressesOf([entry])[0]
    if (isOwn(entry) || taken.has(key)) continue
    taken.add(key)
    cc.push(entry)
  }
  return { to, cc }
}
