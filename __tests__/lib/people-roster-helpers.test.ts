// Pure helpers behind the Partners, Team Members and WhatsApp auto-assign fixes.
import { describe, it, expect, vi } from 'vitest'

// lib/department-admin builds a service-role client at import.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

import {
  parsePartnerInput, nextPartnerCode, partnerStats, partnerDeleteBlock, PARTNER_CODE_MAX,
} from '@/lib/b2b/partners'
import { findDuplicateEmail, isTeamRole, cleanEmail } from '@/lib/team-members'
import { pickAutoAssignee, openChatsByMember, orgLoginForEmail } from '@/lib/whatsapp-org'
import { partnerIsInactive } from '@/lib/b2b/quote-scope'
import { findDepartmentNameClash } from '@/lib/department-admin'

describe('parsePartnerInput', () => {
  it('keeps only the allowlist and trims', () => {
    const r = parsePartnerInput({ company_name: ' A ', phone: ' 1 ', id: 'x', org_id: 'y', credit_limit: 9, show_net_rates: true }, 'create')
    expect(r).toEqual({ ok: true, data: { company_name: 'A', phone: '1' } })
  })
  it('requires a name on create only', () => {
    expect(parsePartnerInput({}, 'create').ok).toBe(false)
    expect(parsePartnerInput({ notes: 'n' }, 'update')).toEqual({ ok: true, data: { notes: 'n' } })
    expect(parsePartnerInput({ company_name: '  ' }, 'update').ok).toBe(false)
  })
  it('percentages are 0-100 inclusive; blank is null', () => {
    expect(parsePartnerInput({ company_name: 'A', default_margin_percent: 0 }, 'create')).toMatchObject({ data: { default_margin_percent: 0 } })
    expect(parsePartnerInput({ company_name: 'A', commission_percent: '100' }, 'create')).toMatchObject({ data: { commission_percent: 100 } })
    expect(parsePartnerInput({ company_name: 'A', commission_percent: '' }, 'create')).toMatchObject({ data: { commission_percent: null } })
    for (const bad of [100.01, -0.1, 5000, 'x', NaN, Infinity]) {
      expect(parsePartnerInput({ company_name: 'A', default_margin_percent: bad }, 'create').ok).toBe(false)
    }
  })
  it('never carries an empty partner_code, and caps its length', () => {
    expect(parsePartnerInput({ company_name: 'A', partner_code: '  ' }, 'create')).toEqual({ ok: true, data: { company_name: 'A' } })
    expect(parsePartnerInput({ company_name: 'A', partner_code: 'x'.repeat(PARTNER_CODE_MAX + 1) }, 'create').ok).toBe(false)
  })
})

describe('nextPartnerCode', () => {
  it('uses letters and digits of the name, PTR when too short', () => {
    expect(nextPartnerCode('QA Test Partner', [], () => 0)).toBe('QAT-000')
    expect(nextPartnerCode('X', [], () => 0)).toBe('PTR-000')
  })
  it('skips taken codes in any case', () => {
    expect(nextPartnerCode('Karnak', ['kar-000', 'KAR-001'], () => 0)).toBe('KAR-002')
  })
  it('widens to four digits once all 1000 are taken', () => {
    const all = Array.from({ length: 1000 }, (_, i) => `KAR-${String(i).padStart(3, '0')}`)
    expect(nextPartnerCode('Karnak', all, () => 0.5)).toMatch(/^KAR-\d{4}$/)
  })
})

describe('partnerStats', () => {
  it('counts all rows; the average ignores partners with no margin set', () => {
    expect(partnerStats([
      { is_active: true, country: 'Japan', default_margin_percent: 20 },
      { is_active: false, country: 'Japan', default_margin_percent: 0 },
      { is_active: true, country: null, default_margin_percent: null },
      { is_active: true, country: 'Egypt', default_margin_percent: 25 },
    ])).toEqual({ total: 4, active: 3, countries: 2, avg_margin: 22.5 })
    expect(partnerStats([]).avg_margin).toBeNull()
  })
})

describe('partnerDeleteBlock', () => {
  it('names what uses the partner', () => {
    expect(partnerDeleteBlock('Alpha', { quotes: 0, trips: 0, bookings: 0 })).toBeNull()
    expect(partnerDeleteBlock('Alpha', { quotes: 1, trips: 2, bookings: 1 })).toBe(
      'Cannot delete Alpha: it is used by 1 quote, 2 trips, 1 booking. Deactivate it instead.')
  })
})

