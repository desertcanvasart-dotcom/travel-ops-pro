// ============================================
// API: /api/health/system — DB reachability + anon-exposure probe
// ============================================
// Enumerates everything PostgREST publishes and counts rows AS ANON (real anon
// key, no session) against each one. Any anon-visible row that has not been
// declared open is an exposure and answers 503, so the E2E suite fails on it.
//
// Deny-by-default since 2026-08-21. The previous version probed a
// hand-maintained list of 39 names; the audit that followed the `guides`
// incident found 171 published resources and 47 serving rows to the anon key,
// none of them on the list. A list cannot describe what nobody remembered to
// add, so the probe now reads the surface from PostgREST itself and treats
// undeclared readability as failure. See lib/rls/exposure.ts.
//
// AUTH: deliberately NOT middleware-allowlisted — the response describes
// security posture, so it requires a logged-in operator session.
//
// Note on semantics: a resource that is EMPTY passes trivially even if it is
// wide open (a count probe cannot tell locked from empty), so those are
// reported under `unprovable` rather than counted as safe. Grants are the real
// defence — see 20260821_lock_public_schema.sql.
//
// A read that Postgres REFUSES (SQLSTATE 42501) is the goal state and is
// reported under `denied`. Only a failure for some other reason — bad key,
// missing table, 5xx — lands in `probeErrors`, so that list means "could not
// prove" and nothing else. (Until 2026-08-22 the probe went through
// supabase-js' head-count path, which drops the error code and message, and
// every one of the 168 clean denials was listed as an error with text "".)
// ============================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyExposure, probeAsAnon, resourcesFromOpenApi, OPEN_BY_DESIGN } from '@/lib/rls/exposure'

export const dynamic = 'force-dynamic'

/** Probe fan-out. The surface is ~170 resources: sequentially that is minutes,
 *  and unbounded parallelism just pressures PostgREST's pool. Measured against
 *  the live project 2026-08-21 — 12 → 4.8s, 24 → 2.8s, 32 → 3.7s. 12 keeps the
 *  endpoint well inside Playwright's 30s request timeout with room to spare. */
const CONCURRENCY = 12

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // The plain anon key with NO session — deliberately the anonymous internet.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // 1. Database reachability (service role) + latency
  const t0 = Date.now()
  const dbCheck = await service.from('organizations').select('id', { count: 'exact', head: true })
  const database = {
    ok: !dbCheck.error,
    latencyMs: Date.now() - t0,
    ...(dbCheck.error ? { error: dbCheck.error.message } : {}),
  }

  // 2. The reachable surface, from PostgREST rather than from a list here.
  let resources: string[] = []
  let surfaceError: string | undefined
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      cache: 'no-store',
    })
    resources = resourcesFromOpenApi(await res.json())
  } catch (e) {
    surfaceError = e instanceof Error ? e.message : String(e)
  }

  // 3. Count as anon against every resource — raw HTTP so the SQLSTATE survives.
  const probes = await mapWithLimit(resources, CONCURRENCY, (resource) =>
    probeAsAnon(url, anonKey, resource)
  )

  const report = classifyExposure(probes, OPEN_BY_DESIGN)

  // An empty surface means the probe learned nothing — never report that as ok.
  const surfaceOk = resources.length > 0
  const rls = {
    ok: report.ok && surfaceOk,
    probed: report.probed,
    exposed: report.exposed,
    // Refused by Postgres — the desired answer for every locked resource.
    deniedCount: report.denied.length,
    // Could not prove either way. Read this list; it should be empty.
    probeErrors: report.probeErrors,
    openByDesign: report.openByDesign,
    // Readable but empty — locked or not, a count probe cannot say.
    unprovableCount: report.unprovable.length,
    ...(surfaceError ? { surfaceError } : {}),
    ...(surfaceOk ? {} : { surfaceError: surfaceError ?? 'PostgREST published no resources' }),
  }

  const overall = database.ok && rls.ok ? 'ok' : 'fail'
  return NextResponse.json(
    { overall, database, rls, checkedAt: new Date().toISOString() },
    { status: overall === 'ok' ? 200 : 503 }
  )
}
