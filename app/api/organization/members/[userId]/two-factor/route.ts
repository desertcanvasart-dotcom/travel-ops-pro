import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { mayManage } from '@/lib/auth/member-management'

// ============================================
// Reset a colleague's two-factor login
// ============================================
// For a lost or replaced phone (lib/auth/two-factor.ts): removes every
// authenticator on the person's login, so their next sign-in is password-only
// — or, when the company requires two-factor and they are an owner,
// administrator or manager, straight to setting up a new one.
//
// The Users-page rule (mayManage): the owner resets anyone else; an admin
// resets a manager, agent or viewer. Never your own — remove a device under
// Settings → Profile, or for an owner with no other owner, the server
// operator runs scripts/reset-two-factor.mjs. A login that also belongs to
// another company is refused, like deactivating it: the authenticator guards
// the login in both.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const [orgId, callerId, { userId }] = await Promise.all([getCurrentOrgId(), getCurrentUserId(), params])
    if (!orgId || !callerId) return noOrgResponse()
    if (userId === callerId) {
      return NextResponse.json({ success: false, error: 'Remove your own devices under Settings → Profile → Two-factor login.' }, { status: 400 })
    }

    const { data: rows, error: membersErr } = await supabaseAdmin
      .from('organization_members')
      .select('org_id, user_id, role')
      .in('user_id', [callerId, userId])
    if (membersErr) throw membersErr
    const callerRole = (rows ?? []).find(r => r.user_id === callerId && r.org_id === orgId)?.role ?? ''
    const target = (rows ?? []).filter(r => r.user_id === userId)
    const targetRole = target.find(r => r.org_id === orgId)?.role ?? null
    if (!targetRole) return NextResponse.json({ success: false, error: 'Not a member of this company' }, { status: 404 })
    if (callerRole !== 'owner' && !mayManage(callerRole, targetRole)) {
      return NextResponse.json({ success: false, error: 'Only the owner can reset an administrator; an administrator resets managers, agents and viewers.' }, { status: 403 })
    }
    if (target.some(r => r.org_id !== orgId)) {
      return NextResponse.json({ success: false, error: 'This person also belongs to another company, so their login is not this company\'s to change. Ask them to remove the device under Settings → Profile, or ask the server operator.' }, { status: 409 })
    }

    const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId })
    if (listErr) throw listErr
    const factors = listed?.factors ?? []
    for (const f of factors) {
      const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId })
      if (error) throw error
    }
    return NextResponse.json({ success: true, data: { removed: factors.length } })
  } catch (err) {
    console.error('Error resetting two-factor:', err)
    return NextResponse.json({ success: false, error: 'Failed to reset two-factor' }, { status: 500 })
  }
}
