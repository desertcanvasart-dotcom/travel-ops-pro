// Trip chats in the unified inbox: one conversation per trip
// (lib/unified/trip-threads.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tripThreads } from '@/lib/unified/trip-threads'

const row = (itinerary_id: string, direction: string, created_at: string, over: Record<string, unknown> = {}) => ({
  itinerary_id, direction, created_at, content: `${direction} ${created_at}`, sender_name: null, is_read: direction === 'outbound', ...over,
})

describe('tripThreads', () => {
  it('one conversation per trip: its latest message, when it began, unread traveller messages, the name they gave', () => {
    const threads = tripThreads([
      row('a', 'outbound', '2026-10-08T12:00:00Z', { sender_name: 'Adham' }),
      row('b', 'inbound', '2026-10-08T11:00:00Z', { sender_name: 'Taro' }),
      row('a', 'inbound', '2026-10-08T10:00:00Z', { sender_name: 'Hanako', is_read: false }),
      row('a', 'inbound', '2026-10-08T09:00:00Z', { sender_name: 'Hanako S.', is_read: false }),
      row('a', 'inbound', '2026-10-08T08:00:00Z', { is_read: true }),
    ])
    expect(threads).toEqual([
      { itineraryId: 'a', lastContent: 'outbound 2026-10-08T12:00:00Z', lastAt: '2026-10-08T12:00:00Z', firstAt: '2026-10-08T08:00:00Z', unread: 2, traveller: 'Hanako' },
      { itineraryId: 'b', lastContent: 'inbound 2026-10-08T11:00:00Z', lastAt: '2026-10-08T11:00:00Z', firstAt: '2026-10-08T11:00:00Z', unread: 1, traveller: 'Taro' },
    ])
  })

  it('nothing written, no conversations', () => {
    expect(tripThreads([])).toEqual([])
  })
})

describe('the inbox reads trip chats within the org', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/unified/conversations/route.ts'), 'utf8')
  const trip = src.slice(src.indexOf('const tripTask'), src.indexOf('const emailTask'))
  it('both reads are scoped to the current org (the client is service-role)', () => {
    expect(trip).toMatch(/from\('trip_messages'\)[\s\S]*?\.eq\('org_id', orgId\)/)
    expect(trip).toMatch(/from\('itineraries'\)[\s\S]*?\.eq\('org_id', orgId\)/)
  })
})
