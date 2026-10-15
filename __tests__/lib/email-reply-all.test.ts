import { describe, it, expect } from 'vitest'
import { replyAllRecipients } from '@/lib/email/reply-all'
import { parseRecipients, buildRawMessage } from '@/lib/email/compose-mime'

const OWN = ['yoyaku@ats-hj.com']

describe('replyAllRecipients', () => {
  it('To is the sender; Cc everyone else, without the office', () => {
    expect(replyAllRecipients({
      from: 'Aiko Tanaka <aiko@example.jp>',
      to: 'yoyaku@ats-hj.com, agent@hisgo.jp',
      cc: 'Ken <ken@example.jp>',
    }, OWN)).toEqual({ to: ['Aiko Tanaka <aiko@example.jp>'], cc: ['agent@hisgo.jp', 'Ken <ken@example.jp>'] })
  })

  it('a message the office sent replies to its recipients', () => {
    expect(replyAllRecipients({
      from: 'ATS <YOYAKU@ats-hj.com>',
      to: 'aiko@example.jp',
      cc: 'agent@hisgo.jp',
    }, OWN)).toEqual({ to: ['aiko@example.jp'], cc: ['agent@hisgo.jp'] })
  })

  it('nobody twice, case-insensitively', () => {
    expect(replyAllRecipients({
      from: 'aiko@example.jp',
      to: 'Aiko@Example.jp, yoyaku@ats-hj.com',
      cc: 'agent@hisgo.jp; AGENT@hisgo.jp',
    }, OWN)).toEqual({ to: ['aiko@example.jp'], cc: ['agent@hisgo.jp'] })
  })
})

describe('parseRecipients', () => {
  it('splits on commas and semicolons, keeps display names, reports what is not an address', () => {
    expect(parseRecipients('a@b.co; "Ken" <ken@x.jp>, not-an-address')).toEqual({
      list: ['a@b.co', '"Ken" <ken@x.jp>'],
      invalid: ['not-an-address'],
    })
  })
  it('a header-injection attempt is one cleaned entry, not a new header', () => {
    const { list } = parseRecipients('a@b.co\r\nBcc: evil@x.com')
    expect(list.join('')).not.toMatch(/[\r\n]/)
  })
})

describe('buildRawMessage', () => {
  const decode = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  it('writes To, Cc and Bcc lines', () => {
    const text = decode(buildRawMessage({ to: ['a@b.co', 'c@d.co'], cc: ['e@f.co'], bcc: ['g@h.co'], subject: 'Hi', body: '<p>x</p>' }))
    expect(text).toContain('To: a@b.co, c@d.co\r\n')
    expect(text).toContain('Cc: e@f.co\r\n')
    expect(text).toContain('Bcc: g@h.co\r\n')
  })
  it('no Cc or Bcc line when there are none', () => {
    const text = decode(buildRawMessage({ to: ['a@b.co'], subject: 'Hi', body: 'x' }))
    expect(text).not.toMatch(/^(Cc|Bcc):/m)
  })
})
