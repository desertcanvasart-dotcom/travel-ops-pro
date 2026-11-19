// Shared auth for /api/settings/zones: the service-role client, the caller's
// company, and whether they may change zones. `write` refuses anyone who is
// not an admin IN THE ACTIVE COMPANY (requireRole reads the active
// membership; the owner clears every gate), as the vocabulary routes do.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, getCurrentUserId, requireRole } from '@/lib/auth/current-org'
import { ZONE_WRITE_DENIED, ZONE_WRITE_ROLES } from './city-zones'

export async function zoneAuth(write: boolean): Promise<NextResponse | { db: SupabaseClient; orgId: string; canWrite: boolean }> {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  const canWrite = !(await requireRole([...ZONE_WRITE_ROLES]))
  if (write && !canWrite) return NextResponse.json({ success: false, error: ZONE_WRITE_DENIED }, { status: 403 })
  const orgId = await getCurrentOrgId()
  if (!orgId) return NextResponse.json({ success: false, error: 'No organization for the current user' }, { status: 403 })
  return { db: createServerClient() as unknown as SupabaseClient, orgId, canWrite }
}
