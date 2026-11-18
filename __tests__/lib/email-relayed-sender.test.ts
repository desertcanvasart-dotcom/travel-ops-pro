// A website form on the office's own site emails FROM the office TO the
// office, with the traveller in Reply-To. That traveller is the sender
// (lib/email/relayed-sender.ts). Ported from autoura-saas #812.
import { describe, it, expect } from 'vitest'
import { officeRule } from '@/lib/email/office-addresses'
import { effectiveSender, headerAddresses, messageSender, relayedSender } from '@/lib/email/relayed-sender'

const office = officeRule(['info@travel2egypt.org'], ['ats-hj.com'])

describe('headerAddresses', () => {
  it('every address, lower-cased; commas in quotes or <> do not split', () => {
    expect(headerAddresses('"Doe, Jane" <Jane@X.com>, k@z.com')).toEqual(['jane@x.com', 'k@z.com'])
    expect(headerAddresses('')).toEqual([])
    expect(headerAddresses('Undisclosed recipients:;')).toEqual([])
  })
})

describe('relayedSender', () => {
  const form = { from: 'Concierge <concierge@travel2egypt.org>', to: 'info@travel2egypt.org', replyTo: 'Jane Doe <jane@gmail.com>' }

  it('From office, To office, Reply-To outside → that person', () => {
    expect(relayedSender(office, form)).toBe('jane@gmail.com')
    // Cc to another office address, or no recipient at all, is still the office
    expect(relayedSender(office, { ...form, cc: 'ops@ats-hj.com' })).toBe('jane@gmail.com')
    expect(relayedSender(office, { ...form, to: '' })).toBe('jane@gmail.com')
  })

  it('anything else is not relayed', () => {
    // staff writing to a client (a recipient outside the office)
    expect(relayedSender(office, { ...form, to: 'client@yahoo.com' })).toBeNull()
    expect(relayedSender(office, { ...form, cc: 'client@yahoo.com' })).toBeNull()
    // an internal note: no Reply-To, or Reply-To is the office
    expect(relayedSender(office, { ...form, replyTo: '' })).toBeNull()
    expect(relayedSender(office, { ...form, replyTo: 'hello@travel2egypt.org' })).toBeNull()
    // the customer writing in
    expect(relayedSender(office, { ...form, from: 'jane@gmail.com' })).toBeNull()
  })
})

describe('effectiveSender', () => {
  it('unchanged for ordinary mail', () => {
    expect(effectiveSender(office, { from: 'Jane <jane@gmail.com>', to: 'info@travel2egypt.org' }))
      .toEqual({ direction: 'inbound', email: 'jane@gmail.com', relayed: false })
    expect(effectiveSender(office, { from: 'info@travel2egypt.org', to: 'jane@gmail.com' }))
      .toEqual({ direction: 'outbound', email: 'info@travel2egypt.org', relayed: false })
    expect(effectiveSender(office, { from: '' })).toEqual({ direction: 'inbound', email: '', relayed: false })
  })
  it('a relayed form is inbound, from the traveller', () => {
    expect(effectiveSender(office, { from: 'concierge@travel2egypt.org', to: 'info@travel2egypt.org', replyTo: 'jane@gmail.com' }))
      .toEqual({ direction: 'inbound', email: 'jane@gmail.com', relayed: true })
  })
})

describe('messageSender', () => {
  it('files a relayed form under the traveller\'s Reply-To entry, name and all', () => {
    const s = messageSender([
      { name: 'From', value: 'Concierge <concierge@travel2egypt.org>' },
      { name: 'To', value: 'info@travel2egypt.org' },
      { name: 'reply-to', value: 'info@travel2egypt.org, "Doe, Jane" <jane@gmail.com>' },
    ], office)
    expect(s).toMatchObject({ direction: 'inbound', relayed: true, email: 'jane@gmail.com', fromHeader: '"Doe, Jane" <jane@gmail.com>' })
  })
  it('ordinary mail keeps its From as written', () => {
    const s = messageSender([{ name: 'From', value: 'Info <info@travel2egypt.org>' }, { name: 'To', value: 'jane@gmail.com' }], office)
    expect(s).toMatchObject({ direction: 'outbound', relayed: false, fromHeader: 'Info <info@travel2egypt.org>' })
  })
})
