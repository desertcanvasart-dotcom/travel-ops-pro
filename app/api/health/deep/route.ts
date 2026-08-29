// ============================================
// GET /api/health/deep — is this install actually well?
// ============================================
// T4 of docs/plans/self-hosting.md. /api/health answers "is the process up and
// can it reach the database", and is public, so it must stay secret-free and
// vague. This one is gated, so it can afford to say WHICH dependency is unhappy
// and whether the scheduled jobs have stopped.
//
// UNLIKE THE SIBLING, THIS ROUTE IS NOT THE ONLY THING GUARDING ITSELF.
// autoura-saas exempts the '/api/health' prefix in middleware, so its deep
// probe is anonymously reachable and its own check is the sole gate. Verified
// 2026-08-29: THIS app's middleware does not mention /api/health at all, so the
// route sits behind the ordinary session gate as well.
//
// The check below is therefore belt-and-braces — but it still fails closed,
// because "the middleware happens to cover us" is the kind of protection that
// disappears in a refactor nobody connects to this file. bearerMatches returns
// false when no secret is configured, so an install that never set CRON_SECRET
// is closed rather than open.
//
// TWO WAYS IN, because a monitor cannot hold a session (which is the only
// reason a bearer path exists here at all):
//   * Authorization: Bearer <CRON_SECRET>, or
//   * an admin of the organization (owner clears it too — lib/auth/roles.ts)
//
// 503 ONLY FOR A REAL OUTAGE. A stopped scheduler is REPORTED but does not
// page: it is a genuine problem and it is not an outage, and a monitor that
// cries wolf gets muted.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentUserRole } from '@/lib/auth/current-org'
import { roleAllows } from '@/lib/auth/roles'
import { bearerMatches } from '@/lib/support/probe-auth'
import { collectState } from '@/lib/support/collect'
import { isStale } from '@/lib/support/job-runs'

export const dynamic = 'force-dynamic'

async function authorized(request: NextRequest): Promise<boolean> {
  if (bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) return true
  try {
    return roleAllows(await getCurrentUserRole(), ['admin'])
  } catch {
    // No session, or the session lookup itself failed. Fail closed.
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await authorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const state = await collectState()
    const staleJobs = state.crons.filter(c => isStale(c.lastRun)).map(c => c.name)
    const neverRun = state.crons.filter(c => c.lastRun === null).map(c => c.name)

    const degraded = !state.database.reachable
    return NextResponse.json(
      {
        status: degraded ? 'unhealthy' : 'ok',
        database: state.database,
        integrations: state.integrations,
        counts: state.counts,
        crons: state.crons,
        // Reported, never paged on.
        staleJobs,
        neverRun,
      },
      { status: degraded ? 503 : 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: clientMessage(error, 'deep health check failed') },
      { status: 503 }
    )
  }
}
