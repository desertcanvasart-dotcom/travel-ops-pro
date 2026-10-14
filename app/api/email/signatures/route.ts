import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Signatures belong to the SESSION user. Every handler used to take userId
// from the query or body, so anyone signed in could read, add or rewrite a
// colleague's signature — HTML appended to that colleague's outgoing mail
// (a fake "pay here" link, say). A userId still sent by the client is ignored.
//
// And to the COMPANY the request is acting in (email_signatures.org_id,
// migration 20270104): the default signature is added to customer mail by
// Compose and the Inbox, so someone in both companies signed one company's
// mail with the other's signature. Each company has its own list and its own
// default.
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const { data, error } = await supabase
    .from('email_signatures')
    .select('*')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }

  return NextResponse.json({ signatures: data })
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { name, content, isDefault } = await request.json()

  if (!name || !content) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await supabase
      .from('email_signatures')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('org_id', orgId)
  }

  const { data, error } = await supabase
    .from('email_signatures')
    .insert({
      user_id: userId,
      org_id: orgId,
      name,
      content,
      is_default: isDefault || false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }

  return NextResponse.json({ signature: data })
}

export async function PUT(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id, name, content, isDefault } = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await supabase
      .from('email_signatures')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('org_id', orgId)
  }

  const { data, error } = await supabase
    .from('email_signatures')
    .update({
      name,
      content,
      is_default: isDefault,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }

  return NextResponse.json({ signature: data })
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return unauthorized()
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  const { id } = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('email_signatures')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}