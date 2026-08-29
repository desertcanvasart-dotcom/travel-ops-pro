// ============================================
// GET /api/support-bundle — a redacted snapshot of this install
// ============================================
// T4 of docs/plans/self-hosting.md. When an install we do not run goes wrong,
// this is what crosses the gap: one file the customer generates, reads, and
// emails. Most "it's broken" reports are answered by two lines of it — usually
// a missing environment variable or an unapplied migration.
//
// GATED ON THE CUSTOMER'S OWN ADMIN, not on us. The sibling gates this behind
// its super-admin console; this product has no super-admin, so the gate is
// organization_members.role via requireRole (owner clears it automatically —
// see lib/auth/roles.ts). We are not a party to their install and must not have
// a way in.
//
// IT SENDS NOTHING ANYWHERE. It returns a file. Emailing it is the customer's
// decision, after they have read it.

import { NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { requireRole } from '@/lib/auth/current-org'
import { buildBundle, bundleFindings } from '@/lib/support/bundle'
import { collectState } from '@/lib/support/collect'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const denied = await requireRole(['admin'])
    if (denied) return denied

    const state = await collectState()
    const bundle = buildBundle({
      generatedAt: new Date().toISOString(),
      version: process.env.npm_package_version ?? 'unknown',
      sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? 'unknown',
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      database: state.database,
      env: process.env,
      integrations: state.integrations,
      crons: state.crons,
      counts: state.counts,
      errors: [],
    })

    return NextResponse.json({ success: true, bundle, findings: bundleFindings(bundle) })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Could not build the support bundle') },
      { status: 500 }
    )
  }
}
