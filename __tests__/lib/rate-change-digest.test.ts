// The digest turns a window of rate_audit_log rows into one notice per
// (actor × table). Pins grouping, phrasing, and the bulk-edit coalescing.
import { describe, it, expect } from 'vitest'
import { groupChanges, describeGroup, describeChange, type AuditRow } from '@/lib/rate-change-digest'

const row = (o: Partial<AuditRow>): AuditRow => ({
  id: 'r', table_name: 'entrance_fees', record_id: 'aaaaaaaa-0000-0000-0000-000000000000', action: 'UPDATE',
  changed_fields: { adult_rate: { old: 200, new: 220 } }, full_old_record: { site_name: 'Karnak' }, full_new_record: { site_name: 'Karnak' },
  changed_by: 'u1', changed_at: '2026-08-23T10:00:00Z', ...o,
})

describe('groupChanges', () => {
  it('groups by actor × table, unattributed rows together', () => {
    const g = groupChanges([row({}), row({ table_name: 'guide_rates' }), row({}), row({ changed_by: null }), row({ changed_by: null })])
    expect(g.map(x => [x.actorId, x.table, x.rows.length])).toEqual([['u1', 'entrance_fees', 2], ['u1', 'guide_rates', 1], [null, 'entrance_fees', 2]])
  })
})

describe('describeChange', () => {
  it('names the record and the first two changed fields', () => {
    expect(describeChange(row({ changed_fields: { adult_rate: { old: 200, new: 220 }, child_rate: { old: 100, new: 110 }, note: { old: null, new: 'x' } } }))).toBe('Karnak: adult_rate 200 → 220, child_rate 100 → 110 (+1)')
    expect(describeChange(row({ action: 'DELETE', full_new_record: null }))).toBe('Karnak: deleted')
    expect(describeChange(row({ full_new_record: {}, full_old_record: {} }))).toBe('aaaaaaaa: adult_rate 200 → 220')
  })
})

describe('describeGroup', () => {
  it('one notice for a bulk edit, with examples and a count of the rest, linking to the page', () => {
    const rows = Array.from({ length: 79 }, (_, i) => row({ id: String(i), full_new_record: { site_name: `Site ${i}` } }))
    const n = describeGroup(groupChanges(rows)[0], '田中')
    expect(n.title).toBe('料金変更: 入場料 79件 — Rate change: 79 entrance fees')
    expect(n.message).toContain('田中 changed 79 entrance fees')
    expect(n.message).toContain('Site 0: adult_rate 200 → 220')
    expect(n.message).toContain('…and 76 more')
    expect(n.message).not.toContain('Site 5:')
    expect(n.link).toBe('/rates/attractions')
  })
  it('says so when the actor is unknown, and falls back for an unmapped table', () => {
    const n = describeGroup(groupChanges([row({ changed_by: null, table_name: 'hotel_contacts' })])[0], null)
    expect(n.message).toContain('unknown user')
    expect(n.link).toBe('/rates')
  })
})
