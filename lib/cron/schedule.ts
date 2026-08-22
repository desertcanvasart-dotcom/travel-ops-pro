// ============================================
// Minimal 5-field cron matcher
// ============================================
// Supports what the job registry uses: `*`, `*/n`, `a`, `a-b`, `a,b,c` in
// each of minute / hour / day-of-month / month / day-of-week, evaluated in
// UTC. Deliberately small: no names, no `L`/`W`, no seconds.
// ============================================

function fieldMatches(spec: string, value: number, min: number, max: number): boolean {
  return spec.split(',').some(part => {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/)
    if (!m) throw new Error(`cron: bad field "${part}"`)
    const [, base, rangeEnd, step] = m
    const lo = base === '*' ? min : Number(base)
    const hi = rangeEnd !== undefined ? Number(rangeEnd) : base === '*' ? max : lo
    const st = step !== undefined ? Number(step) : 1
    if (st < 1 || lo < min || hi > max || lo > hi) throw new Error(`cron: out of range "${part}"`)
    return value >= lo && value <= hi && (value - lo) % st === 0
  })
}

/** True when `expr` fires at the minute containing `at` (UTC). */
export function matchesCron(expr: string, at: Date): boolean {
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) throw new Error(`cron: expected 5 fields, got "${expr}"`)
  const [min, hour, dom, mon, dow] = f
  return (
    fieldMatches(min, at.getUTCMinutes(), 0, 59) &&
    fieldMatches(hour, at.getUTCHours(), 0, 23) &&
    fieldMatches(dom, at.getUTCDate(), 1, 31) &&
    fieldMatches(mon, at.getUTCMonth() + 1, 1, 12) &&
    fieldMatches(dow, at.getUTCDay(), 0, 6)
  )
}

/** The minute slot a date belongs to (seconds and millis dropped). */
export function minuteSlot(at: Date): Date {
  const d = new Date(at)
  d.setUTCSeconds(0, 0)
  return d
}
