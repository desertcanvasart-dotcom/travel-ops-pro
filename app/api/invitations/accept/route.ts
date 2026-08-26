import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// INVITATION ACCEPT — token-authenticated, NO session
// ============================================
// The invitee, by definition, has no session yet: they clicked the emailed
// link and just finished supabase.auth.signUp. This route (like
// /api/invitations/verify) authenticates by the unguessable invitation token
// itself and is exempted from the middleware session gate — the same model as
// the customer portal routes. It lives apart from /api/invitations because
// THAT route's list/create/delete handlers rely on the session gate and must
// stay behind it.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PUT - Mark an invitation as accepted after the signup completes, and add
// the freshly-created user to the inviter's org with the invitation's role.
// Called from app/invite/accept/page.tsx after supabase.auth.signUp succeeds.
//
// Prior to this handler existing the frontend's PUT silently returned 405,
// so invites stayed in 'pending' forever and new users were never bound to
// any org. With Phase 2A's getCurrentOrgId() now reading membership rows,
// that left every new accepted user with `getCurrentOrgId() === null` and
// every financial route 403'ing for them.
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    // Look up the invitation by token (service-role bypasses RLS, which is
    // necessary here because the freshly-signed-up user isn't a member of
    // the inviter's org yet — getCurrentOrgId() would return null).
    const { data: invitation, error: lookupErr } = await supabase
      .from('user_invitations')
      .select('id, email, role, org_id, accepted_at, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (lookupErr || !invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    if (invitation.accepted_at) {
      return NextResponse.json(
        { success: false, error: 'This invitation has already been used' },
        { status: 400 }
      )
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This invitation has expired' },
        { status: 400 }
      )
    }

    // Find the user_profiles row for this email — created by the signup
    // trigger immediately after supabase.auth.signUp().
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', invitation.email.toLowerCase())
      .maybeSingle()

    if (!profile?.id) {
      return NextResponse.json(
        { success: false, error: 'Signup must complete before accepting invitation' },
        { status: 400 }
      )
    }

    // Membership IS the role system now, so the invited role is stored
    // verbatim. The old mapping ('admin' → owner, everyone else → 'member')
    // is how production ended up with every member an owner: each admin
    // invite minted another one, and the owner-gates passed everybody.
    // Ownership is transferred deliberately, never granted by an invite.
    const { error: memberErr } = await supabase
      .from('organization_members')
      .insert({
        org_id: invitation.org_id,
        user_id: profile.id,
        role: invitation.role,
      })

    // Conflict (already a member) is fine — the invite-accept flow may be
    // retried after a transient failure on the second leg.
    if (memberErr && (memberErr as { code?: string }).code !== '23505') {
      throw memberErr
    }

    // Mark invitation as accepted last — if the membership insert above
    // failed for any non-23505 reason, the invitation stays pending so the
    // user can retry instead of being stuck in limbo.
    const { error: acceptErr } = await supabase
      .from('user_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    if (acceptErr) throw acceptErr

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error accepting invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to accept invitation' },
      { status: 500 }
    )
  }
}
