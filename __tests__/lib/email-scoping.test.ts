// ============================================
// The shared inbox holds correspondence, not the operator's mailbox
// ============================================
// The audit's AUT-H02 called what it saw "test data leaked into production".
// It was the operator's real Gmail — the sync's only filter was a date, so
// live 2FA codes, bank notifications and personal invites were stored where
// every staff account could read them. These tests pin the rule that fixed
// it: machine mail addressed to the operator personally never enters the
// shared store; people and known business contacts always do.
import { describe, it, expect } from 'vitest'
import { looksAutomated, looksLikeOrderForm, shouldStoreThread } from '@/lib/email-scoping'

describe('looksAutomated', () => {
  it('catches a verification code the standard way — Auto-Submitted (RFC 3834)', () => {
    // The audit's concrete finding: "Your ChatGPT code is 354411", live in
    // the shared inbox.
    expect(
      looksAutomated({
        counterpartyEmail: 'noreply@tm.openai.com',
        headers: { 'Auto-Submitted': 'auto-generated' },
      })
    ).toBe(true)
  })

  it('honours Auto-Submitted: no as the explicit NOT-automated declaration', () => {
    expect(
      looksAutomated({ counterpartyEmail: 'ana@example.com', headers: { 'Auto-Submitted': 'no' } })
    ).toBe(false)
  })

  it('catches bulk precedence and list mail', () => {
    expect(
      looksAutomated({ counterpartyEmail: 'digest@example.com', headers: { Precedence: 'bulk' } })
    ).toBe(true)
    expect(
      looksAutomated({
        counterpartyEmail: 'news@example.com',
        headers: { 'List-Unsubscribe': '<mailto:unsub@example.com>' },
      })
    ).toBe(true)
  })

  it("catches Gmail's own machine categories, passes PERSONAL and unlabelled", () => {
    expect(
      looksAutomated({ counterpartyEmail: 'a@b.com', labelIds: ['INBOX', 'CATEGORY_UPDATES'] })
    ).toBe(true)
    expect(
      looksAutomated({ counterpartyEmail: 'a@b.com', labelIds: ['INBOX', 'CATEGORY_PERSONAL'] })
    ).toBe(false)
    expect(looksAutomated({ counterpartyEmail: 'a@b.com', labelIds: [] })).toBe(false)
  })

  it('catches do-not-reply senders by local part', () => {
    for (const addr of [
      'no-reply@github.com',
      'noreply@airwallex.com',
      'notifications@github.com',
      'do-not-reply@calendar.google.com',
      'mailer-daemon@googlemail.com',
    ]) {
      expect(looksAutomated({ counterpartyEmail: addr }), addr).toBe(true)
    }
  })

  it('never catches a person whose name merely contains a machine word', () => {
    // Anchored matching: "renee.ply@" contains "reply"; "salerts@" contains
    // "alerts". Both are people.
    for (const addr of ['renee.ply@example.com', 'salerts@example.com', 'ahmed.maher@kempinski.com']) {
      expect(looksAutomated({ counterpartyEmail: addr }), addr).toBe(false)
    }
  })

  it('a human with no headers and no labels is not automated', () => {
    expect(looksAutomated({ counterpartyEmail: 'yuki.tanaka@gmail.com' })).toBe(false)
  })
})

describe('shouldStoreThread', () => {
  it('a known business contact overrides every machine signal', () => {
    // Booking systems legitimately write from no-reply@ — a supplier match
    // must win, or reservation confirmations vanish.
    expect(
      shouldStoreThread(
        {
          counterpartyEmail: 'no-reply@kempinski.com',
          headers: { 'Auto-Submitted': 'auto-generated' },
        },
        true
      )
    ).toBe(true)
  })

  it('an unknown human is stored — the next customer is not in the clients table yet', () => {
    expect(shouldStoreThread({ counterpartyEmail: 'first.inquiry@gmail.com' }, false)).toBe(true)
  })

  it('unknown machine mail is not stored', () => {
    expect(
      shouldStoreThread(
        { counterpartyEmail: 'noreply@bank.example', headers: { 'Auto-Submitted': 'auto-generated' } },
        false
      )
    ).toBe(false)
  })
})

describe('the website order form is correspondence', () => {
  // tour-up.jp sends the お問合せフォーム from a system address. That is the
  // office's next customer, not a notification: the subject names the form.
  it('a no-reply sender with the form subject is stored', () => {
    const input = { counterpartyEmail: 'noreply@tour-up.jp', headers: { 'Auto-Submitted': 'auto-generated' }, labelIds: ['CATEGORY_UPDATES'], subject: '【お問合せフォーム】申込み NEK803-ABCR' }
    expect(looksLikeOrderForm(input)).toBe(true)
    expect(looksAutomated(input)).toBe(false)
    expect(shouldStoreThread(input, false)).toBe(true)
  })
  it('the same sender without the form markers is still machinery', () => {
    const input = { counterpartyEmail: 'noreply@tour-up.jp', headers: {}, labelIds: [], subject: 'Your weekly digest' }
    expect(looksLikeOrderForm(input)).toBe(false)
    expect(looksAutomated(input)).toBe(true)
  })
})
