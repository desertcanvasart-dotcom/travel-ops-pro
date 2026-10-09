// The tour export put request-body text into the HTML unescaped, crashed on a
// tour with no cities or a missing total, and a quote or non-Latin-1
// character in the tour code made Content-Disposition invalid (500) — which
// Tour Builder then saved as tour.html without a word. WhatsApp invoices in
// JPY printed decimals.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrgId: async () => 'org-A' }))
vi.mock('@/lib/org-identity', () => ({ orgIdentity: async () => ({ name: 'Nile Journeys' }) }))
vi.mock('@/lib/org-rate-currency', () => ({ getOrgRateCurrency: async () => 'EUR' }))
vi.mock('@/lib/pdf-fonts-server', () => ({ getJapaneseFontFace: async () => '' }))
vi.mock('@/lib/i18n/server-messages', () => ({
  getServerLocale: async () => 'en',
  lookupServerMessage: (_l: string, key: string) => (key.endsWith('daysCities') ? '{days} days · {cities}' : key.split('.').pop()),
}))

import { POST } from '@/app/api/tours/export-pdf/route'

const exportTour = (tour: Record<string, unknown>, pricing: unknown = null) =>
  POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ tour, pax: 2, is_euro_passport: true, pricing }) }) as never)

describe('POST /api/tours/export-pdf', () => {
  it('escapes the tour’s text', async () => {
    const res = await exportTour({
      tour_name: '<script>alert(1)</script>Nile', tour_code: 'NL-1', tour_type: 'private', duration_days: 3,
      cities: ['Cairo', '<b>Luxor</b>'], description: '<img src=x onerror=alert(1)>',
      days: [{ day_number: 1, city: '<i>Cairo</i>', notes: '<a href="javascript:x">n</a>' }],
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Luxor</b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('exports a tour with no cities, days or totals', async () => {
    const res = await exportTour({ tour_name: 'Bare', tour_code: 'B-1' }, { totals: {} })
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain('NaN')
  })

  it('names the file safely whatever the tour code holds', async () => {
    const res = await exportTour({ tour_name: 'Q', tour_code: 'カイロ"3日間"', cities: [], days: [] })
    expect(res.status).toBe(200)
    const header = res.headers.get('content-disposition')!
    expect(header).toMatch(/^attachment; filename="[\w.-]+\.html"; filename\*=UTF-8''/)
    expect(decodeURIComponent(header.split("UTF-8''")[1])).toBe('カイロ"3日間".html')
  })
})

describe('callers', () => {
  it('Tour Builder reports a failed export instead of saving the error', () => {
    const page = readFileSync(join(process.cwd(), 'app/tour-builder/page.tsx'), 'utf8')
    expect(page).toContain("if (!response.ok) throw new Error(`export failed: ${response.status}`)")
  })

  it('the WhatsApp invoice prints the currency’s own decimals', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/whatsapp/send-invoice/route.ts'), 'utf8')
    expect(route).toContain('formatMoney(Number(invoice.balance_due), invoice.currency)')
    expect(route).not.toContain('Number(invoice.balance_due).toFixed(2)')
  })
})
