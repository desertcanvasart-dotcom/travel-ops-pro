// Every dashboard route uses createServerClient(), which is SERVICE-ROLE: it
// bypasses RLS, so nothing filters its queries except what is written in the
// route. /api/dashboard/summary and /api/dashboard/attention had no org filter
// at all, and every figure on the operator's morning screen counted EVERY
// organisation's rows.
//
// That is the real defect behind the QA audit's "Dashboard says 7 client
// quotes, the Itineraries list says 1": the 7 included another org's trip and
// the B2B trips the list deliberately hides. The list was right.
//
// The P&L already has an end-to-end guard for exactly this class
// (e2e/smoke.authed.spec.ts, "P&L returns ONLY the caller's own org"). These
// tests are the cheap always-on version for the dashboard.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

/** Comments explain the rule; they must not be able to satisfy it. */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ROUTES = [
  'app/api/dashboard/summary/route.ts',
  'app/api/dashboard/attention/route.ts',
  'app/api/dashboard/money/route.ts',
]

/**
 * Tables that carry org_id and therefore MUST be filtered by it.
 *
 * tasks, whatsapp_conversations, email_conversations and client_followups are
 * deliberately absent: they have no org_id column at all, so `.eq('org_id')`
 * against them returns a 400. Scoping those is the deferred G1 work.
 */
const ORG_SCOPED_TABLES = ['bookings', 'clients', 'itineraries', 'payments']

describe.each(ROUTES)('%s', route => {
  const code = stripComments(src(route))

  it('resolves the caller org and refuses without one', () => {
    expect(code).toContain('getCurrentOrgId()')
    expect(code).toMatch(/if \(!orgId\) return noOrgResponse\(\)/)
  })

  it('filters by org_id at least once per org-scoped table it queries', () => {
    const queried = ORG_SCOPED_TABLES.filter(t => code.includes(`from('${t}')`))
    // Every one of these routes touches at least one of them.
    expect(queried.length).toBeGreaterThan(0)

    const scopeCount = (code.match(/\.eq\('org_id', orgId\)/g) || []).length
    expect(scopeCount).toBeGreaterThanOrEqual(queried.length)
  })

  it('never queries an org-scoped table without an org filter somewhere after it', () => {
    // Each `from('<table>')` for a scoped table must have `.eq('org_id', orgId)`
    // before the next `from(` or the end of the statement — i.e. in its own chain.
    const offenders: string[] = []
    for (const table of ORG_SCOPED_TABLES) {
      const re = new RegExp(`from\\('${table}'\\)`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(code)) !== null) {
        const rest = code.slice(m.index)
        const nextFrom = rest.indexOf('from(', 1)
        const chain = nextFrom === -1 ? rest : rest.slice(0, nextFrom)
        if (!chain.includes(".eq('org_id', orgId)")) offenders.push(`${table} @ ${m.index}`)
      }
    }
    expect(offenders, `unscoped queries in ${route}: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('the quote counter counts what the Itineraries list shows', () => {
  const code = stripComments(src('app/api/dashboard/summary/route.ts'))
  const list = stripComments(src('app/api/itineraries/route.ts'))

  it('both exclude b2b_custom, so the two screens cannot disagree', () => {
    // The Itineraries list hides B2B trips unless ?include_b2b=true. The
    // dashboard counted them, which is half of "7 quotes vs 1 itinerary".
    expect(list).toContain("not('source', 'eq', 'b2b_custom')")
    expect(code).toContain("not('source', 'eq', 'b2b_custom')")
  })
})
