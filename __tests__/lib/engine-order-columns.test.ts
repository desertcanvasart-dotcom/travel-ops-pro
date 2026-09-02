import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Every `.from('table') … .order('column')` chain in the pricing engine must
// name a column the generated schema knows for THAT table. PostgREST rejects
// an unknown ORDER BY column with an error, the engine reads the error as
// "no rate", and the quote grows a hole for a rate that exists. That is
// exactly what happened on 2026-09-02: hotels were ordered by is_preferred,
// a column only nile_cruises has, and every hotel night went unpriced in
// production for a day. The mock database sorts anything, so only a schema
// check catches it.

const ROOT = path.resolve(__dirname, '..', '..')
const types = readFileSync(path.join(ROOT, 'types/database.types.ts'), 'utf8')

function columnsOf(table: string): Set<string> {
  const start = types.indexOf(`\n      ${table}: {\n        Row: {`)
  if (start < 0) throw new Error(`table ${table} not in database.types.ts`)
  const end = types.indexOf('        Insert:', start)
  const block = types.slice(start, end)
  return new Set([...block.matchAll(/^\s{10}(\w+)\??:/gm)].map(m => m[1]))
}

function orderChains(source: string): { table: string; column: string }[] {
  const out: { table: string; column: string }[] = []
  const re = /\.from\('(\w+)'\)([\s\S]*?)(?=\.from\('|\n\s*\n\s*\n|$)/g
  for (const m of source.matchAll(re)) {
    const table = m[1]
    for (const o of m[2].matchAll(/\.order\('(\w+)'/g)) out.push({ table, column: o[1] })
  }
  return out
}

describe('pricing engine ORDER BY columns exist', () => {
  const files = ['lib/auto-pricing-service.ts', 'app/api/b2b/calculate-price/route.ts']
  for (const f of files) {
    it(f, () => {
      const src = readFileSync(path.join(ROOT, f), 'utf8')
      const chains = orderChains(src)
      expect(chains.length).toBeGreaterThan(0)
      const bad = chains.filter(c => !columnsOf(c.table).has(c.column))
      expect(bad, JSON.stringify(bad)).toEqual([])
    })
  }
})
