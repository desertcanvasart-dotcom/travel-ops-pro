// GET  /api/organizations/mine        → the workspaces this person belongs to
// POST /api/organizations/mine        { org_id } → switch to one of them
//
// One identity, many workspaces. organization_members has always been keyed
// (org_id, user_id), so belonging to two agencies was always representable;
// what was missing was any way for a request to say WHICH one it meant, so a
// second membership was invisible (see lib/auth/current-org.ts).
//
// The switch writes a cookie and nothing else. That cookie is not a claim: the
// resolver honours it only where the membership is real, so posting somebody
// else's org id here — or editing the cookie by hand — grants nothing. The
// membership check below is therefore about giving a straight answer rather
// than about safety; the safety lives in getCurrentOrgId.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ACTIVE_ORG_COOKIE, getCurrentUserId, getMyOrganizations } from '@/lib/auth/current-org'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })
  const organizations = await getMyOrganizations()
  return NextResponse.json({ success: true, organizations })
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const orgId = typeof body?.org_id === 'string' ? body.org_id.trim() : ''
  if (!orgId) {
    return NextResponse.json({ success: false, error: 'org_id is required' }, { status: 400 })
  }

  // Refused with the reason rather than silently ignored: a switch that
  // appears to work and then leaves you in the previous workspace is the
  // worst outcome — you would not know which agency's data you were reading.
  const { data: membership } = await admin()
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json(
      { success: false, error: 'You are not a member of that workspace' },
      { status: 403 }
    )
  }

  const response = NextResponse.json({
    success: true,
    org_id: orgId,
    role: (membership as { role?: string }).role ?? null,
  })
  response.cookies.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}
