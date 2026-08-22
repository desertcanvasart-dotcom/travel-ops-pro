// itinerary_services has no `day_id` column — it is `itinerary_day_id`. Three
// routes filtered on the wrong name anyway, and each one failed on every call
// with 42703 for as long as it existed: generate-commissions (fixed 2026-08-12),
// the per-service GET/PUT/DELETE and the client-delete cascade (both fixed
// 2026-08-22). Nothing in tsc or the build can see a column name inside a
// query string, so this scans the source instead.
//
// Since 20260822_service_sold_by.sql the table also carries a SECOND foreign
// key to suppliers, so any embed of suppliers from itinerary_services must name
// its column (`suppliers!supplier_id`) or PostgREST refuses it as ambiguous.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const SOURCES = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]
const rel = (f: string) => path.relative(ROOT, f)

/** Source with comments removed — a comment that DESCRIBES the bug must not trip the scan. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

describe('itinerary_services queries', () => {
  it("never filter, select or order on a 'day_id' column", () => {
    const offenders: string[] = []
    for (const file of SOURCES) {
      const src = code(fs.readFileSync(file, 'utf8'))
      // .eq('day_id' / .in('day_id' / .order('day_id' / .neq('day_id' …
      const hits = [...src.matchAll(/\.(eq|neq|in|order|is|gt|lt|gte|lte|like)\(\s*['"]day_id['"]/g)]
      for (const h of hits) {
        const line = src.slice(0, h.index).split('\n').length
        offenders.push(`${rel(file)}:${line}`)
      }
    }
    expect(offenders, 'itinerary_services has no day_id column — use itinerary_day_id').toEqual([])
  })

  it('name the foreign key on every suppliers embed from itinerary_services', () => {
    const offenders: string[] = []
    for (const file of SOURCES) {
      const src = code(fs.readFileSync(file, 'utf8'))
      if (!src.includes("from('itinerary_services')")) continue
      // Walk each .from('itinerary_services') … .select(…) block.
      const blocks = src.split("from('itinerary_services')").slice(1)
      for (const block of blocks) {
        const selectEnd = block.indexOf(')', block.indexOf('.select('))
        const select = block.indexOf('.select(') >= 0 ? block.slice(0, Math.max(selectEnd, 0) + 2000) : ''
        // Only the first select after this from(): stop at the next chained from(
        const scope = select.split('.from(')[0]
        for (const m of scope.matchAll(/suppliers\s*(?:!|\()/g)) {
          if (m[0].endsWith('(')) offenders.push(`${rel(file)}: unhinted "${m[0].trim()}"`)
        }
      }
    }
    expect(offenders, 'two FKs point at suppliers — embed as suppliers!supplier_id or suppliers!sold_by_supplier_id').toEqual([])
  })
})
