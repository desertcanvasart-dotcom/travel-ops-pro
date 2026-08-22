// ============================================
// Deny-by-default classification for the anon-exposure probe
// ============================================
// The previous probe asked "are these 39 named things locked?". That question
// can only ever catch what someone remembered to list — on 2026-08-21 it
// caught one view while 46 other resources were serving rows to the anonymous
// key. The question is now "is ANYTHING readable that hasn't been declared
// open?", so a new table is a failure until someone says otherwise.
//
// Outcomes, per resource:
//   exposed      anon counted rows, nobody declared it open  → FAIL
//   denied       Postgres refused the read (42501)           → the goal
//   unprovable   readable but empty — locked or not, a count cannot say
//   probeError   anything else (bad key, missing table, 5xx) — "could not
//                prove", which is NOT the same as denied and must not be
//                hidden inside it
// ============================================

/** Postgres' "insufficient_privilege" SQLSTATE — what a revoked grant answers. */
export const PERMISSION_DENIED_CODE = '42501'

/** One probe result: how many rows the anonymous key could count. */
export type AnonProbe = {
  resource: string
  /** Row count visible to anon, or null when the read did not return one. */
  count: number | null
  /** Error text when the read errored (see `code` for the machine-readable reason). */
  error?: string
  /** PostgREST / Postgres error code, when the response carried one. */
  code?: string
}

export type ExposureReport = {
  ok: boolean
  probed: number
  /** Anon can read rows here and it was never declared open. The failure set. */
  exposed: Array<{ table: string; anonVisibleRows: number }>
  /** Declared open on purpose; reported so the posture stays visible. */
  openByDesign: Record<string, number | string>
  /** Postgres refused the anonymous read outright — the desired state. */
  denied: string[]
  /** Read errored for a reason other than permission — "could not prove locked". */
  probeErrors: Array<{ table: string; error: string; code?: string }>
  /** Readable but empty: a probe cannot tell locked from empty-and-open. */
  unprovable: string[]
}

/**
 * Resources that are anon-readable ON PURPOSE. Empty today. Anything added
 * here needs a comment saying why the anonymous internet may read it —
 * a name in this list is a decision, not a default.
 */
export const OPEN_BY_DESIGN: string[] = []

/** True when the probe was refused by a grant/RLS — the clean outcome. */
export function isPermissionDenied(p: Pick<AnonProbe, 'code' | 'error'>): boolean {
  if (p.code === PERMISSION_DENIED_CODE) return true
  // Fallback for callers that only captured the message.
  return !p.code && /permission denied/i.test(p.error ?? '')
}

export function classifyExposure(
  probes: AnonProbe[],
  openByDesign: string[] = OPEN_BY_DESIGN
): ExposureReport {
  const open = new Set(openByDesign)
  const exposed: ExposureReport['exposed'] = []
  const openReport: ExposureReport['openByDesign'] = {}
  const denied: string[] = []
  const probeErrors: ExposureReport['probeErrors'] = []
  const unprovable: string[] = []

  for (const p of probes) {
    if (p.error !== undefined || p.count === null) {
      if (isPermissionDenied(p)) {
        // Refused by Postgres: exactly what a revoked grant should answer.
        // Recorded as denied, not as an error, so a genuine probe failure
        // (bad key, missing table, 5xx) can no longer hide among 160 of these.
        if (open.has(p.resource)) openReport[p.resource] = 'denied'
        else denied.push(p.resource)
        continue
      }
      const error = p.error || 'unknown'
      if (open.has(p.resource)) openReport[p.resource] = `error: ${error}`
      else probeErrors.push({ table: p.resource, error, ...(p.code ? { code: p.code } : {}) })
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
    denied,
    probeErrors,
    unprovable,
  }
}

/**
 * Row count from a PostgREST `Content-Range` header under `Prefer: count=exact`:
 * `0-0/47` → 47, `* / 0` → 0. Null when absent or unparseable.
 */
export function countFromContentRange(header: string | null | undefined): number | null {
  if (!header) return null
  const m = /\/(\d+)\s*$/.exec(header)
  return m ? Number(m[1]) : null
}

type FetchLike = (input: string, init: RequestInit) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

/**
 * Count rows in one resource AS THE ANONYMOUS KEY, over raw HTTP rather than
 * supabase-js. The client's head-count path returns `{ message: '' }` for a
 * refused read, which is how 168 clean denials came to be reported as 168
 * errors; the raw response carries the SQLSTATE, so a denial and a genuine
 * failure can be told apart.
 */
export async function probeAsAnon(
  url: string,
  anonKey: string,
  resource: string,
  fetchImpl: FetchLike = fetch
): Promise<AnonProbe> {
  try {
    const res = await fetchImpl(
      `${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(resource)}?select=*&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'count=exact',
        },
        cache: 'no-store',
      }
    )
    const body = await res.text()

    if (res.status >= 200 && res.status < 300) {
      const count = countFromContentRange(res.headers.get('content-range'))
      if (count !== null) return { resource, count }
      return { resource, count: null, error: `HTTP ${res.status} without a Content-Range count` }
    }

    let code: string | undefined
    let message: string | undefined
    try {
      const parsed = JSON.parse(body) as { code?: unknown; message?: unknown }
      if (typeof parsed.code === 'string') code = parsed.code
      if (typeof parsed.message === 'string') message = parsed.message
    } catch {
      // non-JSON error body — fall through to the status line
    }
    return {
      resource,
      count: null,
      error: message || `HTTP ${res.status}`,
      ...(code ? { code } : {}),
    }
  } catch (e) {
    return { resource, count: null, error: e instanceof Error ? e.message : String(e) }
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
