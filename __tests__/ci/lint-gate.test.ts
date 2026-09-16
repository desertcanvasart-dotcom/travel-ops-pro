// ============================================
// The linter is a gate, and stays one
// ============================================
// `npm run lint` reported 4508 problems and nothing ever ran it: there was no
// step in ci.yml, and Next 16 no longer lints during `next build`. A linter
// that has never been green cannot catch a regression, and the noise was
// hiding real defects — three React hook-order violations, and an entire stale
// git worktree under .claude/ being linted as though it were the app, which
// was doubling every count.
//
// The error set is now empty and CI runs it. These tests pin the two halves of
// that, because both are easy to undo by accident: deleting the step to make a
// red build go away, and demoting one more rule to warning to make an error go
// away. Neither should be silent.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
const config = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8')

/** ci.yml with comment lines stripped — the point is what CI RUNS, and the
 *  comments legitimately quote the old numbers to explain the history. */
const ciSteps = ci.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')

/**
 * The complete YAML step that contains `needle` — every key of it, in any
 * order.
 *
 * The check here used to start at `npm run lint` and read 200 characters
 * forward, which only ever saw the keys written BELOW `run:`. YAML mapping
 * keys are unordered, so `continue-on-error: true` written above it is just as
 * valid and would have switched the gate off while both assertions still
 * passed — the silent failure this file exists to prevent.
 */
export function stepContaining(yaml: string, needle: RegExp): string | null {
  const lines = yaml.split('\n')
  const at = lines.findIndex(l => needle.test(l))
  if (at === -1) return null
  // Back up to the '-' that opens this step...
  let start = at
  while (start > 0 && !/^\s*-\s/.test(lines[start])) start--
  const indent = lines[start].match(/^\s*/)![0].length
  // ...then forward to the next step at the same indent, or out of the list.
  let end = start + 1
  for (; end < lines.length; end++) {
    const line = lines[end]
    if (!line.trim()) continue
    const ind = line.match(/^\s*/)![0].length
    if (ind < indent) break
    if (ind === indent && /^\s*-\s/.test(line)) break
  }
  return lines.slice(start, end).join('\n')
}

describe('CI runs the linter', () => {
  it('has a step that actually invokes it', () => {
    expect(ciSteps, 'ci.yml must run `npm run lint` — without it the error set drifts back').toMatch(
      /run:\s*npm run lint\b/,
    )
  })

  it('does not neuter it with a flag that swallows failures', () => {
    // `|| true`, `continue-on-error`, or `--max-warnings` set absurdly high
    // would leave the step present and the gate gone — the worst outcome,
    // because it still LOOKS enforced. Read the WHOLE step, not a window
    // after `run:`.
    const step = stepContaining(ciSteps, /run:\s*npm run lint\b/)
    expect(step, 'no YAML step runs `npm run lint`').not.toBeNull()
    expect(step!).not.toMatch(/\|\|\s*true/)
    expect(step!).not.toMatch(/continue-on-error:\s*true/)
    // --max-warnings is allowed only where it makes the gate stricter.
    const maxWarnings = step!.match(/--max-warnings[= ](\d+)/)
    if (maxWarnings) expect(Number(maxWarnings[1])).toBe(0)
  })
})

describe('the step reader itself', () => {
  // The bug was in the READING, so the reading is what needs covering: a
  // synthetic workflow with the escape hatch written ABOVE `run:` — legal
  // YAML that the old 200-character window could not see.
  const yaml = [
    '    steps:',
    '      - name: Unit tests',
    '        run: npm test',
    '',
    '      - name: Lint',
    '        continue-on-error: true',
    '        run: npm run lint',
    '',
    '      - name: Build',
    '        run: npm run build',
  ].join('\n')

  it('sees a continue-on-error written above the run key', () => {
    const step = stepContaining(yaml, /run:\s*npm run lint\b/)
    expect(step).toContain('continue-on-error: true')
  })

  it('stops at the next step rather than swallowing the rest of the file', () => {
    const step = stepContaining(yaml, /run:\s*npm run lint\b/)
    expect(step).not.toContain('npm run build')
    expect(step).not.toContain('npm test')
  })

  it('returns null when nothing matches', () => {
    expect(stepContaining(yaml, /run:\s*npm run nonesuch\b/)).toBeNull()
  })
})

describe('the eslint config', () => {
  it('still ignores the harness worktrees', () => {
    // Without this, eslint lints a stale duplicate of the whole app: half the
    // errors found when this gate was built came from a worktree nobody had
    // opened in weeks. vitest.config.ts excludes them for the same reason.
    expect(config, 'eslint must ignore .claude/** — see vitest.config.ts for the same problem').toContain(
      '".claude/**"',
    )
  })

  it('keeps every demotion deliberate and few', () => {
    // A demotion is a decision made once, in the open, with a reason written
    // beside it. The failure mode this guards is the quiet one: each new error
    // answered with another "warn" until the gate means nothing. Raise this
    // number only alongside a comment saying why.
    const demoted = [...config.matchAll(/"([^"]+)":\s*"warn"/g)].map(m => m[1])
    expect(demoted.sort()).toEqual(['@typescript-eslint/no-explicit-any'])
  })

  it('keeps the characters that signal a real JSX defect', () => {
    // no-unescaped-entities was narrowed, not turned off: ' and " in prose are
    // noise, but a bare > or } in JSX text is almost always a broken tag or an
    // unclosed expression.
    expect(config).toMatch(/"react\/no-unescaped-entities":\s*\["error",\s*\{\s*forbid:\s*\[">",\s*"\}"\]/)
  })
})
