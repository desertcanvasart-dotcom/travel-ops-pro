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

describe('CI runs the linter', () => {
  it('has a step that actually invokes it', () => {
    expect(ciSteps, 'ci.yml must run `npm run lint` — without it the error set drifts back').toMatch(
      /run:\s*npm run lint\b/,
    )
  })

  it('does not neuter it with a flag that swallows failures', () => {
    // `|| true`, `continue-on-error`, or `--max-warnings` set absurdly high on
    // this step would leave the step present and the gate gone — the worst
    // outcome, because it still LOOKS enforced.
    const step = ciSteps.slice(ciSteps.indexOf('npm run lint'))
    expect(step.slice(0, 200)).not.toMatch(/\|\|\s*true/)
    expect(step.slice(0, 200)).not.toMatch(/continue-on-error:\s*true/)
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
