// ============================================
// API: /api/auth/role — current membership role
// ============================================
// The ONE role system lives in organization_members (see lib/auth/roles.ts).
// Server code reads it via getCurrentUserRole; this route is the client
// contexts' window onto the same answer, so nothing browser-side has to gate
// on the user_profiles display mirror.

import { NextResponse } from 'next/server'
import { getCurrentOrgId, getCurrentUserRole } from '@/lib/auth/current-org'

export const dynamic = 'force-dynamic'

export async function GET() {
  const role = await getCurrentUserRole()
  if (!role) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  // orgId travels with the role because browser-side writes need it too: the
  // new-client form inserts directly and clients.org_id is NOT NULL. It is an
  // identifier, not a secret — every itinerary the browser already reads
  // carries it.
  const orgId = await getCurrentOrgId()
  return NextResponse.json({ success: true, role, orgId })
}
