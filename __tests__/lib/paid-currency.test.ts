// What a line's supplier is PAID in (lib/paid-currency, migration 20270109):
// a rate entered in EGP is converted to the rate currency for pricing, and the
// line remembers EGP — for booking supplier rows, vouchers and expenses only.
import { describe, it, expect } from 'vitest'
import { NO_PAID, paidFieldsFor, paidFieldsWith, paidMoney, paidRateAfterReprice, roundPaid } from '@/lib/paid-currency'
import { supplierOwnMoney } from '@/lib/supplier-own-currency'
import { supplierLinesFromServices } from '@/lib/bookings/supplier-lines'
import { voucherMoney } from '@/lib/documents/plan-documents'
import { computeFxReprice, type FrozenFx } from '@/lib/itinerary-fx'
import { createRateNormalizer } from '@/lib/rates/rate-currency'
import { SERVICE_COPY_COLUMNS } from '@/lib/itineraries/duplicate'

// A USD company, a yen trip: 1 USD = 50 EGP = 150 JPY.
const RATES = { base: 'USD', date: '2026-10-25', rates: { USD: 1, EGP: 50, JPY: 150 } }
const fxFor = async (c: string) => ({ USD: 1, EGP: 1 / 50, JPY: 1 / 150 } as Record<string, number>)[c] ?? null
const ON_YEN_TRIP = { runCurrency: 'USD', tripCurrency: 'JPY', runToTrip: 150 }

describe('paidFieldsFor', () => {
  it('a line priced from an EGP rate is paid in EGP: the cost converted back at the factor pricing used', async () => {
    // EGP 1,500 guide → $30 for pricing → ¥4,500 on the trip.
    const paid = await paidFieldsFor([{ rate_currency: 'EGP' }], { ...ON_YEN_TRIP, runTotal: 30 }, fxFor)
    expect(paid).toEqual({ paid_currency: 'EGP', paid_amount: 1500, paid_rate: 3 })
  })

  it('EGP and JPY are whole units, so a cent of rounding in the rate currency does not show', async () => {
    // EGP 1,500 at 48.7 to the dollar was priced as $30.80 → 1,499.96 → 1,500.
    const paid = await paidFieldsFor([{ rate_currency: 'egp' }], { ...ON_YEN_TRIP, runTotal: 30.8 }, async () => 1 / 48.7)
    expect(paid.paid_amount).toBe(1500)
    expect(roundPaid(12.345, 'GBP')).toBe(12.35)
    expect(roundPaid(12.5, 'JPY')).toBe(13)
  })

  it('stamps nothing when the rate is in the rate or trip currency, currencies mix, there is no cost, or no factor', async () => {
    const line = { ...ON_YEN_TRIP, runTotal: 30 }
    expect(await paidFieldsFor([{ rate_currency: null }], line, fxFor)).toEqual(NO_PAID)
    expect(await paidFieldsFor([{ rate_currency: 'USD' }], line, fxFor)).toEqual(NO_PAID)
    expect(await paidFieldsFor([{ rate_currency: 'JPY' }], line, fxFor)).toEqual(NO_PAID)
    expect(await paidFieldsFor([{ rate_currency: 'EGP' }, { rate_currency: null }], line, fxFor)).toEqual(NO_PAID)
    expect(await paidFieldsFor([], line, fxFor)).toEqual(NO_PAID)
    expect(await paidFieldsFor([{ rate_currency: 'EGP' }], { ...line, runTotal: 0 }, fxFor)).toEqual(NO_PAID)
    expect(await paidFieldsFor([{ rate_currency: 'EGP' }], line, async () => null)).toEqual(NO_PAID)
    // a rate-currency (grid) trip: still EGP, at 1 to the trip
    expect(await paidFieldsFor([{ rate_currency: 'EGP' }], { runCurrency: 'USD', tripCurrency: 'USD', runToTrip: 1, runTotal: 30 }, fxFor))
      .toEqual({ paid_currency: 'EGP', paid_amount: 1500, paid_rate: 0.02 })
  })
})

describe('paidFieldsWith', () => {
  it('the same answer with the factor already in hand (the grid save and the editor)', () => {
    expect(paidFieldsWith([{ rate_currency: 'EGP' }], { ...ON_YEN_TRIP, runTotal: 30 }, c => (c === 'EGP' ? 1 / 50 : null)))
      .toEqual({ paid_currency: 'EGP', paid_amount: 1500, paid_rate: 3 })
    expect(paidFieldsWith([{ rate_currency: 'EGP' }], { ...ON_YEN_TRIP, runTotal: 30 }, () => undefined)).toEqual(NO_PAID)
  })
})

