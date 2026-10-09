// The contract's country and governing law live on the organization
// (migration 20261115). Until that migration is applied, the Company profile
// must still load and save; and the WhatsApp contract send must print the
// contract the page shows, not one rebuilt from the database.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  missingColumns: false,
  selects: [] as string[],
  updates: [] as Record<string, unknown>[],
  pdfArgs: [] as { data: Record<string, any>; options: Record<string, any> }[], // eslint-disable-line @typescript-eslint/no-explicit-any
  sent: [] as { to: string; body: string }[],
}))


// Hoisted: the branding route builds its client at import time.
const client = vi.hoisted(() => {
  function chain(table: string) {
    let mode: 'select' | 'update' = 'select'
    let cols = ''
    let payload: Record<string, unknown> = {}
    const usesContractCols = () => /operating_country|contract_governing_law/.test(mode === 'select' ? cols : Object.keys(payload).join(','))
    const result = () => {
      if (h.missingColumns && usesContractCols()) {
        return { data: null, error: { code: '42703', message: 'column organizations.operating_country does not exist' } }
      }
      if (mode === 'update') { h.updates.push(payload); return { data: null, error: null } }
      if (table === 'itineraries') {
        return { data: { id: 'it-1', itinerary_code: 'IT-1', client_name: 'Jamie', client_phone: '+201000000000', trip_name: 'Nile', total_cost: 2000, currency: 'EUR', num_adults: 2, num_children: 0, start_date: '2026-11-01', end_date: '2026-11-08', destinations: ['Cairo'] }, error: null }
      }
      return { data: { name: 'Nile Journeys' }, error: null }
    }
    const b: Record<string, unknown> = {
      select: (c: string) => { cols = c; h.selects.push(c); return b },
      update: (p: Record<string, unknown>) => { mode = 'update'; payload = p; return b },
      eq: () => b,
      single: async () => result(),
      then: (r: (v: unknown) => void) => r(result()),
    }
    return b
  }
  return { from: (t: string) => chain(t) }

})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => client }))
vi.mock('@/lib/auth/org-auth', () => ({ orgAuth: async () => ({ error: null, status: 200, org_id: 'org-A' }) }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  noOrgResponse: () => new Response(null, { status: 403 }),
  requireRole: async () => null,
}))
vi.mock('@/lib/org-identity', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-identity')>()),
  orgIdentity: async () => ({ name: 'Nile Journeys', email: '', phone: '', website: '', address: '1 Nile St', tagline: '' }),
}))
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: async (m: { to: string; body: string }) => { h.sent.push(m); return { success: true, messageId: 'wa' } } }))
vi.mock('@/lib/storage/outbound-documents', () => ({ uploadOutboundPdf: async () => 'https://signed' }))
vi.mock('@/lib/pdf-fonts-node', () => ({ loadJapaneseFont: async () => ({ family: 'NotoSansJP', files: [] }) }))
vi.mock('@/lib/contract-pdf-generator', () => ({
  generateContractPDF: async (data: Record<string, unknown>, options: Record<string, unknown>) => {
    h.pdfArgs.push({ data, options }); return new Uint8Array([1])
  },
}))

import { GET, PUT } from '@/app/api/organization/branding/route'
import { POST as sendContract } from '@/app/api/whatsapp/send-contract/route'

beforeEach(() => {
  h.missingColumns = false
  h.selects.length = 0; h.updates.length = 0; h.pdfArgs.length = 0; h.sent.length = 0
})

describe('Company profile: the contract country and law', () => {
  it('are read with the rest of the profile', async () => {
    expect((await GET()).status).toBe(200)
    expect(h.selects[0]).toContain('operating_country')
    expect(h.selects[0]).toContain('contract_governing_law')
  })

  it('before the migration, the profile still loads, without them', async () => {
    h.missingColumns = true
    const res = await GET()
    expect(res.status).toBe(200)
    expect(h.selects.at(-1)).not.toContain('operating_country')
  })

  it('before the migration, the rest still saves, and the page is told', async () => {
    h.missingColumns = true
    const res = await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ tagline: 'Hi', operating_country: 'Egypt', contract_governing_law: 'Egyptian law' }) }) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, contractTermsPending: true })
    expect(h.updates.at(-1)).toMatchObject({ tagline: 'Hi' })
    expect(h.updates.at(-1)).not.toHaveProperty('operating_country')
  })

  it('after it, they save', async () => {
    await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ operating_country: ' Egypt ', contract_governing_law: '' }) }) as never)
    expect(h.updates.at(-1)).toMatchObject({ operating_country: 'Egypt', contract_governing_law: null })
  })
})

describe('POST /api/whatsapp/send-contract', () => {
  const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never

  it('prints the contract the page shows, with the Unicode font and the org as provider', async () => {
    const res = await sendContract(post({
      itineraryId: 'it-1',
      contract: { paymentTerms: 'A 25% deposit now.', termsSections: [{ title: 'Disputes', text: ['Maltese law.'] }], tourName: 'Nile & Siwa', totalCost: 2400 },
    }))
    expect(res.status).toBe(200)
    const { data, options } = h.pdfArgs[0]
    expect(data.document.paymentTerms).toBe('A 25% deposit now.')
    expect(data.document.termsSections).toEqual([{ title: 'Disputes', text: ['Maltese law.'] }])
    expect(data.tourName).toBe('Nile & Siwa')
    expect(data.totalCost).toBe(2400)
    expect(data.provider).toMatchObject({ name: 'Nile Journeys', location: '1 Nile St' })
    expect(options.font).toMatchObject({ family: 'NotoSansJP' })
    expect(h.sent[0].to).toBe('+201000000000')
  })
})
