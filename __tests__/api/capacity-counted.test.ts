// Operate audit — Capacity #2–#5: groups out are counted from sold trips and
// running departures; Max guides / vehicles are checked; the WhatsApp
// assistant counts like /api/capacity/check; counts are validated; a day can
// be reset and a limit cleared; the page opens on the user's own month.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setMockTables, createMockClient } from '../_mock-supabase'
import {
  capacityDayDetail,
  capacityInputError,
  dayLoads,
  determineCapacityResult,
  overLimits,
} from '@/lib/capacity-availability'

let client: any = createMockClient()
vi.mock('@/lib/auth/org-auth', () => ({
  orgAuth: async () => ({ error: null, status: 200, supabase: client, org_id: 'org-1', user: { id: 'user-1' } }),
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  noOrgResponse: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }))
const createMock = vi.fn()
vi.mock('@/lib/ai/anthropic-client', () => ({ getAnthropicClient: () => ({ messages: { create: createMock } }) }))

import { GET as listCapacity, POST as saveCapacity, DELETE as resetCapacity } from '@/app/api/capacity/route'
import { PUT as putDay } from '@/app/api/capacity/[date]/route'
import { POST as checkCapacity } from '@/app/api/capacity/check/route'
import { WhatsAppAIAgent } from '@/lib/ai/whatsapp-ai-agent'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const json = async (r: Response) => ({ status: r.status, body: await r.json() })
const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never

function seed(over: Record<string, any[]> = {}) {
  setMockTables({
    operator_capacity: [
      { id: 'c-1', org_id: 'org-1', date: '2026-11-03', status: 'busy', max_groups: 2, max_guides: 1, max_vehicles: null, booked_groups: 0, reason: 'Fair' },
    ],
    itineraries: [
      // Sold, on the road 2–4 Nov, guide g-1.
      { id: 'i-1', org_id: 'org-1', status: 'confirmed', start_date: '2026-11-02', end_date: '2026-11-04', assigned_guide_id: 'g-1', assigned_vehicle_id: 'v-1' },
      // Sold, 3 Nov only, guide g-2.
      { id: 'i-2', org_id: 'org-1', status: 'completed', start_date: '2026-11-03', end_date: '2026-11-03', assigned_guide_id: 'g-2', assigned_vehicle_id: null },
      // Not sold, or not ours: not counted.
      { id: 'i-3', org_id: 'org-1', status: 'draft', start_date: '2026-11-03', end_date: '2026-11-03' },
      { id: 'i-4', org_id: 'org-2', status: 'confirmed', start_date: '2026-11-03', end_date: '2026-11-03' },
    ],
    tour_departures: [
      // Running with seats taken (a pending hold): one group 3–5 Nov.
      { id: 'd-1', org_id: 'org-1', status: 'open', start_date: '2026-11-03', end_date: '2026-11-05', max_pax: 10, booked_pax: 0 },
      // Nobody on it, or cancelled: not a group.
      { id: 'd-2', org_id: 'org-1', status: 'open', start_date: '2026-11-03', end_date: '2026-11-05', max_pax: 10, booked_pax: 0 },
      { id: 'd-3', org_id: 'org-1', status: 'cancelled', start_date: '2026-11-03', end_date: '2026-11-05', max_pax: 10, booked_pax: 4 },
    ],
    departure_bookings: [{ id: 'h-1', org_id: 'org-1', departure_id: 'd-1', pax: 2, status: 'pending' }],
    ...over,
  })
  client = createMockClient()
}

beforeEach(() => seed())

