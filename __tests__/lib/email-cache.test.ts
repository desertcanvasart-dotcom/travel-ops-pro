// The browser's email cache (lib/email-cache, IndexedDB). Operator,
// 2026-10-15: Refresh showed emails from October 5th, then they vanished,
// again on every Refresh — the cache only ever added, so a message that had
// left the inbox stayed cached and came back with each cached render.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'

// The module skips IndexedDB on the server (no window).
;(globalThis as unknown as { window: unknown }).window = globalThis

const mail = (id: string, date: string) => ({
  id, threadId: id, userId: 'u1', folder: 'inbox', snippet: '', from: 'a@b.c', to: 'yoyaku@ats-hj.com',
  subject: id, date, labelIds: ['INBOX'], isUnread: false, isStarred: false, cachedAt: 0,
})

let cache: typeof import('@/lib/email-cache')
beforeAll(async () => {
  cache = await import('@/lib/email-cache')
  await cache.initEmailCache()
})

describe('cacheEmails', () => {
  it('a fresh list replaces the folder: what left the inbox leaves the cache', async () => {
    await cache.cacheEmails('u1', 'inbox', [mail('oct5-a', '2026-10-05'), mail('oct5-b', '2026-10-05'), mail('keep', '2026-10-14')])
    await cache.cacheEmails('u1', 'inbox', [mail('keep', '2026-10-14'), mail('new', '2026-10-15')])

    const { emails } = await cache.getCachedEmails('u1', 'inbox')
    expect(emails.map(e => e.id)).toEqual(['new', 'keep'])
  })

  it('an empty fresh list empties the folder', async () => {
    await cache.cacheEmails('u1', 'inbox', [])
    expect((await cache.getCachedEmails('u1', 'inbox')).emails).toEqual([])
  })

  it("another folder and another user's cache are untouched", async () => {
    await cache.cacheEmails('u1', 'sent', [mail('s1', '2026-10-10')].map(m => ({ ...m, folder: 'sent' })))
    await cache.cacheEmails('u2', 'inbox', [mail('u2-1', '2026-10-10')].map(m => ({ ...m, userId: 'u2' })))
    await cache.cacheEmails('u1', 'inbox', [mail('x', '2026-10-15')])

    expect((await cache.getCachedEmails('u1', 'sent')).emails.map(e => e.id)).toEqual(['s1'])
    expect((await cache.getCachedEmails('u2', 'inbox')).emails.map(e => e.id)).toEqual(['u2-1'])
  })
})