describe('partnerIsInactive', () => {
  const db = (row: unknown) => ({
    from: () => { const b: any = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: row }) }; return b },
  })
  it('is true only for the org partner that is deactivated', async () => {
    expect(await partnerIsInactive(db({ id: 'p', is_active: false }), 'o', 'p')).toBe(true)
    expect(await partnerIsInactive(db({ id: 'p', is_active: true }), 'o', 'p')).toBe(false)
    expect(await partnerIsInactive(db(null), 'o', 'p')).toBe(false)
    expect(await partnerIsInactive(db({ id: 'p', is_active: false }), 'o', null)).toBe(false)
  })
})

describe('team member helpers', () => {
  it('roles are the ones the page offers', () => {
    expect(isTeamRole('guide')).toBe(true)
    expect(isTeamRole('admin')).toBe(false)
    expect(isTeamRole(undefined)).toBe(false)
  })
  it('cleanEmail trims and blanks to null', () => {
    expect(cleanEmail('  a@b.c ')).toBe('a@b.c')
    expect(cleanEmail('  ')).toBeNull()
    expect(cleanEmail(5)).toBeNull()
  })
  it('duplicate email ignores case and the member itself; "_" is not a wildcard', () => {
    const rows = [{ id: '1', email: 'A_b@x.com' }, { id: '2', email: 'axb@x.com' }]
    expect(findDuplicateEmail(rows, 'a_B@X.com')?.id).toBe('1')
    expect(findDuplicateEmail(rows, 'a_b@x.com', '1')).toBeNull()
    expect(findDuplicateEmail(rows, 'a_c@x.com')).toBeNull()
  })
})

describe('orgLoginForEmail', () => {
  const db = (members: string[], profiles: Array<{ id: string; email: string }>) => ({
    from: (t: string) => {
      const b: any = {
        select: () => b, eq: () => b, in: () => b,
        then: (ok: any) => ok({ data: t === 'organization_members' ? members.map(user_id => ({ user_id })) : profiles, error: null }),
      }
      return b
    },
  })
  it('links exactly one match, and not an ambiguous one', async () => {
    expect(await orgLoginForEmail(db(['u1'], [{ id: 'u1', email: 'A@x.com' }]), 'o', 'a@X.com')).toBe('u1')
    expect(await orgLoginForEmail(db(['u1', 'u2'], [{ id: 'u1', email: 'a@x.com' }, { id: 'u2', email: 'A@x.com' }]), 'o', 'a@x.com')).toBeNull()
  })
})

describe('pickAutoAssignee', () => {
  const m = (over: Record<string, unknown>) => ({ id: 'm', user_id: 'u', is_active: true, is_available: true, max_conversations: 50, last_assigned_at: null, created_at: '2026-01-01', ...over })
  it('never picks a member without a login (a driver or guide nobody can see chats for)', () => {
    expect(pickAutoAssignee([m({ id: 'driver', user_id: null })], new Map())).toBeNull()
  })
  it('skips unavailable, inactive and members at their max_conversations', () => {
    const members = [
      m({ id: 'away', is_available: false }),
      m({ id: 'gone', is_active: false }),
      m({ id: 'full', max_conversations: 2 }),
      m({ id: 'ok', max_conversations: 2, last_assigned_at: '2026-05-01' }),
    ]
    const open = openChatsByMember([
      { assigned_team_member_id: 'full', status: 'active', is_hidden: false },
      { assigned_team_member_id: 'full', status: 'active', is_hidden: false },
      { assigned_team_member_id: 'ok', status: 'active', is_hidden: false },
      { assigned_team_member_id: 'ok', status: 'archived', is_hidden: false },
    ])
    expect(pickAutoAssignee(members, open)).toBe('ok')
    expect(pickAutoAssignee(members.slice(0, 3), open)).toBeNull()
  })
  it('takes the member longest without a chat; never-assigned first', () => {
    const members = [
      m({ id: 'recent', last_assigned_at: '2026-06-02' }),
      m({ id: 'older', last_assigned_at: '2026-06-01' }),
      m({ id: 'never', last_assigned_at: null, created_at: '2026-03-01' }),
    ]
    expect(pickAutoAssignee(members, new Map())).toBe('never')
    expect(pickAutoAssignee(members.slice(0, 2), new Map())).toBe('older')
  })
})

describe('findDepartmentNameClash', () => {
  it('ignores case and spaces, and the department itself', () => {
    const rows = [{ id: '1', name: 'Reservation' }, { id: '2', name: 'Aviation' }]
    expect(findDepartmentNameClash(rows, ' reservation ')?.id).toBe('1')
    expect(findDepartmentNameClash(rows, 'Reservation', '1')).toBeNull()
  })
})
