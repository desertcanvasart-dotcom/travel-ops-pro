// Tenancy follow-ups (migration 20261209), with two companies' fixtures:
//   - the WhatsApp activity log takes a TEAM MEMBER of the caller's company
//     (it referenced sales_agents, so these writes always failed — the
//     database half of that is __tests__/migrations/tenancy-followups.test.ts);
//   - preferences are read and written per (person, active company);
//   - the invoice-reminder cron caps and sends per organisation;
//   - the tour template GET returns its real day plan and prices; the legacy
//     days routes embed relations that exist; the legacy save no longer
//     writes columns that do not exist.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

const ctx = vi.hoisted(() => ({ orgId: 'org-a' as string | null, userId: 'u-both' as string | null }))
const mail = vi.hoisted(() => ({ sends: [] as Array<{ to: string; orgId: string; subject: string; html: string }> }))

function client() {
  return {
    ...createMockClient(),
    auth: { getUser: async () => ({ data: { user: ctx.userId ? { id: ctx.userId } : null }, error: null }) },
  }
}

vi.mock('@supabase/supabase-js', async (orig) => ({
  ...(await orig<typeof import('@supabase/supabase-js')>()),
  createClient: () => client(),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => client() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }), headers: async () => new Headers() }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => client(), supabaseServer: client() }))
vi.mock('@/lib/auth/current-org', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getCurrentOrgId: async () => ctx.orgId,
    getCurrentUserId: async () => ctx.userId,
    getCurrentUserRole: async () => 'admin',
    requireRole: async () => null,
    noOrgResponse: () => NextResponse.json({ success: false }, { status: 403 }),
  }
})
vi.mock('@/lib/notifications', () => ({ createNotification: async () => ({ success: true }) }))
vi.mock('@/lib/support/job-runs', () => ({
  withJobRun: (_name: string, _db: unknown, handler: unknown) => handler,
  jobRunHeaders: () => ({}),
}))
vi.mock('@/lib/org-identity', () => ({
  businessIdentity: () => ({ name: 'Default' }),
  htmlIdentity: (i: { name: string }) => ({ name: i.name }),
  orgIdentity: async (orgId: string) => ({ name: orgId === 'org-a' ? 'ATS' : 'Travel2Egypt' }),
}))
vi.mock('@/lib/today', () => ({ todayLocal: () => '2026-10-13', businessToday: () => '2026-10-13' }))
vi.mock('@/lib/email-send', () => ({
  sendEmailInternal: async (p: { to: string; orgId: string; subject: string; html: string }) => {
    mail.sends.push(p)
    return { success: true }
  },
}))

import * as activity from '@/app/api/whatsapp/activity/route'
import * as conversations from '@/app/api/whatsapp/conversations/route'
import * as assign from '@/app/api/whatsapp/conversations/assign/route'
import * as userPreferences from '@/app/api/user-preferences/route'
import { getUserPreferences } from '@/lib/ai/user-preferences'
import * as reminders from '@/app/api/cron/send-reminders/route'
import { internalCronToken } from '@/lib/cron/auth'
import * as template from '@/app/api/tours/templates/[id]/route'
import * as days from '@/app/api/tours/days/route'
import * as dayById from '@/app/api/tours/days/[id]/route'
import * as saveTour from '@/app/api/tours/save/route'

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const req = (url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) =>
  new NextRequest(`http://x${url}`, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })

let T: Record<string, Record<string, unknown>[]>
function tables(extra: Record<string, Record<string, unknown>[]> = {}) {
  T = {
    organizations: [
      { id: 'org-a', default_currency: 'JPY', default_margin_percent: 20, rate_currency: 'JPY' },
      { id: 'org-b', default_currency: 'EUR', default_margin_percent: 30, rate_currency: 'EUR' },
    ],
    team_members: [
      { id: 'tm-a', org_id: 'org-a', user_id: 'u-a', name: 'A agent', is_active: true },
      { id: 'tm-b', org_id: 'org-b', user_id: 'u-b', name: 'B agent', is_active: true },
    ],
    whatsapp_conversations: [
      { id: 'wc-a', org_id: 'org-a', phone_number: '+1', client_name: 'A client' },
      { id: 'wc-b', org_id: 'org-b', phone_number: '+2', client_name: 'B client' },
    ],
    conversation_activity: [
      { id: 'act-a', conversation_id: 'wc-a', agent_id: 'tm-a', action_type: 'assigned', conversation: { org_id: 'org-a' } },
      { id: 'act-b', conversation_id: 'wc-b', agent_id: 'tm-b', action_type: 'assigned', conversation: { org_id: 'org-b' } },
    ],
    ...extra,
  }
  setMockTables(T)
}