describe('paidMoney', () => {
  const line = { total_cost: 4500, paid_currency: 'EGP', paid_amount: 1500, paid_rate: 3 }

  it('the stored amount while it matches the line', () => {
    expect(paidMoney(line)).toEqual({ currency: 'EGP', amount: 1500 })
    // within the whole-unit rounding: ¥4,501.5 is still EGP 1,500
    expect(paidMoney({ ...line, total_cost: 4501.5 })).toEqual({ currency: 'EGP', amount: 1500 })
  })

  it('after an edit (2 guides instead of 1, ¥9,000) the current total at paid_rate — never the stale 1,500', () => {
    expect(paidMoney({ ...line, total_cost: 9000 })).toEqual({ currency: 'EGP', amount: 3000 })
  })

  it('null without a paid currency, a usable rate or a total', () => {
    expect(paidMoney({ total_cost: 4500 })).toBeNull()
    expect(paidMoney({ ...line, paid_rate: 0 })).toBeNull()
    expect(paidMoney({ ...line, paid_currency: 'XXX' })).toBeNull()
    expect(paidMoney({ ...line, total_cost: null })).toBeNull()
  })
})

describe('readers: booking supplier rows and vouchers', () => {
  const day = (n: number) => ({ day_number: n, day_date: `2026-12-0${n}` })
  const guide = {
    supplier_id: 'g1', supplier_name: 'Ahmed', service_type: 'guide', ...day(1),
    // converted from the rate currency (USD) — the columns pricing reads
    total_cost: 4500, supplier_currency: 'USD', supplier_cost_original: 30, exchange_rate_used: 150,
    paid_currency: 'EGP', paid_amount: 1500, paid_rate: 3,
  }

  it('the paid currency wins over the rate currency the line was converted from', () => {
    expect(supplierOwnMoney([guide], 'JPY')).toEqual({ currency: 'EGP', total: 1500, lineAmounts: [1500], own: true })
    expect(supplierLinesFromServices([guide], null, 'JPY')[0]).toMatchObject({ quoted_cost: 1500, cost_currency: 'EGP' })
    expect(voucherMoney([guide], 'JPY')).toEqual({ currency: 'EGP', total: 1500, lineAmounts: [1500] })
  })

  it('a supplier with lines paid in EGP and lines that are not falls back to the rule without paid fields', () => {
    const plain = { ...guide, paid_currency: null, paid_amount: null, paid_rate: null }
    expect(supplierOwnMoney([guide, plain], 'JPY')).toEqual({ currency: 'USD', total: 60, lineAmounts: [30, 30], own: true })
  })

  it('a line paid in the trip currency is just the trip currency', () => {
    expect(supplierOwnMoney([{ total_cost: 4500, paid_currency: 'JPY', paid_amount: 4500, paid_rate: 1 }], 'JPY').own).toBe(false)
  })
})

describe('FX re-price keeps what the supplier is paid', () => {
  const FX: FrozenFx = { base: 'USD', rates: { USD: 1, EGP: 50, JPY: 160 }, frozen_at: '2026-11-01T00:00:00Z', frozen_by: 'u1', source: 'reprice' }

  it('the yen total moves with the dollar; the EGP amount stays 1,500', () => {
    const line = { id: 'a', supplier_currency: 'USD', supplier_cost_original: 30, exchange_rate_used: 150, total_cost: 4500, paid_currency: 'EGP', paid_rate: 3 }
    const [change] = computeFxReprice([line], 'JPY', FX).changes
    expect(change).toMatchObject({ new_total: 4800, new_rate: 160 })
    expect(change.new_paid_rate).toBeCloseTo(3.2, 10)
    expect(paidMoney({ total_cost: change.new_total, paid_currency: 'EGP', paid_amount: 1500, paid_rate: change.new_paid_rate })).toEqual({ currency: 'EGP', amount: 1500 })
  })

  it('a line without a paid currency gets no paid rate', () => {
    const line = { id: 'b', supplier_currency: 'USD', supplier_cost_original: 30, exchange_rate_used: 150, total_cost: 4500 }
    expect(computeFxReprice([line], 'JPY', FX).changes[0].new_paid_rate).toBeNull()
    expect(paidRateAfterReprice({ paid_currency: 'EGP', paid_rate: 3 }, 0, 10)).toBeNull()
  })
})

describe('the rate normaliser says which factor it used', () => {
  it('fxFor is the factor normalize() converts an EGP row with', async () => {
    const n = createRateNormalizer('USD', { getRates: async () => RATES as never })
    const [row] = (await n.normalize('guide_rates', [{ id: 'r1', rate_currency: 'EGP', base_rate_eur: 1500, base_rate_non_eur: 1500 }]))!
    expect(row).toMatchObject({ rate_currency: 'EGP', base_rate_eur: 30 })
    const f = await n.fxFor('EGP')
    expect(f).toBeCloseTo(0.02, 10)
    expect(Number(row.base_rate_eur) / f!).toBeCloseTo(1500, 6)
    expect(await n.fxFor('USD')).toBe(1)
    expect(await n.fxFor(null)).toBeNull()
    expect(await n.fxFor('XXX')).toBeNull()
  })
})

describe('copying a trip', () => {
  it('copies what each line is paid in', () => {
    expect(SERVICE_COPY_COLUMNS).toEqual(expect.arrayContaining(['paid_currency', 'paid_amount', 'paid_rate']))
  })
})