describe('#2 groups out are counted', () => {
  it('pure: trips on the road each day; distinct guides and vehicles', () => {
    const loads = dayLoads(['2026-11-01', '2026-11-03'], [
      { start_date: '2026-11-02', end_date: '2026-11-04', assigned_guide_id: 'g-1' },
      { start_date: '2026-11-03', end_date: '2026-11-03', assigned_guide_id: 'g-1', assigned_vehicle_id: 'v-1' },
    ])
    expect(loads.get('2026-11-01')).toEqual({ groups: 0, guides: 0, vehicles: 0 })
    expect(loads.get('2026-11-03')).toEqual({ groups: 2, guides: 1, vehicles: 1 })
  })

  it('the Capacity page gets each day\'s count from sold trips and running departures', async () => {
    const r = await json(await listCapacity(new Request('http://x/api/capacity?start_date=2026-11-01&end_date=2026-11-05') as never))
    expect(r.body.loads['2026-11-01']).toEqual({ groups: 0, guides: 0, vehicles: 0 })
    expect(r.body.loads['2026-11-02']).toEqual({ groups: 1, guides: 1, vehicles: 1 })
    expect(r.body.loads['2026-11-03']).toEqual({ groups: 3, guides: 2, vehicles: 1 })
    expect(r.body.loads['2026-11-05']).toEqual({ groups: 1, guides: 0, vehicles: 0 })
  })

  it('a day with no entry is 3 slots minus the groups out; a stored row, its max minus them; never negative', () => {
    expect(capacityDayDetail('2026-11-01', null, { groups: 1, guides: 0, vehicles: 0 })).toEqual({ date: '2026-11-01', status: 'available', available_slots: 2 })
    expect(capacityDayDetail('2026-11-03', { status: 'busy', max_groups: 2, reason: 'Fair' }, { groups: 3, guides: 0, vehicles: 0 }))
      .toEqual({ date: '2026-11-03', status: 'busy', available_slots: 0, reason: 'Fair' })
  })

  it('/api/capacity/check: a Busy day whose slots are taken by sold trips is fully booked', async () => {
    const r = await json(await checkCapacity(post({ start_date: '2026-11-03' })))
    expect(r.body.data).toMatchObject({ available: false, status: 'busy' })
    expect(r.body.data.details[0]).toMatchObject({ available_slots: 0 })
  })
})

describe('#3 Max guides and vehicles are checked', () => {
  it('a day over a limit is named', () => {
    expect(overLimits({ max_groups: 2, max_guides: 1, max_vehicles: null }, { groups: 3, guides: 2, vehicles: 1 }))
      .toEqual(['groups 3/2', 'guides 2/1'])
    expect(overLimits({ max_groups: 5, max_guides: null, max_vehicles: 1 }, { groups: 1, guides: 3, vehicles: 1 })).toEqual([])
    expect(overLimits(null, { groups: 4, guides: 0, vehicles: 0 })).toEqual(['groups 4/3'])
  })
})

describe('#4 the WhatsApp assistant counts like the check', () => {
  const ask = async (input: Record<string, unknown>) => {
    const before = createMock.mock.calls.length
    createMock
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'check_availability', input }] })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })
    await new WhatsAppAIAgent().generateResponse('dates?', {
      orgId: 'org-1', clientId: null, clientName: null, phoneNumber: '+1', conversationId: 'c', recentMessages: [],
    } as any, client)
    const toolResult = createMock.mock.calls[before + 1][0].messages.at(-1).content[0]
    return JSON.parse(toolResult.content)
  }

  beforeEach(() => createMock.mockReset())

  it('a party of 2 is ONE group: a Busy day with one slot left is open to it', async () => {
    seed({ itineraries: [{ id: 'i-1', org_id: 'org-1', status: 'confirmed', start_date: '2026-11-03', end_date: '2026-11-03' }], tour_departures: [] })
    const r = await ask({ start_date: '2026-11-03', group_size: 2 })
    expect(r.data.availability.details[0]).toMatchObject({ status: 'busy', available_slots: 1 })
    expect(r.data.availability.available).toBe(true)
  })

  it('an empty day has 3 slots (not 3 − the party), dates stepped as strings', async () => {
    seed({ itineraries: [], tour_departures: [] })
    const r = await ask({ start_date: '2026-11-08', end_date: '2026-11-09', group_size: 5 })
    expect(r.data.availability.details).toEqual([
      { date: '2026-11-08', status: 'available', available_slots: 3 },
      { date: '2026-11-09', status: 'available', available_slots: 3 },
    ])
    expect(src('lib/ai/whatsapp-ai-agent.ts')).not.toContain('3 - groupSize')
    expect(src('lib/ai/whatsapp-ai-agent.ts')).not.toContain('cur.setDate(')
  })

  it('departures it offers have the seats free once holds are counted', async () => {
    seed({ tour_departures: [{ id: 'd-1', org_id: 'org-1', status: 'open', start_date: '2026-11-03', end_date: '2026-11-05', max_pax: 3, booked_pax: 0 }] })
    expect((await ask({ start_date: '2026-11-03', group_size: 2, check_departures: true })).data.departures).toEqual([])
    seed({ tour_departures: [{ id: 'd-1', org_id: 'org-1', status: 'open', start_date: '2026-11-03', end_date: '2026-11-05', max_pax: 4, booked_pax: 0 }] })
    expect((await ask({ start_date: '2026-11-03', group_size: 2, check_departures: true })).data.departures[0]).toMatchObject({ id: 'd-1', seats_free: 2 })
  })

  it('determineCapacityResult is given one group', () => {
    expect(determineCapacityResult([{ date: 'd', status: 'busy', available_slots: 1 }], 1).available).toBe(true)
  })
})

