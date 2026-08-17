import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { sendEmailInternal } from '@/lib/email-send'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all invitations for the current org (admin/manager only)
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // pending, accepted, expired, all

    let query = supabase
      .from('user_invitations')
      .select(`
        *,
        inviter:user_profiles!invited_by(id, full_name, email)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (status === 'pending') {
      query = query.is('accepted_at', null).gt('expires_at', new Date().toISOString())
    } else if (status === 'accepted') {
      query = query.not('accepted_at', 'is', null)
    } else if (status === 'expired') {
      query = query.is('accepted_at', null).lt('expires_at', new Date().toISOString())
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invitations' },
      { status: 500 }
    )
  }
}

// POST - Create new invitation (admin/manager only)
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const { email, role = 'agent', invited_by } = body

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email is required' },
        { status: 400 }
      )
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'agent', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      )
    }

    // Check if there's already a pending invitation FOR THIS ORG. A pending
    // invite for the same email in a different org is OK — that user may
    // legitimately be invited to multiple agencies and the org_id scope
    // keeps them separate.
    const { data: existingInvitation } = await supabase
      .from('user_invitations')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingInvitation) {
      return NextResponse.json(
        { success: false, error: 'Pending invitation already exists for this email' },
        { status: 400 }
      )
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex')
    
    // Set expiration to 7 days from now
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create invitation scoped to the inviter's org so PUT below can route
    // the accepted user into the right organization.
    const { data: invitation, error } = await supabase
      .from('user_invitations')
      .insert({
        email: email.toLowerCase(),
        role,
        invited_by,
        org_id: orgId,
        token,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (error) throw error

    // Send invitation email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
    const inviteUrl = `${baseUrl}/invite/accept?token=${token}`

    try {
      await sendInvitationEmail(email, role, inviteUrl)
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError)
      // Don't fail the request, invitation is still created
    }

    return NextResponse.json({
      success: true,
      data: invitation,
      inviteUrl // Return URL in case email fails
    })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create invitation' },
      { status: 500 }
    )
  }
}

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

// DELETE - Cancel/delete invitation
export async function DELETE(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Invitation ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('user_invitations')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Invitation cancelled'
    })
  } catch (error) {
    console.error('Error deleting invitation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete invitation' },
      { status: 500 }
    )
  }
}

// Helper function to send invitation email
async function sendInvitationEmail(
  toEmail: string,
  role: string,
  inviteUrl: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
  
  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    agent: 'Agent',
    viewer: 'Viewer'
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background-color: #647C47; padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">You're Invited! 🎉</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 32px;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 16px 0;">
              You've been invited to join <strong>Autoura</strong> as a <strong>${roleLabels[role] || role}</strong>.
            </p>
            
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px 0;">
              Autoura is a travel operations management platform that helps teams manage clients, itineraries, tasks, and more.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background-color: #647C47; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0 0; text-align: center;">
              This invitation will expire in 7 days.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0; text-align: center;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  // In-process send (a fetch to /api/send-email would hit the /api/* auth gate).
  const result = await sendEmailInternal({
    to: toEmail,
    subject: `You're invited to join Autoura`,
    html: htmlContent,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to send invitation email')
  }

  return result
}