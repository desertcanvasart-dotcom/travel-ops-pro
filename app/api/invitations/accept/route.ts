import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  checkInvitationState,
  checkPassword,
  decideAcceptAction,
  emailsMatch,
} from '@/lib/invitation-accept'

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
// SUPERSEDED by the POST handler below, which creates the account itself,
// already confirmed. Kept because a browser holding the previous page still
// calls it.
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


// ============================================
// POST — create (or repair) the account AND accept, in one server call
// ============================================
// Why this exists: the previous flow had the browser call
// supabase.auth.signUp(), which — with email confirmation enabled on the
// project — creates an account with email_confirmed_at NULL. The invitee then
// has to action a SECOND email before they can ever sign in, and if that mail
// is missed the account is stranded: it exists (so signup answers "User
// already registered") but every login fails. That is precisely what happened
// to a real invited manager, whose account had to be deleted by hand.
//
// The invitation token was emailed to that address and is unguessable, so
// possession of it already proves control of the mailbox. The account is
// therefore created here with email_confirm: true and the invitee signs in
// immediately. An existing but UNCONFIRMED account for the same address is
// repaired the same way (confirmed, password set) — which un-strands anyone
// stuck from the old flow. An existing CONFIRMED account is never touched:
// an invitation must not become a password-reset oracle.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { token, password, fullName } = body ?? {}

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 })
    }
    const passwordCheck = checkPassword(password)
    if (!passwordCheck.ok) {
      return NextResponse.json({ success: false, error: passwordCheck.error }, { status: 400 })
    }

    const { data: invitation } = await supabase
      .from('user_invitations')
      .select('id, email, role, org_id, accepted_at, expires_at')
      .eq('token', token)
      .maybeSingle()

    const state = checkInvitationState(invitation)
    if (!state.usable) {
      return NextResponse.json({ success: false, error: state.error }, { status: state.status })
    }

    const email = String(invitation!.email).trim().toLowerCase()
    const existing = await findAuthUserByEmail(email)
    const decision = decideAcceptAction(existing)

    let userId: string
    if (decision.action === 'create') {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        // The invitation email IS the verification.
        email_confirm: true,
        user_metadata: { full_name: typeof fullName === 'string' && fullName.trim() ? fullName.trim() : email },
      })
      if (createErr || !created?.user) {
        console.error('Invite accept: createUser failed:', createErr?.message)
        return NextResponse.json(
          { success: false, error: 'Could not create the account. Please try again.' },
          { status: 500 }
        )
      }
      userId = created.user.id
    } else if (decision.action === 'repair') {
      const { error: repairErr } = await supabase.auth.admin.updateUserById(decision.userId, {
        password,
        email_confirm: true,
      })
      if (repairErr) {
        console.error('Invite accept: repair failed:', repairErr.message)
        return NextResponse.json(
          { success: false, error: 'Could not complete the account. Please try again.' },
          { status: 500 }
        )
      }
      userId = decision.userId
    } else {
      userId = decision.userId
    }

    // The profile row the rest of the app reads (the members list stitches on
    // it; a missing row renders a member with no name or email). Upserted
    // rather than assumed: relying on a signup trigger is how the previous
    // flow could produce a membership with no profile behind it.
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .upsert(
        {
          id: userId,
          email,
          full_name: typeof fullName === 'string' && fullName.trim() ? fullName.trim() : email,
        },
        { onConflict: 'id' }
      )
    if (profileErr) console.error('Invite accept: profile upsert failed:', profileErr.message)

    // Membership carries the invited role verbatim (see the PUT handler's
    // note on why mapping roles here once made everyone an owner).
    const { error: memberErr } = await supabase
      .from('organization_members')
      .insert({ org_id: invitation!.org_id, user_id: userId, role: invitation!.role })
    if (memberErr && (memberErr as { code?: string }).code !== '23505') {
      console.error('Invite accept: membership failed:', memberErr.message)
      return NextResponse.json(
        { success: false, error: 'Could not add you to the workspace. Please try again.' },
        { status: 500 }
      )
    }

    // Marked accepted LAST: if anything above failed, the invitation stays
    // usable and the invitee can retry instead of being stuck in limbo.
    const { error: acceptErr } = await supabase
      .from('user_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation!.id)
    if (acceptErr) throw acceptErr

    return NextResponse.json({
      success: true,
      email,
      // 'link' means an already-confirmed account was joined to the org and
      // its password was deliberately left alone — the client tells them to
      // sign in with their existing password rather than the one just typed.
      mode: decision.action,
    })
  } catch (error) {
    console.error('Error accepting invitation:', error)
    return NextResponse.json({ success: false, error: 'Failed to accept invitation' }, { status: 500 })
  }
}

/** Find an auth user by email. GoTrue's admin API has no by-email lookup that
 *  is stable across versions, so this pages through the list — bounded, since
 *  an unbounded scan on a large project is a hazard of its own. */
async function findAuthUserByEmail(email: string) {
  const PER_PAGE = 200
  const MAX_PAGES = 25
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) {
      console.error('Invite accept: listUsers failed:', error.message)
      return null
    }
    const hit = data.users.find(u => emailsMatch(u.email, email))
    if (hit) return hit
    if (data.users.length < PER_PAGE) return null
  }
  return null
}
