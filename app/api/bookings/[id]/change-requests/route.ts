// GET /api/bookings/[id]/change-requests — the operator's pending/history list.
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await params
  const { data } = await admin
    .from('booking_change_requests')
    .select('id, kind, requested_count, note, requested_via, status, created_at, resolved_at')
    .eq('booking_id', id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return NextResponse.json({ requests: data ?? [] })
}