describe('#5 counts are validated; a day can be reset; a limit cleared', () => {
  it('pure: whole numbers ≥ 0; max guides / vehicles may be null', () => {
    expect(capacityInputError({ max_groups: 2, max_guides: null })).toBeNull()
    expect(capacityInputError({ max_groups: -1 })).toMatch(/max_groups/)
    expect(capacityInputError({ max_groups: 1.5 })).toMatch(/max_groups/)
    expect(capacityInputError({ max_groups: null })).toMatch(/max_groups/)
    expect(capacityInputError({ status: 'closed' })).toMatch(/Invalid status/)
  })

  it('POST refuses a bad count with 400 (not 500) and writes nothing', async () => {
    const r = await json(await saveCapacity(post({ entries: [{ date: '2026-11-10', max_groups: -2 }] })))
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/2026-11-10: max_groups must be a whole number/)
    const rows = (await (createMockClient().from('operator_capacity') as any).select('*')).data
    expect(rows).toHaveLength(1)
  })

  it('PUT refuses a bad count; null clears a guide limit', async () => {
    const bad = await putDay(new Request('http://x', { method: 'PUT', body: JSON.stringify({ max_vehicles: 'lots' }) }) as never, { params: Promise.resolve({ date: '2026-11-03' }) })
    expect(bad.status).toBe(400)
    const ok = await json(await putDay(new Request('http://x', { method: 'PUT', body: JSON.stringify({ max_guides: null }) }) as never, { params: Promise.resolve({ date: '2026-11-03' }) }))
    expect(ok.status).toBe(200)
    expect(ok.body.data.max_guides).toBeNull()
    expect(ok.body.data.max_groups).toBe(2)
  })

  it('DELETE resets a range to "not set"; a reversed range is refused', async () => {
    expect((await resetCapacity(new Request('http://x/api/capacity?start_date=2026-11-04&end_date=2026-11-01', { method: 'DELETE' }) as never)).status).toBe(400)
    expect((await resetCapacity(new Request('http://x/api/capacity?start_date=2026-11-01&end_date=2026-11-04', { method: 'DELETE' }) as never)).status).toBe(200)
    expect((await (createMockClient().from('operator_capacity') as any).select('*')).data).toEqual([])
  })

  it('the page opens on the user\'s own month, can reset days and clear limits', () => {
    const s = src('app/departures/_views/CapacityView.tsx')
    expect(s).not.toContain('today.getUTCMonth()')
    expect(s).toContain('Number(todayLocal().slice(5, 7)) - 1')
    expect(s).toContain("fetch(`/api/capacity?start_date=${first}&end_date=${last}`, { method: 'DELETE' })")
    expect(s).toContain("max_guides: e.target.value === '' ? null : Number(e.target.value)")
  })
})