beforeEach(() => {
  ctx.orgId = 'org-a'
  ctx.userId = 'u-both'
  mail.sends.length = 0
  tables()
})

// ---------------------------------------------------------------------------
describe('WhatsApp activity log: team members of the caller’s company', () => {
  it('POST writes agent_id and team_member_id as the team member', async () => {
    const res = await activity.POST(req('/api/whatsapp/activity', { method: 'POST', body: { conversation_id: 'wc-a', agent_id: 'tm-a', action_type: 'replied' } }))
    expect(res.status).toBe(200)
    expect(T.conversation_activity.at(-1)).toMatchObject({ conversation_id: 'wc-a', agent_id: 'tm-a', team_member_id: 'tm-a', action_type: 'replied' })
  })

  it("POST refuses another company's team member, and another company's conversation", async () => {
    expect((await activity.POST(req('/api/whatsapp/activity', { method: 'POST', body: { conversation_id: 'wc-a', agent_id: 'tm-b', action_type: 'replied' } }))).status).toBe(400)
    expect((await activity.POST(req('/api/whatsapp/activity', { method: 'POST', body: { conversation_id: 'wc-b', action_type: 'viewed' } }))).status).toBe(404)
    expect(T.conversation_activity).toHaveLength(2)
  })

  it("GET lists only the caller's company's history", async () => {
    const json: any = await (await activity.GET(req('/api/whatsapp/activity'))).json()
    expect(json.activities.map((a: any) => a.id)).toEqual(['act-a'])
  })

  it('the agent is embedded through the team_members foreign key, and nothing reads sales_agents', () => {
    const s = src('app/api/whatsapp/activity/route.ts')
    expect(s).toContain("agent:team_members!conversation_activity_agent_id_fkey(id, name, email, avatar_url)")
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(e => {
      const f = join(dir, e)
      return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx|mjs|js)$/.test(e) ? [f] : []
    })
    const users = ['app', 'lib', 'components', 'scripts'].flatMap(d => walk(join(process.cwd(), d)))
      // A read, write, embed or RPC — comments may still tell the history.
      .filter(f => /from\(['"]sales_agents['"]\)|:sales_agents[(!]|rpc\(['"](assign_conversation|get_next_available_agent)['"]/.test(readFileSync(f, 'utf8')))
    expect(users).toEqual([])
  })

  it('assigning a conversation logs the activity with the team member', async () => {
    const res = await assign.POST(req('/api/whatsapp/conversations/assign', { method: 'POST', body: { conversation_id: 'wc-a', agent_id: 'tm-a', action: 'assign' } }))
    expect(res.status).toBe(200)
    expect(T.conversation_activity.at(-1)).toMatchObject({ conversation_id: 'wc-a', agent_id: 'tm-a', team_member_id: 'tm-a', action_type: 'assigned' })
  })

  it("a status change logs only a team member of the caller's company", async () => {
    await conversations.PATCH(req('/api/whatsapp/conversations', { method: 'PATCH', body: { conversation_id: 'wc-a', action: 'archive', agent_id: 'tm-a' } }))
    expect(T.conversation_activity.at(-1)).toMatchObject({ agent_id: 'tm-a', team_member_id: 'tm-a', action_type: 'status_changed' })
    await conversations.PATCH(req('/api/whatsapp/conversations', { method: 'PATCH', body: { conversation_id: 'wc-a', action: 'unarchive', agent_id: 'tm-b' } }))
    expect(T.conversation_activity).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
describe('preferences per (person, active company)', () => {
  const prefs = () => [
    { id: 'p-a', user_id: 'u-both', org_id: 'org-a', default_cost_mode: 'auto', default_tier: 'deluxe', default_margin_percent: 22, default_currency: 'JPY' },
    { id: 'p-b', user_id: 'u-both', org_id: 'org-b', default_cost_mode: 'auto', default_tier: 'luxury', default_margin_percent: 35, default_currency: 'EUR' },
    { id: 'p-other', user_id: 'u-a', org_id: 'org-a', default_cost_mode: 'manual', default_tier: 'budget', default_margin_percent: 10, default_currency: 'USD' },
  ]

  it('GET reads the row of the active company — a person in both sees each one in its workspace', async () => {
    tables({ user_preferences: prefs() })
    const a: any = await (await userPreferences.GET(req('/api/user-preferences'))).json()
    expect(a.data).toMatchObject({ id: 'p-a', default_tier: 'deluxe', default_margin_percent: 22, default_currency: 'JPY' })
    ctx.orgId = 'org-b'
    const b: any = await (await userPreferences.GET(req('/api/user-preferences'))).json()
    expect(b.data).toMatchObject({ id: 'p-b', default_tier: 'luxury', default_margin_percent: 35, default_currency: 'EUR' })
  })

  it("no row in this company: the company's defaults, not the other company's row", async () => {
    tables({ user_preferences: [prefs()[1]] })
    const a: any = await (await userPreferences.GET(req('/api/user-preferences'))).json()
    expect(a.data).toMatchObject({ default_currency: 'JPY', default_margin_percent: 20, default_tier: 'standard' })
    expect(a.data.id).toBeUndefined()
  })

  it('PUT writes the active company’s row only, stamped', async () => {
    tables({ user_preferences: prefs() })
    ctx.orgId = 'org-b'
    const res = await userPreferences.PUT(req('/api/user-preferences', { method: 'PUT', body: { default_tier: 'standard', default_margin_percent: 40, default_currency: 'GBP' } }))
    expect(res.status).toBe(200)
    const rows = T.user_preferences.filter(r => r.user_id === 'u-both')
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.org_id === 'org-b')).toMatchObject({ default_margin_percent: 40, default_currency: 'GBP' })
    expect(rows.find(r => r.org_id === 'org-a')).toMatchObject({ default_margin_percent: 22, default_currency: 'JPY' })
    expect(src('app/api/user-preferences/route.ts')).toContain("onConflict: 'user_id,org_id'")
  })

  it('PUT creates the row for a company the person has none in yet', async () => {
    tables({ user_preferences: [prefs()[0]] })
    ctx.orgId = 'org-b'
    await userPreferences.PUT(req('/api/user-preferences', { method: 'PUT', body: { default_margin_percent: 33 } }))
    expect(T.user_preferences.map(r => r.org_id).sort()).toEqual(['org-a', 'org-b'])
  })

  it('PUT with no active company is refused', async () => {
    ctx.orgId = null
    expect((await userPreferences.PUT(req('/api/user-preferences', { method: 'PUT', body: {} }))).status).toBe(403)
  })

  it('itinerary generation uses the active company’s row', async () => {
    tables({ user_preferences: prefs() })
    ctx.orgId = 'org-b'
    expect(await getUserPreferences(client())).toMatchObject({ default_margin_percent: 35, default_currency: 'EUR' })
    ctx.orgId = 'org-a'
    expect(await getUserPreferences(client())).toMatchObject({ default_margin_percent: 22, default_currency: 'JPY' })
  })

  it('the browser no longer reads user_preferences directly (it cannot know the active company)', () => {
    for (const f of ['app/settings/page.tsx', 'app/whatsapp-parser/whatsapp-parser-content.tsx']) {
      expect(src(f), f).not.toContain("from('user_preferences')")
      expect(src(f), f).toContain("fetch('/api/user-preferences')")
    }
  })
})

// ---------------------------------------------------------------------------
describe('invoice reminders: per organisation', () => {
  const due = (org: string, n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({
    id: `${org}-inv-${String(i).padStart(3, '0')}`, org_id: org, invoice_number: `${org}-${i}`, status: 'sent',
    due_date: '2026-10-01', balance_due: 100, currency: 'EUR', reminder_paused: false,
    next_reminder_date: '2026-10-01', client_email: `${org}-${i}@example.com`, client_name: 'C', reminder_count: 0, ...extra,
  }))
  const run = async () => (await (reminders.GET as (r: NextRequest) => Promise<Response>)(
    req('/api/cron/send-reminders', { headers: { authorization: `Bearer ${internalCronToken()}` } }))).json()

  it("one company's backlog no longer uses the other's slots: each is capped on its own", async () => {
    // A's 60 invoices have all waited longer than B's 3.
    tables({ invoices: [...due('org-a', 60), ...due('org-b', 3, { next_reminder_date: '2026-10-10' })], invoice_reminders: [] })
    const body: any = await run()
    expect(body.sent).toBe(53)
    const byOrg = (org: string) => mail.sends.filter(s => s.orgId === org)
    expect(byOrg('org-a')).toHaveLength(50)
    expect(byOrg('org-b')).toHaveLength(3)
    expect(body.organizations).toEqual(expect.arrayContaining([
      expect.objectContaining({ org_id: 'org-a', due: 50, sent: 50 }),
      expect.objectContaining({ org_id: 'org-b', due: 3, sent: 3 }),
    ]))
  })

  it("each send is from, and signed by, the invoice's own company", async () => {
    tables({ invoices: [...due('org-a', 1), ...due('org-b', 1)], invoice_reminders: [] })
    await run()
    for (const s of mail.sends) {
      expect(s.to.startsWith(s.orgId)).toBe(true)
      expect(s.html).toContain(s.orgId === 'org-a' ? 'ATS' : 'Travel2Egypt')
      expect(s.html).not.toContain(s.orgId === 'org-a' ? 'Travel2Egypt' : 'ATS')
    }
    expect(T.invoices.every(i => i.reminder_count === 1)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('tour routes return real data', () => {
  const tourTables = () => tables({
    tour_templates: [{ id: 'tt-a', org_id: 'org-a', template_name: 'Cairo A' }, { id: 'tt-b', org_id: 'org-b', template_name: 'Cairo B' }],
    tour_variations: [
      { id: 'tv-a', org_id: 'org-a', template_id: 'tt-a', tier: 'standard' },
      { id: 'tv-b', org_id: 'org-b', template_id: 'tt-b', tier: 'standard' },
    ],
    tour_day_activities: [
      { id: 'da-2', template_id: 'tt-a', day_number: 2, sequence_order: 1, activity_type: 'attraction', activity_name: 'Saqqara' },
      { id: 'da-1', template_id: 'tt-a', day_number: 1, sequence_order: 1, activity_type: 'attraction', activity_name: 'Giza' },
      { id: 'db-1', template_id: 'tt-b', day_number: 1, sequence_order: 1, activity_type: 'attraction', activity_name: 'B only' },
    ],
    variation_pricing: [
      { id: 'vp-a', variation_id: 'tv-a', min_pax: 2, max_pax: 4, price_per_person: 500 },
      { id: 'vp-b', variation_id: 'tv-b', min_pax: 2, max_pax: 4, price_per_person: 900 },
    ],
    tours: [{ id: 'tour-a', org_id: 'org-a' }, { id: 'tour-b', org_id: 'org-b' }],
    tour_days: [
      { id: 'day-a', tour_id: 'tour-a', day_number: 1, city: 'Cairo' },
      { id: 'day-b', tour_id: 'tour-b', day_number: 1, city: 'Luxor' },
    ],
  })

  it("the template GET returns its day plan and its variations' prices — this company's only", async () => {
    tourTables()
    const json: any = await (await template.GET(req('/api/tours/templates/tt-a'), params({ id: 'tt-a' }))).json()
    expect(json.data.variations.map((v: any) => v.id)).toEqual(['tv-a'])
    expect(json.data.days.map((d: any) => d.activity_name)).toEqual(['Giza', 'Saqqara'])
    expect(json.data.pricing.map((p: any) => p.id)).toEqual(['vp-a'])
    expect((await template.GET(req('/api/tours/templates/tt-b'), params({ id: 'tt-b' }))).status).toBe(404)
  })

  it('the legacy days routes embed the rate tables tour_days references, and only this company’s tours', async () => {
    tourTables()
    const list: any = await (await days.GET(req('/api/tours/days'))).json()
    expect(list.data.map((d: any) => d.id)).toEqual(['day-a'])
    expect(list.data[0].activities).toEqual([])
    expect((await dayById.GET(req('/api/tours/days/day-b'), params({ id: 'day-b' }))).status).toBe(404)
    for (const f of ['app/api/tours/days/route.ts', 'app/api/tours/days/[id]/route.ts']) {
      const s = src(f)
      expect(s).toContain('accommodation:accommodation_rates!tour_days_accommodation_id_fkey')
      expect(s).toContain('lunch_meal:meal_rates!tour_days_lunch_meal_id_fkey')
      expect(s).toContain('dinner_meal:meal_rates!tour_days_dinner_meal_id_fkey')
      expect(s).toContain('guide:guide_rates!tour_days_guide_id_fkey')
      const select = s.slice(s.indexOf('const DAY_SELECT = `'), s.indexOf('`', s.indexOf('const DAY_SELECT = `') + 20))
      expect(select).not.toMatch(/hotel_contacts|restaurant_contacts|guides\(|tour_day_activities/)
    }
  })

  it('the legacy save writes the tour and its days, and no longer writes non-existent columns into tour_day_activities', async () => {
    tourTables()
    const res = await saveTour.POST(req('/api/tours/save', { method: 'POST', body: {
      tour: { tour_code: 'L-1', tour_name: 'Legacy', duration_days: 1, cities: ['Cairo'], days: [
        { day_number: 1, city: 'Cairo', activities: [{ activity_order: 1, activity_notes: 'x' }, { activity_order: 2 }] },
      ] },
      pax: 2, is_euro_passport: false,
    } }))
    const json: any = await res.json()
    expect(json.success).toBe(true)
    expect(json.activities_not_saved).toBe(2)
    expect(T.tours.at(-1)).toMatchObject({ tour_code: 'L-1', org_id: 'org-a' })
    expect(T.tour_days.at(-1)).toMatchObject({ tour_id: json.data.tour_id, city: 'Cairo' })
    expect(T.tour_day_activities).toHaveLength(3)
    expect(src('app/api/tours/save/route.ts')).not.toMatch(/tour_day_id:|entrance_id:|activity_order:/)
  })
})
