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
 *
 * The step boundary is the indentation of the `steps:` entries, NOT "any line
 * beginning with a dash": a block scalar (`run: |`) may legitimately contain
 * such a line, and mistaking one for the start of the step would hide every
 * key above it — the same blindness in a new place.
 */
export function stepContaining(yaml: string, needle: RegExp): string | null {
  const lines = yaml.split('\n')
  const indentOf = (l: string) => l.match(/^\s*/)![0].length
  const at = lines.findIndex(l => needle.test(l))
  if (at === -1) return null

  // The `steps:` key enclosing the match...
  let stepsAt = -1
  for (let i = at; i >= 0; i--) {
    if (/^\s*steps:\s*$/.test(lines[i])) { stepsAt = i; break }
  }
  if (stepsAt === -1) return null

  // ...and the indent its entries sit at. A block scalar's content must be
  // indented deeper than the key introducing it, so no scalar line can ever
  // land on this exact column.
  const stepsIndent = indentOf(lines[stepsAt])
  let entryIndent = -1
  for (let i = stepsAt + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    if (indentOf(lines[i]) <= stepsIndent) break
    if (/^\s*-\s/.test(lines[i])) { entryIndent = indentOf(lines[i]); break }
  }
  if (entryIndent === -1) return null

  const opensStep = (l: string) => indentOf(l) === entryIndent && /^\s*-\s/.test(l)

  let from = at
  while (from > stepsAt && !opensStep(lines[from])) from--
  if (!opensStep(lines[from])) return null

  let to = from + 1
  for (; to < lines.length; to++) {
    const line = lines[to]
    if (!line.trim()) continue
    if (indentOf(line) < entryIndent) break
    if (opensStep(line)) break
  }
  return lines.slice(from, to).join('\n')
}

/**
 * Why this step would NOT fail the build, or null if it genuinely would.
 *
 * Each of these leaves the step present and the gate gone — the worst
 * outcome, because it still LOOKS enforced.
 */
export function escapeHatchIn(step: string): string | null {
  if (/\|\|\s*true/.test(step)) return '`|| true` discards the exit code'
  if (/continue-on-error:\s*true/.test(step)) return 'continue-on-error: true'
  // ESLint reads a NEGATIVE limit as unlimited, so `--max-warnings -1` is the
  // quietest way of all to switch this off. Only 0 tightens the gate.
  const limit = step.match(/--max-warnings[= ](-?\d+)/)
  if (limit && Number(limit[1]) !== 0) return `--max-warnings ${limit[1]} — only 0 tightens the gate`
  return null
}

describe('CI runs the linter', () => {
  it('has a step that actually invokes it', () => {
    expect(ciSteps, 'ci.yml must run `npm run lint` — without it the error set drifts back').toMatch(
      /run:\s*npm run lint\b/,
    )
  })

  it('does not neuter it with a flag that swallows failures', () => {
    const step = stepContaining(ciSteps, /run:\s*npm run lint\b/)
    expect(step, 'no YAML step runs `npm run lint`').not.toBeNull()
    expect(escapeHatchIn(step!), 'the lint step would not fail the build').toBeNull()
  })
})

describe('the step reader itself', () => {
  // The bug was in the READING, so the reading is what needs covering.
  const build = (lintStep: string[]) => [
    '    steps:',
    '      - name: Unit tests',
    '        run: npm test',
    '',
    ...lintStep,
    '',
    '      - name: Build',
    '        run: npm run build',
  ].join('\n')

  const plain = build([
    '      - name: Lint',
    '        continue-on-error: true',
    '        run: npm run lint',
  ])

  it('sees a continue-on-error written above the run key', () => {
    expect(stepContaining(plain, /run:\s*npm run lint\b/)).toContain('continue-on-error: true')
  })

  it('is not fooled by a dash inside a block scalar', () => {
    // Legal YAML: the heredoc's content merely LOOKS like a list. Treating
    // that line as the step boundary would hide the continue-on-error above.
    const scalar = build([
      '      - name: Lint',
      '        continue-on-error: true',
      '        run: |',
      '          cat <<YAML',
      '          - name: not actually a step',
      '          YAML',
      '          npm run lint',
    ])
    const step = stepContaining(scalar, /npm run lint\b/)
    expect(step, 'the scalar line must not be mistaken for the start of the step').toContain(
      'continue-on-error: true',
    )
  })

  it('stops at the next step rather than swallowing the rest of the file', () => {
    const step = stepContaining(plain, /run:\s*npm run lint\b/)
    expect(step).not.toContain('npm run build')
    expect(step).not.toContain('npm test')
  })

  it('returns null when nothing matches', () => {
    expect(stepContaining(plain, /run:\s*npm run nonesuch\b/)).toBeNull()
  })
})

describe('the escape hatches it has to recognise', () => {
  it('catches the obvious two', () => {
    expect(escapeHatchIn('run: npm run lint || true')).toContain('|| true')
    expect(escapeHatchIn('continue-on-error: true\nrun: npm run lint')).toContain('continue-on-error')
  })

  it('catches a NEGATIVE warning limit, which eslint reads as unlimited', () => {
    expect(escapeHatchIn('run: npm run lint -- --max-warnings -1')).toContain('--max-warnings -1')
    expect(escapeHatchIn('run: npm run lint -- --max-warnings=-1')).toContain('--max-warnings -1')
  })

  it('catches an absurdly high one', () => {
    expect(escapeHatchIn('run: npm run lint -- --max-warnings 99999')).toContain('99999')
  })

  it('allows the one value that tightens the gate', () => {
    expect(escapeHatchIn('run: npm run lint -- --max-warnings 0')).toBeNull()
  })

  it('passes a step with no escape hatch at all', () => {
    expect(escapeHatchIn('- name: Lint\n  run: npm run lint')).toBeNull()
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
