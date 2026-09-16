// Supplements on a hotel or cruise rate — the agency's own list (Settings →
// Vocabulary), a per-person-per-night price inside every dated period.
// Nothing here knows a supplement by name: the keys below are stand-ins.
import { describe, it, expect } from 'vitest'
import {
  sanitizeSupplements, supplementsForRow, supplementField, supplementKeysInRates,
  resolveSupplementsForDate, sanitizeSupplementKeys,
} from '@/lib/rates/supplements'
import { sanitizeSeasons, SUPPLEMENT_FIELD } from '@/lib/rates/rate-seasons'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import type { ExchangeRates } from '@/lib/currency-service'

describe('sanitizeSupplements — the list a rate carries', () => {
  it('keeps well-formed entries, in order, first of a duplicate key', () => {
    expect(sanitizeSupplements([
      { key: 'view_nile', name: 'Nile View' },
      { key: 'upper_floor', name: '  Upper Floor ' },
      { key: 'view_nile', name: 'again' },
    ])).toEqual([{ key: 'view_nile', name: 'Nile View' }, { key: 'upper_floor', name: 'Upper Floor' }])
  })

  it('drops a key that is not a vocabulary key and never throws', () => {
    expect(sanitizeSupplements([{ key: 'Nile View', name: 'x' }, { key: '', name: 'y' }, null, 'z'])).toEqual([])
    expect(sanitizeSupplements(undefined)).toEqual([])
    expect(sanitizeSupplements('not json')).toEqual([])
  })

  it('falls back to the key as the name, and reads JSONB arriving as a string', () => {
    expect(sanitizeSupplements([{ key: 'half_board' }])).toEqual([{ key: 'half_board', name: 'half_board' }])
    expect(supplementsForRow({ supplements: '[{"key":"view_sea","name":"Sea View"}]' })).toEqual([{ key: 'view_sea', name: 'Sea View' }])
  })
})

describe('the price rides inside the period rates', () => {
  it('sanitizeSeasons keeps supp:<key>:<suffix> fields next to the fixed rates and drops malformed ones', () => {
    const [s] = sanitizeSeasons([{
      name: 'High', from: '2026-10-01', to: '2026-12-19',
      rates: { pp_double_eur: 100, 'supp:view_nile:eur': 20, 'supp:view_nile:non_eur': '25', 'supp:Bad:eur': 5, 'supp:x:usd': 3, other: 9 },
    }], 'accommodation')!
    expect(s.rates['supp:view_nile:eur']).toBe(20)
    expect(s.rates['supp:view_nile:non_eur']).toBe(25)
    expect(s.rates).not.toHaveProperty('supp:Bad:eur')
    expect(s.rates).not.toHaveProperty('supp:x:usd')
    expect(s.rates).not.toHaveProperty('other')
    expect(s.rates.pp_double_eur).toBe(100)
  })

  it('names the field and recognises it', () => {
    expect(supplementField('upper_deck', 'non_eur')).toBe('supp:upper_deck:non_eur')
    expect(SUPPLEMENT_FIELD.exec('supp:upper_deck:non_eur')?.[1]).toBe('upper_deck')
    expect(supplementKeysInRates({ pp_double_eur: 1, 'supp:a:eur': 2, 'supp:a:non_eur': 3, 'supp:b:eur': 0 })).toEqual(['a', 'b'])
  })

  it('is currency-converted with the rest of the period — 1000 EGP → $20', async () => {
    const RATES = { base: 'USD', rates: { USD: 1, EGP: 50 }, timestamp: 0 } as unknown as ExchangeRates
    const n = createRateNormalizer('USD', { getRates: async () => RATES })
    const [r] = (await n.normalize('accommodation_rates', [{
      id: 'h1', rate_currency: 'EGP', pp_double_eur: 5000,
      supplements: [{ key: 'view_nile', name: 'Nile View' }],
      seasons: [{ name: 'All', from: '2026-01-01', to: '2026-12-31', rates: { pp_double_eur: 5000, 'supp:view_nile:eur': 1000 } }],
    }]))!
    const seasons = r.seasons as Array<{ rates: Record<string, number> }>
    expect(seasons[0].rates['supp:view_nile:eur']).toBe(20)
    expect(r.supplements).toEqual([{ key: 'view_nile', name: 'Nile View' }])  // no money on the list itself
  })
})

const hotel = {
  supplements: [{ key: 'view_nile', name: 'Nile View' }, { key: 'half_board', name: 'Half Board' }],
  seasons: [
    { name: 'Low', from: '2026-05-01', to: '2026-09-30', rates: { pp_double_eur: 80, 'supp:view_nile:eur': 15, 'supp:view_nile:non_eur': 18, 'supp:half_board:eur': 0 } },
    { name: 'High', from: '2026-10-01', to: '2026-12-19', rates: { pp_double_eur: 120, 'supp:view_nile:eur': 25, 'supp:view_nile:non_eur': 30 } },
  ],
}

describe('resolveSupplementsForDate', () => {
  it('prices each requested key at the night\'s own period, per passport group', () => {
    const [low] = resolveSupplementsForDate(hotel, 'accommodation', true, '2026-07-15', ['view_nile'])
    const [high] = resolveSupplementsForDate(hotel, 'accommodation', false, '2026-11-10', ['view_nile'])
    expect(low).toEqual({ key: 'view_nile', name: 'Nile View', night: 15, carried: true })
    expect(high.night).toBe(30)
  })

  it('a carried supplement with a blank price is 0 and carried — an unpriced hole, not free', () => {
    const [hb] = resolveSupplementsForDate(hotel, 'accommodation', true, '2026-07-15', ['half_board'])
    expect(hb).toEqual({ key: 'half_board', name: 'Half Board', night: 0, carried: true })
  })

  it('a key the rate does not carry is 0 and not carried, even if a stray price exists', () => {
    const row = { ...hotel, seasons: [{ ...hotel.seasons[0], rates: { ...hotel.seasons[0].rates, 'supp:view_sea:eur': 40 } }] }
    const [sea] = resolveSupplementsForDate(row, 'accommodation', true, '2026-07-15', ['view_sea'])
    expect(sea).toEqual({ key: 'view_sea', name: 'view_sea', night: 0, carried: false })
  })

  it('with no travel date reads the FIRST period; a date no period covers has no price', () => {
    expect(resolveSupplementsForDate(hotel, 'accommodation', true, null, ['view_nile'])[0].night).toBe(15)
    const outside = resolveSupplementsForDate(hotel, 'accommodation', true, '2027-03-01', ['view_nile'])[0]
    expect(outside.night).toBe(0)
    expect(outside.carried).toBe(true)
  })

  it('works for a cruise row the same way', () => {
    const ship = { supplements: [{ key: 'upper_deck', name: 'Upper Deck' }], seasons: [{ name: 'All', from: '2026-01-01', to: '2026-12-31', rates: { double_eur: 200, 'supp:upper_deck:eur': 35 } }] }
    expect(resolveSupplementsForDate(ship, 'cruise', true, '2026-06-01', ['upper_deck'])[0].night).toBe(35)
  })
})

describe('sanitizeSupplementKeys — what a programme day asks for', () => {
  it('keeps vocabulary keys, de-duplicated; anything else is none', () => {
    expect(sanitizeSupplementKeys(['view_nile', 'view_nile', 'Upper Floor', 3, 'half_board'])).toEqual(['view_nile', 'half_board'])
    expect(sanitizeSupplementKeys([])).toBeUndefined()
    expect(sanitizeSupplementKeys('view_nile')).toBeUndefined()
  })
})
