// The multi-destination campaign (#238/#239) renamed the old destinations
// table to destinations_legacy_2025; the NEW public.destinations has `name`,
// not `destination_name`, and tour_templates carries no FK to it
// (primary_destination_id still points at the legacy table). So a select
// embed of `destinations (destination_name)` can never resolve — and because
// a PostgREST embed with no relationship fails the WHOLE query (PGRST200,
// the invitations trap of 2026-09-01), the tour detail route 404'd EVERY
// tour, variation path and template fallback alike, from the rename until
// 2026-09-04. Nothing in tsc or the build can see a table name inside a
// query string, so this scans the source instead.
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

/** Source with comments removed — a comment that DESCRIBES the bug must not trip the scan. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

describe('no select embeds the renamed-away destinations shape', () => {
  const sources = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]

  it.each(sources.map(f => path.relative(ROOT, f)))('%s', file => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    // `destinations ( destination_name )` in a select is always the legacy
    // shape: the current destinations table has no destination_name column,
    // and the embed itself has no FK to resolve through — it fails the whole
    // query, not just the field.
    expect(
      /destinations\s*\(\s*destination_name/.test(code),
      `${file} embeds destinations(destination_name) — no such relationship exists since the destinations_legacy_2025 rename; this fails the WHOLE query with PGRST200`
    ).toBe(false)
  })
})
