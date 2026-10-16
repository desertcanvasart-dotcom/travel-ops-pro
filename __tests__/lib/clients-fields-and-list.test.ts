// The Clients screens' pure rules: which statuses exist, which columns a caller
// may write, how the list is filtered and paged, how money is shown, what a CSV
// cell looks like, and what stops a delete.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLIENT_STATUSES, clientStatusClass, isClientStatus } from '@/lib/clients/status'
import { EDITABLE_CLIENT_FIELDS, pickClientFields } from '@/lib/clients/fields'
import {
  CLIENT_LIST_DEFAULT, CLIENT_LIST_MAX, CLIENT_SORTS, applyClientFilters, applyClientSort,
  clientSearchFilter, parseClientListParams,
} from '@/lib/clients/list'
import { collectedTotals, formatMoneyTotals, invoicedTotals, sumCurrencyMaps } from '@/lib/clients/stats'
import { csvCell } from '@/lib/csv-cell'
import { attachedKinds } from '@/lib/clients/delete-client'
import { describeAttachments, isDeletable, refusalMessage, type ClientAttachments } from '@/lib/clients/delete-guard'
import { laterContact, pickCommunication, pickNote } from '@/lib/clients/activity'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('statuses', () => {
  it('are exactly what clients_status_check allows', () => {
    const baseline = read('migrations/20260829_baseline_schema.sql')
    const check = baseline.match(/CONSTRAINT clients_status_check CHECK \(\(\(status\)::text = ANY \(\(ARRAY\[([^\]]+)\]/)
    expect(check, 'clients_status_check not found in the baseline').toBeTruthy()
    const allowed = [...check![1].matchAll(/'([a-z]+)'::character varying/g)].map(m => m[1])
    expect([...CLIENT_STATUSES].sort()).toEqual(allowed.sort())
    // …and no later migration widens or narrows it.
    const others = read('migrations/20261212_trip_children_org_policies.sql') + read('migrations/20261201_org_scoped_parent_policies.sql')
    expect(others).not.toMatch(/clients_status_check/)
  })

  it.each([
    'app/clients/page.tsx',
    'app/clients/[id]/edit/page.tsx',
    'app/clients/[id]/page.tsx',
    'app/contacts/contacts-content.tsx',
  ])('%s offers no status the database would refuse', file => {
    const src = read(file)
    // <option value="active"> / "blacklisted" / "vip", or 'active' in a status list
    expect(src).not.toMatch(/<option value="(active|blacklisted|vip)"/)
    expect(src).not.toMatch(/CLIENT_STATUS_OPTIONS\s*=\s*\[[^\]]*'(active|vip|blacklisted)'/)
    expect(src).not.toMatch(/status === '(active|vip|blacklisted)'/)
  })

  it('give every status a badge colour, and an unknown one grey', () => {
    for (const s of ['lead', 'prospect', 'customer'] as const) expect(clientStatusClass(s), s).not.toBe('bg-gray-100 text-gray-800')
    expect(clientStatusClass('lead')).toContain('amber')
    expect(clientStatusClass('customer')).toContain('green')
    expect(clientStatusClass('blacklisted')).toBe('bg-gray-100 text-gray-800')
    expect(isClientStatus('active')).toBe(false)
  })
})

describe('pickClientFields', () => {
  it('never lets a caller write the database-owned columns', () => {
    const r = pickClientFields({
      first_name: 'Ana', client_code: 'CLI-9999', total_revenue_generated: 1e9, revenue_by_currency: { EUR: 1e9 },
      collected_by_currency: { EUR: 1 }, total_bookings_count: 99, average_booking_value: 5, revenue_currency: 'EUR',
      org_id: 'other-org', created_by: 'someone', id: 'x', created_at: '2020-01-01', updated_at: 'x', nonsense: 1,
    }, 'update')
    expect(r).toEqual({ ok: true, data: { first_name: 'Ana' } })
    for (const forbidden of ['client_code', 'org_id', 'total_revenue_generated', 'revenue_by_currency', 'collected_by_currency', 'total_bookings_count', 'average_booking_value', 'revenue_currency', 'created_by', 'id']) {
      expect(EDITABLE_CLIENT_FIELDS).not.toContain(forbidden)
    }
  })

  it('writes only the keys that were sent (a PATCH of {status} changes the status alone)', () => {
    expect(pickClientFields({ status: 'inactive' }, 'update')).toEqual({ ok: true, data: { status: 'inactive' } })
  })

  it('accepts the four statuses and refuses anything else', () => {
    for (const s of CLIENT_STATUSES) expect(pickClientFields({ first_name: 'A', status: s }, 'create').ok).toBe(true)
    for (const s of ['active', 'blacklisted', 'vip', 'Lead']) {
      const r = pickClientFields({ first_name: 'A', status: s }, 'update')
      expect(r.ok).toBe(false)
    }
  })

  it('stores a blank box as NULL, not an empty string', () => {
    const r = pickClientFields({ first_name: ' Ana ', last_name: 'Silva', email: '  ', phone: '', lead_source: '', date_of_birth: '', nationality: ' ' }, 'create')
    expect(r).toEqual({ ok: true, data: {
      first_name: 'Ana', last_name: 'Silva', email: null, phone: null, lead_source: null, date_of_birth: null, nationality: null,
    } })
  })

  it('does not copy the first name into a missing last name', () => {
    const r = pickClientFields({ first_name: 'Cher' }, 'create')
    expect(r).toEqual({ ok: true, data: { first_name: 'Cher', last_name: '' } })
  })

  it('needs a first name to create, and will not blank one on update', () => {
    expect(pickClientFields({ last_name: 'x' }, 'create').ok).toBe(false)
    expect(pickClientFields({ first_name: '  ' }, 'update').ok).toBe(false)
  })

  it('keeps internal_notes (the contacts Add form lost them) and cleans lists, flags and numbers', () => {
    const r = pickClientFields({
      first_name: 'A', internal_notes: 'vegetarian', tags: [' vip ', ''], special_interests: 'not-a-list',
      vip_status: 'yes', marketing_consent: true, agent_commission_rate: '12.5', rating: '',
    }, 'create')
    expect(r).toEqual({ ok: true, data: {
      first_name: 'A', last_name: '', internal_notes: 'vegetarian', tags: ['vip'], special_interests: [],
      vip_status: false, marketing_consent: true, agent_commission_rate: 12.5, rating: null,
    } })
    expect(pickClientFields({ first_name: 'A', rating: 9 }, 'create').ok).toBe(false)
  })
})

describe('the list query', () => {
  const sp = (q: string) => parseClientListParams(new URLSearchParams(q))

  it('clamps the page size, defaults it, and reads the filters', () => {
    expect(sp('').limit).toBe(CLIENT_LIST_DEFAULT)
    expect(sp('limit=100000').limit).toBe(CLIENT_LIST_MAX)
    expect(sp('limit=0').limit).toBe(1)
    expect(sp('page=-4').page).toBe(1)
    expect(sp('page=3&limit=50')).toMatchObject({ page: 3, limit: 50 })
    expect(sp('status=customer&vip=1&client_type=family&lead_source=website&date_from=2026-01-01&date_to=2026-02-01'))
      .toMatchObject({ status: 'customer', vipOnly: true, clientType: 'family', leadSource: 'website', dateFrom: '2026-01-01', dateTo: '2026-02-01' })
  })

  it('ignores a status the database does not have, "all", and malformed dates', () => {
    expect(sp('status=active').status).toBeNull()
    expect(sp('status=all&client_type=all&lead_source=all')).toMatchObject({ status: null, clientType: null, leadSource: null })
    expect(sp('date_from=yesterday&date_to=2026-1-1')).toMatchObject({ dateFrom: null, dateTo: null })
    expect(sp('client_type=a,b)').clientType).toBeNull()
  })

  it('lists by name unless asked otherwise, and every order ends on id so pages are stable', () => {
    expect(sp('').sort).toBe('name')
    expect(sp('sort=revenue').sort).toBe('revenue')
    expect(sp('sort=; drop table').sort).toBe('name')
    for (const order of Object.values(CLIENT_SORTS)) expect(order[order.length - 1][0]).toBe('id')
  })

  const recorder = () => {
    const calls: Array<[string, ...unknown[]]> = []
    const q: any = new Proxy({}, { get: (_t, name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return q } })
    return { q, calls }
  }

  it('turns the filters into the matching query calls', () => {
    const { q, calls } = recorder()
    applyClientFilters(q, sp('search=ana&status=lead&vip=1&client_type=family&lead_source=email&date_from=2026-01-01&date_to=2026-02-01'))
    expect(calls).toEqual([
      ['or', clientSearchFilter('ana')],
      ['eq', 'status', 'lead'],
      ['eq', 'client_type', 'family'],
      ['eq', 'lead_source', 'email'],
      ['eq', 'vip_status', true],
      ['gte', 'created_at', '2026-01-01'],
      ['lte', 'created_at', '2026-02-01T23:59:59'],
    ])
  })

  it('searches name, email, phone and client code — and a full name as first + last', () => {
    expect(clientSearchFilter('ana')).toBe('first_name.ilike.%ana%,last_name.ilike.%ana%,email.ilike.%ana%,phone.ilike.%ana%,client_code.ilike.%ana%')
    expect(clientSearchFilter('ana silva')).toContain('and(first_name.ilike.%ana%,last_name.ilike.%silva%)')
    // a search box is not a place for PostgREST operators
    expect(sp('search=a),status.eq.lead,(b').search).not.toMatch(/[(),]/)
  })

  it('orders by the chosen sort', () => {
    const { q, calls } = recorder()
    applyClientSort(q, 'name_desc')
    expect(calls).toEqual([
      ['order', 'first_name', { ascending: false }],
      ['order', 'last_name', { ascending: false }],
      ['order', 'id', { ascending: true }],
    ])
  })
})

describe('money', () => {
  it('shows each currency on its own — never one currency\'s label on another\'s amount', () => {
    const yen = { revenue_by_currency: { JPY: 500000 }, total_revenue_generated: 500000, revenue_currency: 'JPY' }
    expect(formatMoneyTotals(invoicedTotals(yen))).toBe('¥500,000')
    expect(formatMoneyTotals(invoicedTotals({ revenue_by_currency: { EUR: 1200, JPY: 50000 } }))).toBe('¥50,000 + €1,200.00')
  })

  it('invoiced and collected are different figures', () => {
    const row = { revenue_by_currency: { EUR: 1000 }, collected_by_currency: { EUR: 400 } }
    expect(invoicedTotals(row)).toEqual({ EUR: 1000 })
    expect(collectedTotals(row)).toEqual({ EUR: 400 })
  })

  it('falls back to the single stored figure only in the currency stored with it, and shows a dash for nothing', () => {
    expect(invoicedTotals({ revenue_by_currency: {}, total_revenue_generated: 90, revenue_currency: 'USD' })).toEqual({ USD: 90 })
    // no currency recorded: nothing is guessed (it used to print as euro)
    expect(invoicedTotals({ revenue_by_currency: {}, total_revenue_generated: 90, revenue_currency: null })).toEqual({})
    expect(formatMoneyTotals({})).toBe('—')
    expect(formatMoneyTotals(collectedTotals({}))).toBe('—')
  })

  it('sums the company per currency and ignores malformed maps', () => {
    expect(sumCurrencyMaps([{ EUR: 100.5, JPY: 1000 }, { EUR: 99.5 }, null, undefined, 'x' as any, [] as any, { USD: 'abc' }]))
      .toEqual({ EUR: 200, JPY: 1000, USD: 0 })
  })
})

describe('csvCell', () => {
  it('doubles the quotes inside a value', () => {
    expect(csvCell('Ann "AJ" Lee')).toBe('"Ann ""AJ"" Lee"')
  })
  it('neutralises formula triggers', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"')
    expect(csvCell('+81 90 1234')).toBe(`"'+81 90 1234"`)
    expect(csvCell('-1')).toBe(`"'-1"`)
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`)
    expect(csvCell('\tcmd')).toBe(`"'\tcmd"`)
  })
  it('leaves ordinary text, empties and numbers alone', () => {
    expect(csvCell('Ana Silva')).toBe('"Ana Silva"')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
    expect(csvCell(12)).toBe('"12"')
  })
  it('the contacts export uses it for every value', () => {
    const src = read('app/contacts/contacts-content.tsx')
    expect(src).toMatch(/\.map\(csvCell\)/)
    expect(src).not.toMatch(/`"\$\{v \|\| ''\}"`/)
  })
})

describe('what stops a delete', () => {
  const none: ClientAttachments = { trips: 0, bookings: 0, invoices: 0, payments: 0, conversations: 0, documents: 0 }

  it('a client with nothing attached may be deleted; anything attached blocks it', () => {
    expect(isDeletable(none)).toBe(true)
    for (const k of Object.keys(none) as Array<keyof ClientAttachments>) {
      expect(isDeletable({ ...none, [k]: 1 }), k).toBe(false)
    }
  })

  it('says what is attached, with counts, and offers marking inactive', () => {
    const counts = { ...none, trips: 2, invoices: 1, documents: 3 }
    expect(describeAttachments(counts)).toBe('2 trips, 1 invoice and 3 documents')
    expect(refusalMessage(counts)).toContain('Mark the client inactive')
    expect(attachedKinds(counts)).toEqual([['trips', 2], ['invoices', 1], ['documents', 3]])
  })
})

describe('notes and communications', () => {
  it('a note needs text; the type defaults to general', () => {
    expect(pickNote({ content: '  ' }, 'create').ok).toBe(false)
    expect(pickNote({ content: 'Prefers aisle', author: 'forged', created_by: 'forged' }, 'create'))
      .toEqual({ ok: true, data: { content: 'Prefers aisle', note_type: 'general' } })
  })
  it('a communication needs details and a real direction; the logger is never taken from the body', () => {
    expect(pickCommunication({ content: '' }, 'create').ok).toBe(false)
    expect(pickCommunication({ content: 'x', direction: 'sideways' }, 'create').ok).toBe(false)
    const r = pickCommunication({ content: 'Called', handled_by: 'forged', communication_date: '2026-10-01T10:00:00.000Z' }, 'create')
    expect(r).toEqual({ ok: true, data: { content: 'Called', communication_type: 'other', direction: 'outbound', communication_date: '2026-10-01T10:00:00.000Z' } })
  })
  it('last contact only moves forward', () => {
    expect(laterContact(null, '2026-10-01T00:00:00.000Z')).toBe('2026-10-01T00:00:00.000Z')
    expect(laterContact('2026-10-05T00:00:00.000Z', '2026-10-01T00:00:00.000Z')).toBe('2026-10-05T00:00:00.000Z')
    expect(laterContact('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')).toBe('2026-10-01T00:00:00.000Z')
  })
})
