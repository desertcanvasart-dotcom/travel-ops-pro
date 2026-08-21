// ============================================
// Deny-by-default classification for the anon-exposure probe
// ============================================
// The previous probe asked "are these 39 named things locked?". That question
// can only ever catch what someone remembered to list — on 2026-08-21 it
// caught one view while 46 other resources were serving rows to the anonymous
// key. The question is now "is ANYTHING readable that hasn't been declared
// open?", so a new table is a failure until someone says otherwise.
// ============================================

/** One probe result: how many rows the anonymous key could count. */
export type AnonProbe = {
  resource: string
  /** Row count visible to anon, or null when the read errored (see `error`). */
  count: number | null
  error?: string
}

export type ExposureReport = {
  ok: boolean
  probed: number
  /** Anon can read rows here and it was never declared open. The failure set. */
  exposed: Array<{ table: string; anonVisibleRows: number }>
  /** Declared open on purpose; reported so the posture stays visible. */
  openByDesign: Record<string, number | string>
  /** Read errored — "could not prove locked", not proof of exposure. */
  probeErrors: Array<{ table: string; error: string }>
  /** Readable but empty: a probe cannot tell locked from empty-and-open. */
  unprovable: string[]
}

/**
 * Resources that are anon-readable ON PURPOSE. Empty today. Anything added
 * here needs a comment saying why the anonymous internet may read it —
 * a name in this list is a decision, not a default.
 */
export const OPEN_BY_DESIGN: string[] = []

export function classifyExposure(
  probes: AnonProbe[],
  openByDesign: string[] = OPEN_BY_DESIGN
): ExposureReport {
  const open = new Set(openByDesign)
  const exposed: ExposureReport['exposed'] = []
  const openReport: ExposureReport['openByDesign'] = {}
  const probeErrors: ExposureReport['probeErrors'] = []
  const unprovable: string[] = []

  for (const p of probes) {
    if (p.error || p.count === null) {
      // A permission error is the DESIRED outcome once grants are revoked, but
      // it still cannot prove the row count, so it is reported, never failed on.
      if (open.has(p.resource)) openReport[p.resource] = `error: ${p.error ?? 'unknown'}`
      else probeErrors.push({ table: p.resource, error: p.error ?? 'unknown' })
      continue
    }

    if (open.has(p.resource)) {
      openReport[p.resource] = p.count
      continue
    }

    if (p.count > 0) exposed.push({ table: p.resource, anonVisibleRows: p.count })
    else unprovable.push(p.resource)
  }

  // Worst first — the operator should read the biggest leak on line one.
  exposed.sort((a, b) => b.anonVisibleRows - a.anonVisibleRows)

  return {
    ok: exposed.length === 0,
    probed: probes.length,
    exposed,
    openByDesign: openReport,
    probeErrors,
    unprovable,
  }
}

/**
 * Every resource PostgREST publishes — the actual reachable surface, read from
 * its OpenAPI root rather than from a list in this repo. `definitions` holds
 * tables and views; RPCs live under `paths` and are not row sources.
 */
export function resourcesFromOpenApi(spec: unknown): string[] {
  const defs = (spec as { definitions?: Record<string, unknown> } | null)?.definitions
  if (!defs || typeof defs !== 'object') return []
  return Object.keys(defs).sort()
}
