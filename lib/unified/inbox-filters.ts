// ============================================
// Unified inbox: what the filters mean for each channel
// ============================================
// Portal threads and trip chats have no status and no assignee — they are
// always "active" and nobody's. So they belong in "All statuses" and
// "Active", never in "Archived" or "Spam", and never under "Unassigned"
// (the list deliberately shows no Unassigned chip on them either). They
// used to be listed whatever the status or Unassigned filter said. Pure, so
// tested.

import type { ConversationChannel, UnifiedConversation } from '@/types/unified'

/** Whether portal and trip conversations pass the status / Unassigned filters. */
export function bookingThreadsPassFilters(f: { status: string; unassignedOnly: boolean }): boolean {
  if (f.unassignedOnly) return false
  return f.status === 'all' || f.status === 'active'
}

export type ChannelCounts = Record<ConversationChannel | 'all', number>

/**
 * How many conversations each channel tab holds under the current search and
 * filters — counted before the channel tab narrows the list, so choosing
 * "Email" no longer shows 0 on every other tab.
 */
export function channelCounts(conversations: Pick<UnifiedConversation, 'channel'>[]): ChannelCounts {
  const counts: ChannelCounts = { all: conversations.length, whatsapp: 0, email: 0, portal: 0, trip: 0 }
  for (const c of conversations) counts[c.channel] = (counts[c.channel] ?? 0) + 1
  return counts
}
