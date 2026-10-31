// Inbox vs Gmail, round 3 (operator, 2026-10-15): rules, print, unsubscribe,
// report spam, folder colours, select all across pages.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { setMockTables, createMockClient } from '../_mock-supabase'
import { ruleMatches, cleanActions, cleanConditions, labelChange, gmailQuery, applyRulesToNewMail } from '@/lib/email/rules'
import { parseListUnsubscribe } from '@/lib/email/list-unsubscribe'
import { printDocumentHtml } from '@/lib/email/print-email'
import { paletteColor } from '@/lib/email/label-colors'

const msg = (over: Partial<{ from: string; to: string[]; cc: string[]; subject: string; text: string }> = {}) => ({
  from: 'Booking.com <noreply@booking.com>', to: ['yoyaku@ats-hj.com'], cc: [], subject: 'Reservation confirmed', text: 'Your stay in Luxor', ...over,
})

describe('rules: matching', () => {
  it('every condition given must match, case-insensitively', () => {
    expect(ruleMatches({ from: '@BOOKING.com', subject: 'confirmed' }, msg())).toBe(true)
    expect(ruleMatches({ from: '@booking.com', subject: 'cancelled' }, msg())).toBe(false)
  })
  it('"to" also looks at Cc; "has the words" needs every word, in subject or text', () => {
    expect(ruleMatches({ to: 'agent@hisgo.jp' }, msg({ cc: ['Agent <agent@hisgo.jp>'] }))).toBe(true)
    expect(ruleMatches({ has_words: 'luxor stay' }, msg())).toBe(true)
    expect(ruleMatches({ has_words: 'luxor aswan' }, msg())).toBe(false)
  })
  it('a rule needs a condition and an action; trash beats spam; folders are made ones only', () => {
    expect(cleanConditions({ from: '  ' })).toBeNull()
    expect(cleanActions({})).toBeNull()
    expect(cleanActions({ trash: true, spam: true })).toEqual({ trash: true })
    expect(cleanActions({ label_id: 'INBOX', star: true })).toEqual({ star: true })
  })
  it('actions become one Gmail label change', () => {
    expect(labelChange({ label_id: 'Label_3', skip_inbox: true, mark_read: true, star: true })).toEqual({
      add: ['Label_3', 'STARRED'], remove: ['INBOX', 'UNREAD'],
    })
  })
  it('the same conditions as a Gmail search (apply to existing)', () => {
    expect(gmailQuery({ from: '@booking.com', subject: 'Reservation confirmed', has_words: 'luxor' }))
      .toBe('from:@booking.com subject:"Reservation confirmed" luxor')
  })
})

describe('rules: new mail after a sync', () => {
  const modify = vi.fn(async (_p: unknown) => ({}))
  const trash = vi.fn(async (_p: unknown) => ({}))
  let tables: Record<string, Record<string, unknown>[]>
  beforeEach(() => {
    modify.mockClear(); trash.mockClear()
    tables = {
      email_messages: [
        { id: 'e1', message_id: 'g1', conversation_id: 'c1', direction: 'inbound', rules_checked_at: null, from_address: 'noreply@booking.com', to_addresses: ['yoyaku@ats-hj.com'], cc_addresses: [], subject: 'Reservation confirmed', body_text: 'Luxor', sent_at: '2026-10-15T01:00:00Z' },
        { id: 'e2', message_id: 'g2', conversation_id: 'c1', direction: 'inbound', rules_checked_at: null, from_address: 'aiko@example.jp', to_addresses: [], cc_addresses: [], subject: 'Question', body_text: '', sent_at: '2026-10-15T02:00:00Z' },
        { id: 'e3', message_id: 'g3', conversation_id: 'c1', direction: 'outbound', rules_checked_at: null, from_address: 'yoyaku@ats-hj.com', subject: 'x', sent_at: '2026-10-15T03:00:00Z' },
      ],
      email_conversations: [{ id: 'c1', user_id: 'mb' }],
      email_rules: [
        { id: 'r1', org_id: 'org', enabled: true, applied_count: 0, conditions: { from: '@booking.com' }, actions: { label_id: 'Label_3', skip_inbox: true } },
        { id: 'r2', org_id: 'org', enabled: false, applied_count: 0, conditions: { from: 'aiko' }, actions: { trash: true } },
      ],
    }
    setMockTables(tables)
  })

  it('files matching inbound mail once; disabled rules and outbound mail are left alone', async () => {
    const out = await applyRulesToNewMail({
      db: createMockClient(), orgForMailbox: async () => 'org',
      gmailFor: async () => ({ users: { messages: { modify, trash } } }),
    })
    expect(out).toEqual({ checked: 2, applied: 1, errors: 0 })
    expect(modify).toHaveBeenCalledWith({ userId: 'me', id: 'g1', requestBody: { addLabelIds: ['Label_3'], removeLabelIds: ['INBOX'] } })
    expect(trash).not.toHaveBeenCalled()
    expect(tables.email_messages[0].rules_checked_at).toBeTruthy()
    expect(tables.email_messages[2].rules_checked_at).toBeNull()
    expect(tables.email_rules[0].applied_count).toBe(1)
  })
})

describe('unsubscribe', () => {
  it('takes the https link, or the mailto with its subject', () => {
    expect(parseListUnsubscribe('<mailto:leave@news.example.com?subject=stop>, <https://news.example.com/u/123>'))
      .toEqual({ url: 'https://news.example.com/u/123', mailto: { to: 'leave@news.example.com', subject: 'stop', body: 'unsubscribe' } })
  })
  it('ignores http, javascript and junk', () => {
    expect(parseListUnsubscribe('<http://x.example.com/u>, <javascript:alert(1)>')).toBeNull()
    expect(parseListUnsubscribe('')).toBeNull()
  })
})

describe('print', () => {
  it('escapes the headers, blocks scripts, and keeps the (already sanitised) body', () => {
    const html = printDocumentHtml('<b>Hi</b>', [{ from: 'A <a@b.co>', to: 'x@y.z', date: 'today', bodyHtml: '<p>Body</p>' }])
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;')
    expect(html).toContain('From:</b> A &lt;a@b.co&gt;')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('<p>Body</p>')
  })
})

describe('folder colours', () => {
  it("only Gmail's palette", () => {
    expect(paletteColor('#4A86E8', '#ffffff')).toEqual({ backgroundColor: '#4a86e8', textColor: '#ffffff' })
    expect(paletteColor('#123456', '#ffffff')).toBeUndefined()
    expect(paletteColor(null, null)).toBeNull()
  })
})

describe('the inbox page', () => {
  const page = readFileSync('app/inbox/_views/EmailView.tsx', 'utf8')
  it('has Report spam, Print, Unsubscribe, folder colours, select-all-matching and Rules', () => {
    expect(page).toContain("handleEmailAction('spam', ids)")
    expect(page).toContain('title="Print"')
    expect(page).toContain('handleUnsubscribe(selectedEmail)')
    expect(page).toContain('LABEL_COLORS.map')
    expect(page).toContain('match: { labelIds: [currentLabelId ?? FOLDER_LABEL[folder as SystemFolder]], query: matchQuery() }')
    expect(page).toContain('<RulesPanel')
  })
})
