// The supplier-voucher PDF had no behaviour test: it printed an empty items
// table for every generated voucher (#566) and never showed vehicle, driver or
// drop-off (no columns until #571) without anything failing. These render real
// PDFs and read the text back out.
import { describe, it, expect, vi } from 'vitest'

// The Noto Sans JP files are fetched from /public/fonts in the browser; the
// built-in Helvetica keeps the text readable in the raw PDF here.
vi.mock('@/lib/pdf-fonts', () => ({
  loadJapaneseFont: async () => {},
  pickFontFamily: () => 'helvetica',
  JP_FONT_FAMILY: 'helvetica',
}))

import { generateSupplierDocumentPDF } from '@/lib/supplier-document-pdf'

const base = {
  id: 'doc-1',
  document_number: 'TV-2026-0007',
  supplier_name: 'Cairo Transport Co',
  client_name: 'Aiko Tanaka',
  num_adults: 2,
  num_children: 0,
  currency: 'EUR',
  total_cost: 180,
  status: 'draft',
  created_at: '2026-10-08T00:00:00Z',
}

async function text(doc: Record<string, unknown>): Promise<string> {
  const pdf = await generateSupplierDocumentPDF(doc as never)
  return pdf.output()
}

describe('supplier voucher PDF', () => {
  it('prints a generated voucher’s lines (an empty picker list does not hide them)', async () => {
    const out = await text({
      ...base,
      document_type: 'hotel_voucher',
      services: [
        { service_name: 'Mena House - Deluxe Room', quantity: 2, total_cost: 300, date: '2026-11-02' },
        { service_name: 'Mena House - Breakfast', quantity: 2, total_cost: 40, date: '2026-11-03' },
      ],
      selected_attractions: [],
    })
    expect(out).toContain('Mena House - Deluxe Room')
    expect(out).toContain('Mena House - Breakfast')
  })

  it('prints a transport voucher’s vehicle, driver, pickup and drop-off', async () => {
    const out = await text({
      ...base,
      document_type: 'transport_voucher',
      services: [],
      vehicle_type: 'minivan',
      driver_name: 'Ahmed Saleh',
      pickup_location: 'Cairo Airport T2',
      dropoff_location: 'Mena House Hotel',
    })
    expect(out).toContain('Ahmed Saleh')
    expect(out).toContain('Cairo Airport T2')
    expect(out).toContain('Mena House Hotel')
    expect(out).toMatch(/Minivan/i)
  })

  it('leaves the vehicle block out of a voucher that is not transport', async () => {
    const out = await text({ ...base, document_type: 'hotel_voucher', services: [], driver_name: 'Ahmed Saleh' })
    expect(out).not.toContain('Ahmed Saleh')
  })
})

describe('a long voucher', () => {
  it('prints every special request, and its total and signatures stay on a page', async () => {
    const requests = Array.from({ length: 12 }, (_, i) => `Request line ${i + 1}: something the supplier must know`)
    const pdf = await generateSupplierDocumentPDF({
      ...base,
      document_type: 'cruise_voucher',
      services: Array.from({ length: 18 }, (_, i) => ({ service_name: `Night ${i + 1}`, date: `2026-11-${String(i + 1).padStart(2, '0')}`, quantity: 1, total_cost: 10 })),
      special_requests: requests.join('\n'),
    } as never)
    const out = pdf.output()
    for (const r of requests) expect(out).toContain(r)
    // Every text line sits above the footer bar (pageHeight - 20 on A4 = 277mm).
    const pageHeightPt = 297 * 72 / 25.4
    const ys = [...out.matchAll(/([\d.]+) ([\d.]+) Td/g)].map(m => pageHeightPt - Number(m[2]))
    expect(Math.max(...ys) * 25.4 / 72).toBeLessThan(297)
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
  })
})
