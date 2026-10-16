// Writing rules reach the AI as "name: description". The prompt used to print
// r.rule_text — a column writing_rules never had — so every rule arrived as
// "- undefined" and none of them shaped the text. And since 20261208 each
// company's generator reads only its own rules and content.
import { describe, it, expect, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from '../_mock-supabase'
import {
  buildWritingRulesContext,
  fetchWritingRules,
  fetchContentLibrary,
  findCruiseContent,
  type WritingRule,
} from '@/lib/ai/content-library'

const rule = (over: Partial<WritingRule>): WritingRule =>
  ({ name: 'Warm tone', description: 'Write warmly', rule_type: 'enforce', category: 'tone', priority: 5, ...over })

describe('buildWritingRulesContext', () => {
  it('prints each rule as "name: description" under MUST follow / AVOID', () => {
    const ctx = buildWritingRulesContext([
      rule({}),
      rule({ name: 'No cliches', description: 'Never say breathtaking', rule_type: 'avoid' }),
    ])
    expect(ctx).toContain('MUST follow:\n- Warm tone: Write warmly\n')
    expect(ctx).toContain('AVOID:\n- No cliches: Never say breathtaking\n')
    expect(ctx).not.toContain('undefined')
  })

  it('never prints "undefined" — a rule missing a name or description prints what it has, an empty one nothing', () => {
    const ctx = buildWritingRulesContext([
      rule({ name: '', description: 'Only a description' }),
      rule({ name: 'Only a name', description: undefined as unknown as string }),
      rule({ name: undefined as unknown as string, description: undefined as unknown as string }),
    ])
    expect(ctx).toContain('- Only a description\n')
    expect(ctx).toContain('- Only a name\n')
    expect(ctx).not.toContain('undefined')
    expect(ctx.match(/^- /gm)).toHaveLength(2)
  })

  it('nothing when there are no rules', () => {
    expect(buildWritingRulesContext([])).toBe('')
  })

  // WR4: applies_to was ignored, Preferred rules and examples never reached the AI.
  it('keeps only rules for itineraries: applies_to itinerary or all (none counts as all)', () => {
    const ctx = buildWritingRulesContext([
      rule({ name: 'For all', applies_to: ['all'] }),
      rule({ name: 'For itineraries', applies_to: ['itinerary', 'email'] }),
      rule({ name: 'Unset', applies_to: [] }),
      rule({ name: 'Null', applies_to: null }),
      rule({ name: 'Email only', applies_to: ['email'] }),
      rule({ name: 'WhatsApp only', applies_to: ['whatsapp'] }),
    ])
    for (const n of ['For all', 'For itineraries', 'Unset', 'Null']) expect(ctx).toContain(`- ${n}:`)
    expect(ctx).not.toContain('Email only')
    expect(ctx).not.toContain('WhatsApp only')
    expect(buildWritingRulesContext([rule({ applies_to: ['email'] })])).toBe('')
  })

  it('Preferred rules come after MUST follow and AVOID, at most three', () => {
    const ctx = buildWritingRulesContext([
      ...[1, 2, 3, 4].map(i => rule({ name: `Pref ${i}`, rule_type: 'prefer' })),
      rule({ name: 'No cliches', rule_type: 'avoid' }),
      rule({}),
    ])
    expect(ctx.indexOf('MUST follow:')).toBeLessThan(ctx.indexOf('AVOID:'))
    expect(ctx.indexOf('AVOID:')).toBeLessThan(ctx.indexOf('PREFER where it fits:'))
    expect(ctx).toContain('- Pref 3:')
    expect(ctx).not.toContain('Pref 4')
  })

  it('one good and one bad example per rule, clipped', () => {
    const long = 'x'.repeat(400)
    const ctx = buildWritingRulesContext([
      rule({ examples: { good: ['', 'Sunrise over the Nile', 'second good'], bad: ['Breathtaking views', 'second bad'] } }),
      rule({ name: 'Only bad', rule_type: 'avoid', examples: { bad: [long] } }),
      rule({ name: 'No examples', examples: {} }),
    ])
    expect(ctx).toContain('- Warm tone: Write warmly\n  e.g. write "Sunrise over the Nile"; not "Breathtaking views"\n')
    expect(ctx).not.toContain('second')
    const badLine = ctx.split('\n').find(l => l.startsWith('  e.g. not "x'))!
    expect(badLine.length).toBeLessThan(200)
    expect(ctx).toContain('- No examples: Write warmly\n')
  })
})

describe('the generator reads only its company’s content', () => {
  beforeEach(() => {
    setMockTables({
      writing_rules: [
        { id: 'a', org_id: 'org-a', name: 'A rule', description: 'a', rule_type: 'enforce', is_active: true, priority: 1 },
        { id: 'b', org_id: 'org-b', name: 'B rule', description: 'b', rule_type: 'enforce', is_active: true, priority: 9 },
      ],
      content_variations: [
        { id: 'va', content_id: 'ca', tier: 'standard', is_active: true, description: 'A text',
          content_library: { id: 'ca', org_id: 'org-a', is_active: true, name: 'Giza', tags: [], location: 'Cairo', is_cruise: false, content_categories: { name: 'S', slug: 's' } } },
        { id: 'vb', content_id: 'cb', tier: 'standard', is_active: true, description: 'B text',
          content_library: { id: 'cb', org_id: 'org-b', is_active: true, name: 'Giza', tags: [], location: 'Cairo', is_cruise: false, content_categories: { name: 'S', slug: 's' } } },
      ],
      content_library: [
        { id: 'cruise-b', org_id: 'org-b', is_cruise: true, is_active: true, name: 'B cruise', content_variations: [] },
      ],
    })
  })

  it('writing rules', async () => {
    expect((await fetchWritingRules(createMockClient(), 'org-a')).map(r => r.name)).toEqual(['A rule'])
    expect(await fetchWritingRules(createMockClient(), null)).toEqual([])
  })

  it('content library', async () => {
    const items = await fetchContentLibrary(createMockClient(), 'org-a', 'standard', ['Cairo'], [])
    expect(items.map(i => i.description)).toEqual(['A text'])
    // CL5: a deactivated item is not used, though its variation is active.
    const db = createMockClient()
    const rows = (await db.from('content_variations').select()) as { data: { content_library: { is_active: boolean } }[] }
    rows.data[0].content_library.is_active = false
    expect(await fetchContentLibrary(db, 'org-a', 'standard', ['Cairo'], [])).toEqual([])
    expect(await fetchContentLibrary(createMockClient(), null, 'standard', ['Cairo'], [])).toEqual([])
  })

  it('cruise programmes: both lookups (by route, and the fallback) filter by the company', async () => {
    // The mock cannot embed content_variations as PostgREST does, so record
    // the filters each content_library query carries instead.
    const filters: string[][] = []
    const real = createMockClient()
    const client = {
      from: (t: string) => {
        const q = real.from(t)
        const seen: string[] = []
        if (t === 'content_library') filters.push(seen)
        const wrap = (b: any): any => new Proxy(b, {
          get(target, prop) {
            const v = target[prop]
            if (prop === 'eq') return (c: string, val: unknown) => { seen.push(`${c}=${String(val)}`); return wrap(v.call(target, c, val)) }
            return typeof v === 'function' && prop !== 'then' ? (...a: unknown[]) => wrap(v.apply(target, a)) : v
          },
        })
        return wrap(q)
      },
    }
    const r = await findCruiseContent(client, 'org-a', { isCruise: true, route: 'luxor-aswan' } as never, 'standard' as never, null)
    expect(r.found).toBe(false)
    expect(filters).toHaveLength(2)
    for (const f of filters) expect(f).toContain('org_id=org-a')
  })
})
