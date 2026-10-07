// ============================================
// Trip chats as inbox conversations
// ============================================
// trip_messages has no thread table: a trip's chat IS its messages. The
// unified inbox lists one conversation per itinerary, built from the org's
// newest messages (newest first): the latest message, when the thread began
// within that window, how many traveller messages nobody has read, and the
// name the traveller gave. Pure, so tested.

export interface TripMessageRow {
  itinerary_id: string
  direction: string
  content: string | null
  sender_name: string | null
  is_read: boolean | null
  created_at: string
}

export interface TripThread {
  itineraryId: string
  lastContent: string | null
  lastAt: string
  firstAt: string
  unread: number
  /** The name the traveller typed, if they gave one. */
  traveller: string | null
}

/** Rows must be newest first, as the inbox reads them. */
export function tripThreads(rows: TripMessageRow[]): TripThread[] {
  const threads = new Map<string, TripThread>()
  for (const m of rows) {
    const unread = m.direction === 'inbound' && !m.is_read ? 1 : 0
    const t = threads.get(m.itinerary_id)
    if (!t) {
      threads.set(m.itinerary_id, {
        itineraryId: m.itinerary_id,
        lastContent: m.content,
        lastAt: m.created_at,
        firstAt: m.created_at,
        unread,
        traveller: m.direction === 'inbound' ? m.sender_name : null,
      })
    } else {
      t.firstAt = m.created_at
      t.unread += unread
      if (!t.traveller && m.direction === 'inbound') t.traveller = m.sender_name
    }
  }
  return [...threads.values()]
}
