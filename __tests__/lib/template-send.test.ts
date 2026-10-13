// The Templates page's Send dialog (lib/templates/template-send) and the
// template routes' save errors and currency. Audit findings T2, T4, T7, T8:
// 'b2b' templates were offered the client list and greeted the partner's
// agent with our own staff member's name; a subject-only placeholder got no
// field; a duplicate name was a generic 500; money fell back to USD.
import { describe, it, expect } from 'vitest'
import {
  itineraryPlaceholderValues,
  recipientKind,
  recipientPlaceholderValues,
  templatePlaceholders,
} from '@/lib/templates/template-send'
import { DUPLICATE_TEMPLATE_MESSAGE, templateSaveFailure } from '@/lib/templates/template-scope'
import { templateCurrency } from '@/lib/template-sender'

describe('recipientKind', () => {
  it("sends 'partner' and 'b2b' templates to B2B partners", () => {
    expect(recipientKind('partner')).toBe('partner')
    expect(recipientKind('b2b')).toBe('partner')
  })
  it('sends supplier templates to suppliers and everything else to clients', () => {
    expect(recipientKind('supplier')).toBe('supplier')
    expect(recipientKind('customer')).toBe('client')
    expect(recipientKind('internal')).toBe('client')
    expect(recipientKind(undefined)).toBe('client')
  })
})

describe('templatePlaceholders', () => {
  it('includes placeholders that appear only in the subject', () => {
    expect(templatePlaceholders('Dear {{GuestName}}, see {{TripName}}', 'Quote {{QuoteRef}} for {{GuestName}}'))
      .toEqual(['{{GuestName}}', '{{TripName}}', '{{QuoteRef}}'])
  })
  it('copes with no subject and no body', () => {
    expect(templatePlaceholders('Hi {{A}}', null)).toEqual(['{{A}}'])
    expect(templatePlaceholders(undefined, undefined)).toEqual([])
  })
})

describe('recipientPlaceholderValues', () => {
  const partner = { name: 'Sakura Travel', email: 'ops@sakura.example', phone: '+81 3 0000 0000', contactName: 'Tanaka Yui' }

  it("addresses a 'b2b' template's AgentName to the partner's contact", () => {
    const v = recipientPlaceholderValues('b2b', partner)
    expect(v['{{AgentName}}']).toBe('Tanaka Yui')
    expect(v['{{PartnerContactName}}']).toBe('Tanaka Yui')
    expect(v['{{PartnerCompany}}']).toBe('Sakura Travel')
  })
  it("leaves AgentName alone for a 'partner' template (it is the sender there)", () => {
    const v = recipientPlaceholderValues('partner', partner)
    expect(v).not.toHaveProperty('{{AgentName}}')
    expect(v['{{PartnerContactName}}']).toBe('Tanaka Yui')
  })
  it('falls back to the company name when a partner has no contact', () => {
    expect(recipientPlaceholderValues('b2b', { name: 'Sakura Travel' })['{{AgentName}}']).toBe('Sakura Travel')
  })
  it('fills client placeholders for a customer template', () => {
    const v = recipientPlaceholderValues('customer', { name: 'Jane Doe', email: 'j@x.example' })
    expect(v['{{GuestName}}']).toBe('Jane Doe')
    expect(v['{{ClientEmail}}']).toBe('j@x.example')
    expect(v).not.toHaveProperty('{{AgentName}}')
  })
})

describe('itineraryPlaceholderValues', () => {
  const data = { TripName: 'Kyoto', AgentName: 'Our Staff', Pax: 4 }
  it("does not fill a 'b2b' template's AgentName with our staff member", () => {
    expect(itineraryPlaceholderValues('b2b', data)).toEqual({ '{{TripName}}': 'Kyoto', '{{Pax}}': '4' })
  })
  it('keeps AgentName (the sender) for every other category', () => {
    expect(itineraryPlaceholderValues('customer', data)['{{AgentName}}']).toBe('Our Staff')
    expect(itineraryPlaceholderValues('partner', data)['{{AgentName}}']).toBe('Our Staff')
  })
})

describe('templateSaveFailure', () => {
  it('answers a duplicate with 409 and a message the operator can act on', () => {
    expect(templateSaveFailure({ code: '23505' }, 'Failed to create template'))
      .toEqual({ status: 409, error: DUPLICATE_TEMPLATE_MESSAGE })
  })
  it('keeps other failures generic 500s, and no error is no failure', () => {
    expect(templateSaveFailure({ code: '42501' }, 'Failed to create template'))
      .toEqual({ status: 500, error: 'Failed to create template' })
    expect(templateSaveFailure(null, 'x')).toBeNull()
  })
})

describe('templateCurrency', () => {
  it("uses the trip's currency, else the company's, never a blanket USD", () => {
    expect(templateCurrency('GBP', 'JPY')).toBe('GBP')
    expect(templateCurrency(null, 'JPY')).toBe('JPY')
    expect(templateCurrency(undefined, null)).toBe('EUR')
  })
})
