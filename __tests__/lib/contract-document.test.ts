// The contract PDF printed none of what the contract page shows — a fixed
// "10% deposit… upon arrival", its own inclusion lists, no cancellation terms,
// no conditions — and pdf-lib's Helvetica threw on a contract translated into
// Japanese or Russian. Every contract named Egyptian law and Cairo courts,
// whoever the operator; that now comes from the Company profile.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateContractPDF } from '@/lib/contract-pdf-generator'
import { sanitizeContractDocument, type ContractDocument } from '@/lib/contract-document'
import { loadJapaneseFont } from '@/lib/pdf-fonts-node'
import { paymentInvoiceShape } from '@/lib/payment-invoice'
import { receiptBrand } from '@/lib/receipt-pdf-generator'

const base = {
  provider: { name: 'Nile Journeys', website: 'nile.example' },
  contractNumber: 'TC-2026-IT1', contractDate: '2026-10-09', clientName: 'Jamie', numTravelers: 2,
  tourName: 'Nile', startDate: '2026-11-01', endDate: '2026-11-08', destinations: 'Cairo, Siwa',
  totalCost: 2000, currency: 'EUR',
}
const textOf = (bytes: Uint8Array) =>
  [...Buffer.from(bytes).toString('latin1').matchAll(/\((.*?)\) Tj/g)].map(m => m[1]).join(' ')

const edited: ContractDocument = {
  paymentTerms: 'A 25% deposit now, the rest 30 days before departure.',
  inclusions: ['Hot-air balloon'],
  exclusions: ['Domestic flights'],
  cancellationIntro: 'Charges apply from written notice:',
  cancellationLines: ['Free until 60 days.'],
  forceMajeure: 'Credit for future travel.',
  termsSections: [{ title: 'Dispute Resolution', text: ['Settled under Maltese law.'] }],
  specialNotes: 'Bring a hat.',
  governingNote: 'This contract is governed by Maltese law.',
}

describe('the contract PDF', () => {
  it('prints the contract as the page shows it, not its own defaults', async () => {
    const text = textOf(await generateContractPDF({ ...base, document: edited }))
    for (const s of ['A 25% deposit now', 'Hot-air balloon', 'Domestic flights', 'Free until 60 days.', 'Credit for future travel.',
      'Settled under Maltese law.', 'Bring a hat.', 'This contract is governed by Maltese law.', 'Nile Journeys']) {
      expect(text).toContain(s)
    }
    expect(text).not.toContain('10% deposit')
    expect(text).not.toMatch(/Egypt/)
  })

  it('prints "To be confirmed" for a trip with no price', async () => {
    expect(textOf(await generateContractPDF({ ...base, totalCost: null }))).toContain('To be confirmed')
  })

  it('draws a contract translated into Japanese and Russian with the Noto font', async () => {
    const font = await loadJapaneseFont()
    expect(font).not.toBeNull()
    const bytes = await generateContractPDF({
      ...base,
      document: { ...edited, paymentTerms: 'ご予約時に30%の申込金をお支払いください。', specialNotes: 'Договор о путешествии' },
    }, { font })
    expect(Buffer.from(bytes).toString('latin1').startsWith('%PDF-')).toBe(true)
  })
})

describe('sanitizeContractDocument', () => {
  it('keeps only contract text, bounded', () => {
    const doc = sanitizeContractDocument({
      paymentTerms: 'x'.repeat(5000), inclusions: ['A', '', 7, 'B'], clientPhone: '+1999', provider: { name: 'Someone else' },
      termsSections: [{ title: 'T', text: ['a'] }, { title: '', text: ['b'] }, 'junk'], totalCost: -5,
      labels: { title: 'VERTRAG', bogus: 'x' },
    })
    expect(doc.paymentTerms).toHaveLength(2000)
    expect(doc.inclusions).toEqual(['A', 'B'])
    expect(doc.termsSections).toEqual([{ title: 'T', text: ['a'] }])
    expect(doc.labels).toEqual({ title: 'VERTRAG' })
    expect(doc).not.toHaveProperty('totalCost')
    expect(doc).not.toHaveProperty('clientPhone')
    expect(doc).not.toHaveProperty('provider')
    expect(sanitizeContractDocument({ totalCost: null })).toEqual({ totalCost: null })
  })
})

describe('no Egypt in the contract unless the operator sets it', () => {
  it.each(['en', 'ja'])('%s messages', (loc) => {
    const contract = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${loc}.json`), 'utf8')).contract
    const { destinationsPlaceholder: _placeholder, ...rest } = contract
    expect(JSON.stringify(rest)).not.toMatch(/Egypt|エジプト|Cairo|カイロ/)
  })

  it.each([
    'app/documents/contract/[id]/page.tsx',
    'lib/contract-pdf-generator.ts',
    'app/api/whatsapp/send-contract/route.ts',
  ])('%s', (file) => {
    const code = readFileSync(join(process.cwd(), file), 'utf8')
      .split('\n').filter(l => !/^(\/\/|\/\*|\*|\{\/\*)/.test(l.trim())).join('\n')
    expect(code).not.toMatch(/Egypt|Cairo/)
  })
})

describe('payment invoices', () => {
  it('use the trip’s real total, whatever deposit was recorded', () => {
    expect(paymentInvoiceShape('deposit', 300, 3000)).toEqual({ invoiceType: 'deposit', depositPercent: 10, tripTotal: 3000 })
    expect(paymentInvoiceShape('final', 2100, 3000)).toEqual({ invoiceType: 'final', depositPercent: 30, tripTotal: 3000 })
    expect(paymentInvoiceShape('deposit', '500', '3000')).toMatchObject({ invoiceType: 'deposit', tripTotal: 3000 })
  })

  it('draw no breakdown without a total', () => {
    expect(paymentInvoiceShape('deposit', 300, null)).toEqual({ invoiceType: 'standard' })
    expect(paymentInvoiceShape('deposit', 3000, 3000)).toEqual({ invoiceType: 'standard' })
    expect(paymentInvoiceShape('full', 3000, 3000)).toEqual({ invoiceType: 'standard' })
  })

  it('the invoice page assumes no 30% deposit and no "upon arrival"', () => {
    const page = readFileSync(join(process.cwd(), 'app/documents/invoice/[id]/page.tsx'), 'utf8')
    expect(page).not.toMatch(/\? 30 :/)
    expect(page).not.toContain('Balance due upon arrival')
    expect(page).toContain('paymentInvoiceShape(p.payment_type, p.amount, p.total_cost)')
  })
})

describe('receipt PDFs', () => {
  it('carry the operator’s name and contacts', () => {
    expect(receiptBrand({ name: 'Nile Journeys', website: 'nile.example', email: '', phone: '+20 1' }))
      .toEqual({ name: 'Nile Journeys', footer: 'nile.example | +20 1' })
    expect(receiptBrand(undefined)).toEqual({})
    for (const f of ['app/documents/receipt/[id]/page.tsx', 'app/receipts/page.tsx']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).toContain('receiptBrand(company)')
    }
  })
})
