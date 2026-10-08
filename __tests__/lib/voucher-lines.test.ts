// A generated voucher's PDF printed an empty items table (selected_attractions
// defaults to [], which the PDF took over `services`), and saving the edit page
// replaced a generated voucher's lines with the empty attractions picker.
import { describe, it, expect } from 'vitest'
import { voucherLines, pickerOwnsLines } from '@/lib/documents/voucher-lines'

const line = (name: string) => ({ service_name: name, date: '2026-11-02', quantity: 2 })

describe('voucherLines', () => {
  it('prints a generated voucher’s services despite the empty attractions default', () => {
    const doc = {
      services: [line('Mena House — 2 nights'), line('Mena House — breakfast')],
      selected_attractions: [],
      selected_routes: null,
      selected_meals: null,
      selected_guides: null,
    }
    expect(voucherLines(doc).map(l => l.service_name)).toEqual(['Mena House — 2 nights', 'Mena House — breakfast'])
  })

  it('prefers services, which every save writes with the picker list', () => {
    const doc = {
      services: [line('Airport → Hotel')],
      selected_routes: [{ route_name: 'Airport → Hotel', quantity: 1 }],
    }
    expect(voucherLines(doc)).toEqual(doc.services)
  })

  it('falls back to the first picker list with lines when there are no services', () => {
    const doc = {
      services: [],
      selected_routes: [],
      selected_meals: [{ restaurant_name: 'Abou El Sid' }],
      selected_attractions: [{ attraction_name: 'Giza Plateau' }],
    }
    expect(voucherLines(doc)).toEqual([{ restaurant_name: 'Abou El Sid' }])
  })

  it('is empty when nothing has lines', () => {
    expect(voucherLines({ services: null, selected_attractions: [] })).toEqual([])
    expect(voucherLines({})).toEqual([])
  })
})

describe('pickerOwnsLines', () => {
  it('leaves the lines alone when the picker was never used', () => {
    expect(pickerOwnsLines([], [])).toBe(false)
    expect(pickerOwnsLines([], null)).toBe(false)
    expect(pickerOwnsLines([], undefined)).toBe(false)
  })

  it('rebuilds the lines when the picker holds lines', () => {
    expect(pickerOwnsLines([{ id: 'a' }], [])).toBe(true)
  })

  it('rebuilds (to none) when the user removed every picked line', () => {
    expect(pickerOwnsLines([], [{ id: 'a' }])).toBe(true)
  })
})
