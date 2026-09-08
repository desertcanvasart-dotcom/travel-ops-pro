import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { generateStaffToken, resolveAssigneeContact } from '@/lib/staff-link'

/**
 * Create / read / revoke the tap-link for one assignment.
 *
 * POST is idempotent (one active link per assignment, enforced by
 * uq_staff_links_active), so the office can always re-copy the same URL, and
 * DELETE revokes the only URL that exists. orgAuth's client is service-role
 * (actor-attributed), so every query is explicitly scoped by org_id.
 */

function baseUrl(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await orgAuth()
  if (auth.error || !auth.supabase || !auth.org_id) {
    return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, org_id, user } = auth

  const { data: resource, error } = await supabase
    .from('itinerary_resources')
    .select('id, itinerary_id, status, resource_type, resource_id, resource_name')
    .eq('id', id)
    .eq('org_id', org_id)
    .maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!resource) return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 })
  if (resource.status === 'cancelled') {
    return NextResponse.json({ success: false, error: 'This assignment is cancelled' }, { status: 422 })
  }

  const { data: existing } = await supabase
    .from('staff_links')
    .select('token')
    .eq('itinerary_resource_id', id)
    .is('revoked_at', null)
    .maybeSingle()

  let token: string | undefined = existing?.token
  if (!token) {
    token = generateStaffToken()
    const { error: insErr } = await supabase.from('staff_links').insert({
      org_id,
      itinerary_id: resource.itinerary_id,
      itinerary_resource_id: id,
      token,
      created_by: user?.id ?? null,
    })
    if (insErr) {
      // Only a token that came back from the database may be returned — a
      // generated-but-unsaved token is a URL that 404s. On a unique-violation
      // race, re-read the winner.
      token = undefined
      if (insErr.code === '23505') {
        const { data: raced } = await supabase
          .from('staff_links')
          .select('token')
          .eq('itinerary_resource_id', id)
          .is('revoked_at', null)
          .maybeSingle()
        token = raced?.token
      }
      if (!token) {
        return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })
      }
    }
  }

  // The assignee's contact rides along so the UI can hand the link over on the
  // office's own WhatsApp (wa.me — our API never sends). Best-effort; null
  // phone just means "copy it yourself".
  const contact = await resolveAssigneeContact(
    supabase as unknown as Parameters<typeof resolveAssigneeContact>[0],
    resource
  )
  return NextResponse.json({
    success: true,
    token,
    url: `${baseUrl(request)}/staff/${token}`,
    contact,
  })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await orgAuth()
  if (auth.error || !auth.supabase || !auth.org_id) {
    return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
  }
  const { error } = await auth.supabase
    .from('staff_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('itinerary_resource_id', id)
    .eq('org_id', auth.org_id)
    .is('revoked_at', null)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
