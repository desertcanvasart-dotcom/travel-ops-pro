// ============================================
// API: WHATSAPP BLOCKED NUMBERS (migration 20270120)
// ============================================
// GET    /api/whatsapp/blocked   — the company's blocked numbers (staff)
// POST   /api/whatsapp/blocked   — block { phone_number, reason? } (owner, admin, manager)
// DELETE /api/whatsapp/blocked   — unblock { phone_number } (owner, admin, manager)
//
// A blocked number's messages are not stored, counted or drafted
// (app/api/whatsapp/webhook, lib/whatsapp-blocked.ts). This blocks inside the
// app only: the sender's WhatsApp still delivers. The number travels in the
// body, never the URL (it would sit in logs). Ported from autoura-saas #816.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { BLOCK_ROLES, checkBlockNumber } from '@/lib/whatsapp-blocked'

const COLUMNS = 'id, phone_number, reason, blocked_by, blocked_message_count, last_blocked_at, created_at'

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

const failed = (error: unknown) =>
  NextResponse.json({ success: false, error: clientMessage(error, 'Could not update blocked numbers') }, { status: 500 })

export async function GET() {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const { data, error } = await createServerClient()
    .from('whatsapp_blocked_numbers')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) return failed(error)
  return NextResponse.json({ success: true, blocked: data ?? [] })
}

export async function POST(request: NextRequest) {
  const forbidden = await requireRole([...BLOCK_ROLES])
  if (forbidden) return forbidden
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const body = await readBody(request)
  const checked = checkBlockNumber(body.phone_number)
  if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null
  const db = createServerClient()

  // Already blocked: answer with the existing block. Blocking twice is not an error.
  const existing = await db
    .from('whatsapp_blocked_numbers')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .eq('phone_number', checked.number)
    .maybeSingle()
  if (existing.error) return failed(existing.error)
  if (existing.data) return NextResponse.json({ success: true, blocked: existing.data })

  const { data, error } = await db
    .from('whatsapp_blocked_numbers')
    .insert({ org_id: orgId, phone_number: checked.number, reason, blocked_by: await getCurrentUserId() })
    .select(COLUMNS)
    .single()
  if (error) {
    // A second click that raced the first.
    if (error.code === '23505') return NextResponse.json({ success: true })
    return failed(error)
  }
  return NextResponse.json({ success: true, blocked: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const forbidden = await requireRole([...BLOCK_ROLES])
  if (forbidden) return forbidden
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const body = await readBody(request)
  const checked = checkBlockNumber(body.phone_number)
  if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 })

  const { data, error } = await createServerClient()
    .from('whatsapp_blocked_numbers')
    .delete()
    .eq('org_id', orgId)
    .eq('phone_number', checked.number)
    .select('id')
  if (error) return failed(error)
  if (!data || data.length === 0) {
    return NextResponse.json({ success: false, error: 'That number is not blocked.' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
