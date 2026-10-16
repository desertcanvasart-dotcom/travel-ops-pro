// ============================================
// API: /api/email/rules — the organisation's inbox rules
// ============================================
// GET    the rules
// POST   { name?, conditions, actions, applyToExisting? } — create; with
//        applyToExisting, the rule is also run on matching mail already in
//        the inbox (a Gmail search, up to 2,000 emails)
// PATCH  { id, enabled?, name?, conditions?, actions? }
// DELETE ?id=
// New mail is handled after each sync (lib/email/rules applyRulesToNewMail).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { GmailAuthError } from '@/lib/gmail'
import { getMailboxGmail } from '@/lib/gmail-mailbox'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { cleanActions, cleanConditions, conditionProblem, gmailQuery, labelChange, type RuleActions, type RuleConditions } from '@/lib/email/rules'
import { connectedMailboxes } from '@/lib/email/connected-mailboxes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXISTING_LIMIT = 2000

/** The conditions' problem against the organisation's own addresses, or null. */
async function problemWith(c: RuleConditions, orgId: string): Promise<string | null> {
  return conditionProblem(c, (await connectedMailboxes(supabase, orgId)).emails)
}

async function caller() {
  // Rules move mail for everyone: manager and above.
  const forbidden = await requireRole(['admin', 'manager'])
  if (forbidden) return forbidden
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()
  return { orgId, userId: await getCurrentUserId() }
}

export async function GET() {
  try {
    // Reading them is for anyone who works in the inbox.
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { data, error } = await supabase
      .from('email_rules')
      .select('id, name, enabled, conditions, actions, applied_count, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return NextResponse.json({ rules: data ?? [] })
  } catch (err) {
    console.error('List rules error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

/** Run a rule on matching mail already in the inbox. */
async function applyToExisting(userId: string, conditions: RuleConditions, actions: RuleActions): Promise<number> {
  const { gmail } = await getMailboxGmail(userId)
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const { data } = await gmail.users.messages.list({ userId: 'me', labelIds: ['INBOX'], q: gmailQuery(conditions), maxResults: 500, pageToken })
    for (const m of data.messages || []) if (m.id) ids.push(m.id)
    pageToken = data.nextPageToken || undefined
  } while (pageToken && ids.length < EXISTING_LIMIT)
  const chosen = ids.slice(0, EXISTING_LIMIT)
  if (actions.trash) {
    for (let i = 0; i < chosen.length; i += 10) {
      await Promise.all(chosen.slice(i, i + 10).map(id => gmail.users.messages.trash({ userId: 'me', id })))
    }
  } else {
    const { add, remove } = labelChange(actions)
    for (let i = 0; i < chosen.length; i += 1000) {
      await gmail.users.messages.batchModify({ userId: 'me', requestBody: { ids: chosen.slice(i, i + 1000), addLabelIds: add, removeLabelIds: remove } })
    }
  }
  return chosen.length
}

export async function POST(request: NextRequest) {
  try {
    const who = await caller()
    if (who instanceof NextResponse) return who
    const body = await request.json()
    const conditions = cleanConditions(body.conditions)
    const actions = cleanActions(body.actions)
    if (!conditions) return NextResponse.json({ error: 'Give at least one condition (from, to, subject or words)' }, { status: 400 })
    if (!actions) return NextResponse.json({ error: 'Choose at least one thing to do' }, { status: 400 })
    const problem = await problemWith(conditions, who.orgId)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    const { data, error } = await supabase
      .from('email_rules')
      .insert({
        org_id: who.orgId,
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : null,
        conditions, actions, created_by: who.userId,
      })
      .select('id, name, enabled, conditions, actions, applied_count, created_at')
      .single()
    if (error) throw error

    let appliedToExisting = 0
    if (body.applyToExisting === true && who.userId) {
      try {
        appliedToExisting = await applyToExisting(who.userId, conditions, actions)
        await supabase.from('email_rules').update({ applied_count: appliedToExisting }).eq('id', data.id)
      } catch (err) {
        if (err instanceof GmailAuthError) return NextResponse.json({ rule: data, warning: 'Saved, but Gmail is not connected to apply it now.' })
        throw err
      }
    }
    return NextResponse.json({ rule: data, appliedToExisting })
  } catch (err) {
    console.error('Create rule error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const who = await caller()
    if (who instanceof NextResponse) return who
    const body = await request.json()
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled
    if (typeof body.name === 'string') update.name = body.name.trim().slice(0, 120) || null
    if (body.conditions !== undefined) {
      const c = cleanConditions(body.conditions)
      if (!c) return NextResponse.json({ error: 'Give at least one condition' }, { status: 400 })
      const problem = await problemWith(c, who.orgId)
      if (problem) return NextResponse.json({ error: problem }, { status: 400 })
      update.conditions = c
    }
    if (body.actions !== undefined) {
      const a = cleanActions(body.actions)
      if (!a) return NextResponse.json({ error: 'Choose at least one thing to do' }, { status: 400 })
      update.actions = a
    }
    const { data, error } = await supabase
      .from('email_rules').update(update).eq('id', body.id).eq('org_id', who.orgId)
      .select('id, name, enabled, conditions, actions, applied_count, created_at')
    if (error) throw error
    if (!data || data.length === 0) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    return NextResponse.json({ rule: data[0] })
  } catch (err) {
    console.error('Update rule error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const who = await caller()
    if (who instanceof NextResponse) return who
    const id = request.nextUrl.searchParams.get('id') || ''
    if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const { error } = await supabase.from('email_rules').delete().eq('id', id).eq('org_id', who.orgId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete rule error:', err)
    return NextResponse.json({ error: clientMessage(err, 'Internal server error') }, { status: 500 })
  }
}
