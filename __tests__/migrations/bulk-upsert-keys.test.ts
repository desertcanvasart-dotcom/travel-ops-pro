// Every table the bulk CSV importer serves upserts with
// ON CONFLICT (<uniqueKey>). Postgres requires a UNIQUE constraint behind an
// ON CONFLICT target — without one, EVERY imported row fails with "there is
// no unique or exclusion constraint matching the ON CONFLICT specification".
//
// That is exactly what shipped: most rate tables had UNIQUE (service_code),
// but transportation_rates, flight_rates and fixed_daily_costs did not, so
// importing any of them failed on every row (operator hit transportation
// first, 2026-09-01). The import UI, the sample CSV and the validator all
// worked — only the final upsert died, per row, at runtime.
//
// This test closes the drift: for each RATE_TABLE_CONFIGS entry, the schema
// sources (the baseline dump or a migration) must declare a UNIQUE
// constraint on that table's upsert key. Migrations must declare theirs as
// LITERAL `ADD CONSTRAINT <table>_<col>_key UNIQUE (<col>)` statements —
// dynamic EXECUTE format(...) constraints are invisible to this check, and
// invisible is how the gap survived this long.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

function upsertKeys(): Array<[string, string]> {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'bulk-rate-service.ts'), 'utf8')
  const out: Array<[string, string]> = []
  const re = /tableName: '([a-z_]+)',\s*\n\s*displayName: '[^']+',\s*\n\s*uniqueKey: \['([a-z_]+)'\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) out.push([m[1], m[2]])
  return out
}

function schemaSources(): string {
  const dir = path.join(ROOT, 'migrations')
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
}

describe('bulk importer upsert keys', () => {
  const keys = upsertKeys()

  it('parses the importer configs (sanity)', () => {
    expect(keys.length).toBeGreaterThanOrEqual(10)
    expect(keys).toContainEqual(['transportation_rates', 'service_code'])
  })

  it('every upsert key is backed by a declared UNIQUE constraint', () => {
    const sql = schemaSources()
    const missing = keys.filter(([tbl, col]) => {
      // pg_dump's baseline shape and a migration's literal shape both match:
      //   ADD CONSTRAINT <anything> UNIQUE (col)  near  <table>
      const re = new RegExp(
        `ALTER TABLE (?:ONLY )?(?:public\\.)?${tbl}\\b[\\s\\S]{0,300}?ADD CONSTRAINT [a-z_]+ UNIQUE \\(${col}\\)`
      )
      return !re.test(sql)
    })
    expect(
      missing,
      'no UNIQUE constraint declared for these upsert keys — CSV import of ' +
        'these tables will fail on every row. Add a literal ADD CONSTRAINT ' +
        'to a migration (dynamic EXECUTE constraints are invisible here on purpose).'
    ).toEqual([])
  })
})
