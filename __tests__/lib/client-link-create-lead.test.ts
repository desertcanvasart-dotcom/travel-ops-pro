// Operator, 2026-09-19: "even when I try to link it to client and it doesn't
// find the client, it should show create lead. This is the second time we
// tackle this."
//
// "No clients found" was the end of the road. The automatic lead pass
// (lib/email/email-leads) sees a conversation exactly ONCE — if it judged the
// thread not a travel request, or the sync had not reached it, there was no
// way to say "this is a lead" by hand. Somebody who emails us and is not in
// the CRM IS a lead; the panel now says so where the operator already is.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nameParts } from '@/components/ClientLinkButton'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const button = read('components/ClientLinkButton.tsx')
const en = JSON.parse(read('messages/en.json'))

describe('the name a lead is filed under', () => {
  it('uses the display name the mail carries', () => {
    expect(nameParts('Juanita L Pied', 'jpied972@hotmail.com')).toEqual({ first: 'Juanita', last: 'L Pied' })
  })

  it('falls back to the address, not to the whole address', () => {
    // "jpied972@hotmail.com" as a client name reads as a machine in every list
    // the client then appears in.
    expect(nameParts(undefined, 'jpied972@hotmail.com')).toEqual({ first: 'jpied972', last: 'jpied972' })
    expect(nameParts('', 'juanita.pied@hotmail.com')).toEqual({ first: 'juanita', last: 'pied' })
  })

  it('strips the angle-bracket form and stray quotes', () => {
    expect(nameParts('"Juanita L Pied" <jpied972@hotmail.com>', 'jpied972@hotmail.com').first).toBe('Juanita')
  })

  it('repeats a single word, because the table requires both names', () => {
    expect(nameParts('Juanita', 'x@y.com')).toEqual({ first: 'Juanita', last: 'Juanita' })
  })

  it('never returns empty', () => {
    expect(nameParts('', '')).toEqual({ first: 'Unknown', last: 'Unknown' })
  })
})

describe('the empty state offers the lead', () => {
  it('has an action where it used to only have a sentence', () => {
    expect(button).toContain("t('createLead')")
    expect(button).toContain('handleCreateLead')
  })

  it('creates a LEAD, not a customer', () => {
    // They have asked for something; nothing is booked. A booking is what
    // promotes them (migration 20261021).
    expect(button).toMatch(/status: 'lead'/)
    expect(button).toMatch(/client_source: 'email'/)
  })

  it('links the email straight away, which is what the operator was doing', () => {
    const create = button.slice(button.indexOf('const handleCreateLead'), button.indexOf('const handleLink'))
    expect(create).toContain('await handleLink(')
  })

  it('says what the button will do', () => {
    expect(en.clientLinkButton.createLead).toBe('Create lead')
    expect(en.clientLinkButton.createLeadHint).toMatch(/lead/)
    expect(JSON.parse(read('messages/ja.json')).clientLinkButton.createLead).toBeTruthy()
  })

  it('is given the sender name at both call sites', () => {
    const inbox = read('app/inbox/page.tsx')
    expect(inbox.match(/fromName=\{extractName\(selectedEmail\.from\)\}/g) ?? []).toHaveLength(2)
  })
})
