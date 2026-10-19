// One Extras list (20270107): which extras a trip is offered, at which price,
// and an extra costed from an Activities rate (operator, 2026-10-19: Tours →
// Options merged into Sell → Extras; programme level; the horse carriage's
// price entered once, in Activities).
import { describe, it, expect } from 'vitest'
import {
  extrasForProgramme, activityGroupCost, withActivityCost,
  type ExtraRow, type ProgrammeLink, type ActivityRateRow,
} from '@/lib/extras/offered'
import { parseProgrammePicks } from '@/lib/extras/programme-links'

const extra = (over: Partial<ExtraRow>): ExtraRow => ({
  id: 'x', name: 'X', supplier_cost: 10, selling_price: null, unit: 'per_person', is_active: true, ...over,
})
const NEK = 'tpl-nek804'
const OTHER = 'tpl-other'

describe('which extras a trip is offered', () => {
  const fastTrack = extra({ id: 'fast', name: 'Fast-track', offered_with: 'all', selling_price: 25 })
  const legacy = extra({ id: 'legacy', name: 'Luggage' }) // no offered_with: an unmigrated row
  const balloon = extra({ id: 'balloon', name: 'Balloon', offered_with: 'programmes', selling_price: 130 })
  const felucca = extra({ id: 'felucca', name: 'Felucca', offered_with: 'programmes' })
  const withdrawn = extra({ id: 'gone', name: 'Old', offered_with: 'all', is_active: false })
  const links: ProgrammeLink[] = [
    { extra_id: 'balloon', template_id: NEK, selling_price: 140 },
    { extra_id: 'felucca', template_id: OTHER, selling_price: null },
    { extra_id: 'fast', template_id: NEK, selling_price: 20 },
  ]
  const all = [fastTrack, legacy, balloon, felucca, withdrawn]

  it('every-booking extras go with any trip, programme ones only with theirs', () => {
    expect(extrasForProgramme(all, links, NEK).map(x => x.id)).toEqual(['fast', 'legacy', 'balloon'])
    expect(extrasForProgramme(all, links, OTHER).map(x => x.id)).toEqual(['fast', 'legacy', 'felucca'])
  })

  it('a trip not built from a programme gets only the every-booking ones', () => {
    expect(extrasForProgramme(all, links, null).map(x => x.id)).toEqual(['fast', 'legacy'])
  })

  it("the programme's own price replaces the extra's, and says so", () => {
    const nek = extrasForProgramme(all, links, NEK)
    expect(nek.find(x => x.id === 'balloon')).toMatchObject({ selling_price: 140, programme_price: true })
    // An every-booking extra can carry a price on one programme too.
    expect(nek.find(x => x.id === 'fast')).toMatchObject({ selling_price: 20, programme_price: true })
    expect(extrasForProgramme(all, links, OTHER).find(x => x.id === 'fast')).toMatchObject({ selling_price: 25, programme_price: false })
  })

  it("a blank programme price keeps the extra's own", () => {
    expect(extrasForProgramme(all, links, OTHER).find(x => x.id === 'felucca')).toMatchObject({ selling_price: null, programme_price: false })
  })

  it('a withdrawn extra is never offered', () => {
    expect(extrasForProgramme(all, links, NEK).some(x => x.id === 'gone')).toBe(false)
  })
})

describe('cost from an Activities rate', () => {
  const carriage: ActivityRateRow = { id: 'a1', activity_name: 'Horse Carriage', pricing_type: 'per_person', base_rate_eur: 12, base_rate_non_eur: 10 }

  it('per person: the rate × travellers, non-EUR unless told otherwise', () => {
    expect(activityGroupCost(carriage, 3)).toBe(30)
    expect(activityGroupCost(carriage, 3, true)).toBe(36)
  })

  it('a missing non-EUR rate falls back to the EUR one', () => {
    expect(activityGroupCost({ ...carriage, base_rate_non_eur: null }, 2)).toBe(24)
  })

  it('per group: once, whatever the size', () => {
    expect(activityGroupCost({ ...carriage, pricing_type: 'flat', base_rate_non_eur: 50 }, 4)).toBe(50)
  })

  it('per unit: one unit per max_capacity travellers', () => {
    expect(activityGroupCost({ ...carriage, pricing_type: 'per_unit', base_rate_non_eur: 40, max_capacity: 4 }, 5)).toBe(80)
  })

  it("tiered: the group's band, per person", () => {
    const tiered: ActivityRateRow = {
      id: 'a2', pricing_type: 'tiered',
      tiers: [{ min_pax: 1, max_pax: 2, rate_eur: 100 }, { min_pax: 3, max_pax: 10, rate_eur: 70, rate_non_eur: 60 }],
    }
    expect(activityGroupCost(tiered, 2)).toBe(200)
    expect(activityGroupCost(tiered, 4)).toBe(240)
  })

  it('no usable rate, or a withdrawn activity, is a hole — never free', () => {
    expect(activityGroupCost({ ...carriage, base_rate_eur: 0, base_rate_non_eur: null }, 2)).toBeNull()
    expect(activityGroupCost({ ...carriage, is_active: false }, 2)).toBeNull()
    expect(activityGroupCost(null, 2)).toBeNull()
  })

  it("a per-person extra costs the group's cost ÷ travellers; a per-booking one the whole", () => {
    const x = extra({ activity_rate_id: 'a1', supplier_cost: 999 })
    expect(withActivityCost(x, carriage, 3).supplier_cost).toBe(10)
    expect(withActivityCost({ ...x, unit: 'per_booking' }, carriage, 3).supplier_cost).toBe(30)
  })

  it('an extra whose activity is gone has no cost (unpriced), not its old typed one', () => {
    expect(withActivityCost(extra({ activity_rate_id: 'a1', supplier_cost: 999 }), undefined, 2).supplier_cost).toBeNull()
  })

  it('an extra with no activity keeps its typed cost', () => {
    const x = extra({ supplier_cost: 15 })
    expect(withActivityCost(x, carriage, 3)).toBe(x)
  })
})

describe('programme picks in a save', () => {
  it('absent = leave the links alone', () => {
    expect(parseProgrammePicks(undefined)).toEqual({})
  })
  it('ids or objects, duplicates once, blank price = the extra’s', () => {
    expect(parseProgrammePicks(['t1', { template_id: 't2', selling_price: '45' }, { template_id: 't1', selling_price: 9 }, { template_id: 't3', selling_price: '' }]))
      .toEqual({ picks: [{ template_id: 't1', selling_price: null }, { template_id: 't2', selling_price: 45 }, { template_id: 't3', selling_price: null }] })
  })
  it('refuses a bad price or a missing id', () => {
    expect(parseProgrammePicks([{ template_id: 't1', selling_price: -1 }]).error).toMatch(/negative/)
    expect(parseProgrammePicks([{ template_id: 't1', selling_price: 'abc' }]).error).toMatch(/number/)
    expect(parseProgrammePicks([{ selling_price: 5 }]).error).toMatch(/template_id/)
    expect(parseProgrammePicks('t1').error).toMatch(/list/)
  })
})
