// ============================================
// No invisible click-eating backdrops
// ============================================
// The house pattern for dismissable popovers used to be an invisible
// full-viewport layer (`fixed inset-0 z-N` with no background) whose onClick
// closed the popover. It closes the popover BY EATING THE PRESS: with the
// supplier role dropdown open, the first click on "Save Changes" did nothing
// but close the dropdown (audit AUT-W02; AUT-H01 was the same complaint).
// Ten of them were converted to lib/use-dismiss-on-outside.ts, which closes
// on an outside pointerdown while letting the same press land where the
// user aimed.
//
// This scan keeps the count at zero. A DIMMED overlay (bg-black/50 etc.) is
// fine — that is a modal scrim the user can SEE, and modal semantics are
// exactly "you must deal with me first". The defect is the invisible one.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const INVISIBLE_BACKDROP = /className\s*=\s*["'`][^"'`]*\bfixed inset-0 z-\d+\s*["'`]/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('dismissable popovers', () => {
  it('no invisible full-viewport backdrop anywhere — use useDismissOnOutside instead', () => {
    const offenders: string[] = []
    for (const file of [...sourceFiles(join(process.cwd(), 'app')), ...sourceFiles(join(process.cwd(), 'components'))]) {
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        if (INVISIBLE_BACKDROP.test(line)) offenders.push(`${file.replace(`${process.cwd()}/`, '')}:${i + 1}`)
      })
    }
    expect(
      offenders,
      'an invisible fixed-inset-0 layer closes the popover by eating the click ' +
        '(audit AUT-W02) — use useDismissOnOutside (lib/use-dismiss-on-outside.ts)',
    ).toEqual([])
  })
})
