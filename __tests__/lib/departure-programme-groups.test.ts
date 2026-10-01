import { describe, it, expect } from 'vitest'
import { buildProgrammeGroups, summarise } from '@/lib/departures/programme-groups'

// The departures page lists programmes, not dates (operator, 2026-10-01).

const tpl = (id: string, name: string) => ({ id, template_name: name, template_code: id.toUpperCase(), duration_days: 8 })
const dep = (id: string, template_id: string | null, start_date: string, extra: Record<string, unknown> = {}) => ({
  id, template_id, tour_name: template_id ? `T ${template_id}` : 'Private Nile charter', tour_code: null,
  duration_days: 8, start_date, max_pax: 20, booked_pax: 0, status: 'open', ...extra,
})

describe('buildProgrammeGroups', () => {
  it('one group per programme, with dates in order; programmes without dates still listed, after', () => {
    const groups = buildProgrammeGroups(
      [tpl('b', 'Beta'), tpl('a', 'Alpha'), tpl('c', 'Gamma')],
      [dep('1', 'b', '2026-11-02'), dep('2', 'b', '2026-10-05'), dep('3', 'c', '2026-10-12')],
    )
    expect(groups.map(g => g.key)).toEqual(['b', 'c', 'a'])
    expect(groups[0].departures.map(d => d.start_date)).toEqual(['2026-10-05', '2026-11-02'])
    expect(groups[2].departures).toEqual([])
  })

  it('a departure with no template groups by its tour name, as a custom programme', () => {
    const groups = buildProgrammeGroups([], [dep('1', null, '2026-10-05'), dep('2', null, '2026-10-19')])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ key: 'custom:Private Nile charter', templateId: null, name: 'Private Nile charter' })
    expect(groups[0].departures).toHaveLength(2)
  })

  it('keeps a departure whose template is inactive (not in the list)', () => {
    const groups = buildProgrammeGroups([], [dep('1', 'old', '2026-10-05', { tour_template: { template_name: 'Old tour', template_code: 'OLD', duration_days: 5 } })])
    expect(groups[0]).toMatchObject({ templateId: 'old', name: 'Old tour', code: 'OLD', durationDays: 5 })
  })
})

describe('summarise', () => {
  it('counts seats over live dates only, and the next live date', () => {
    const s = summarise([
      dep('1', 'a', '2026-10-05', { status: 'cancelled', max_pax: 20, booked_pax: 0 }),
      dep('2', 'a', '2026-10-12', { status: 'guaranteed', booked_pax: 12 }),
      dep('3', 'a', '2026-10-19', { status: 'full', booked_pax: 20 }),
    ])
    expect(s).toEqual({ count: 3, next: '2026-10-12', last: '2026-10-19', booked: 32, seats: 40, guaranteed: 1, full: 1, cancelled: 1 })
  })
})
