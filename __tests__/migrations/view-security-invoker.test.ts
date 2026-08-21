// A view created without `security_invoker` runs with the DEFINER's rights and
// bypasses RLS on its source tables. On 2026-08-21 that put 19 guide records,
// 6 airport-assistant records, 7 itineraries and 26 tour templates in reach of
// the anonymous internet — because `CREATE OR REPLACE VIEW` silently drops the
// option a previous migration had set.
//
// This test reads the migrations the way Postgres does — last definition wins —
// and fails if the final word on any view isn't caller-rights.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const MIGRATIONS = path.join(process.cwd(), 'migrations')

/** `CREATE [OR REPLACE] VIEW [public.]name` → view name, in file order. */
const CREATE_VIEW = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi
/** `ALTER VIEW [public.]name SET (security_invoker = on|true)` */
const ALTER_INVOKER =
  /alter\s+view\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+set\s*\(\s*security_invoker\s*=\s*(?:on|true)\s*\)/gi

type Event = { view: string; invoker: boolean; file: string; fileIndex: number; offset: number }

function timeline(): Event[] {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const events: Event[] = []

  files.forEach((file, fileIndex) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8')

    for (const m of sql.matchAll(CREATE_VIEW)) {
      // Does THIS statement carry the option inline? Look ahead to the
      // statement terminator only — a WITH clause on a later view doesn't count.
      const stmt = sql.slice(m.index!, sql.indexOf(';', m.index!) + 1 || undefined)
      const inline = /security_invoker\s*=\s*(?:on|true)/i.test(
        // The WITH clause sits between the view name and AS.
        stmt.slice(0, stmt.toLowerCase().indexOf(' as'))
      )
      events.push({ view: m[1].toLowerCase(), invoker: inline, file, fileIndex, offset: m.index! })
    }

    for (const m of sql.matchAll(ALTER_INVOKER)) {
      events.push({ view: m[1].toLowerCase(), invoker: true, file, fileIndex, offset: m.index! })
    }
  })

  // File order first, then position within the file — Postgres applies
  // them in exactly that sequence, and last definition wins.
  return events.sort((a, b) => a.fileIndex - b.fileIndex || a.offset - b.offset)
}

describe('view security_invoker', () => {
  it('leaves every view under caller rights after the last migration touching it', () => {
    const last = new Map<string, Event>()
    for (const e of timeline()) last.set(e.view, e)

    const definerRights = [...last.values()].filter((e) => !e.invoker)

    expect(
      definerRights.map((e) => `${e.view} (last touched by ${e.file})`),
      'views left running with definer rights — they bypass RLS on their source tables'
    ).toEqual([])
  })

  it('detects the regression it was written for', () => {
    // Guard against the matcher rotting into something that always passes:
    // the historical bad statement must still read as definer-rights.
    const bad = 'CREATE OR REPLACE VIEW public.guides AS SELECT id FROM suppliers;'
    const good = "CREATE OR REPLACE VIEW public.guides WITH (security_invoker = on) AS SELECT id FROM suppliers;"
    const inline = (sql: string) => {
      const m = [...sql.matchAll(CREATE_VIEW)][0]
      const stmt = sql.slice(m.index!, sql.indexOf(';', m.index!) + 1)
      return /security_invoker\s*=\s*(?:on|true)/i.test(stmt.slice(0, stmt.toLowerCase().indexOf(' as')))
    }
    expect(inline(bad)).toBe(false)
    expect(inline(good)).toBe(true)
  })
})
