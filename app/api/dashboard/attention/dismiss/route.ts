import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { requireRole } from '@/lib/auth/current-org'
import { MAX_FINGERPRINT, MAX_KEY } from '@/lib/dashboard/attention-dismissals'

// ============================================
// Needs attention, dismissed (migration 20261108)
// ============================================
// POST   { key, fingerprint }  — hide this row while its state holds
// DELETE { key }               — undo: show it again
//
// The key and fingerprint are the ones the attention list sent with the row
// (lib/dashboard/attention-dismissals). One that no longer matches the row's
// state simply stops hiding it, so a stale or forged one can only ever show
// the office a row again. The list is the office's shared to-do, so a
// dismissal is organisation-wide; a viewer can read it but not change it.
// orgAuth's client is service-role: every query is scoped by org_id.

const STAFF = ['admin', 'manager', 'agent']

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({} as Record<string, unknown>))
}

export async function POST(request: NextRequest) {
  const forbidden = await requireRole(STAFF)
  if (forbidden) return forbidden
  const auth = await orgAuth()
  if (auth.error || !auth.supabase || !auth.org_id) {
    return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
  }

  const body = await readBody(request)
  const key = typeof body.key === 'string' ? body.key : ''
  const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : ''
  if (!key || key.length > MAX_KEY || fingerprint.length > MAX_FINGERPRINT) {
    return NextResponse.json({ success: false, error: 'A valid item key is required' }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from('dashboard_attention_dismissals')
    .upsert(
      {
        org_id: auth.org_id,
        item_key: key,
        fingerprint,
        dismissed_by: auth.user?.id ?? null,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,item_key' },
    )
  if (error) {
    console.error('attention dismiss failed:', error.message)
    return NextResponse.json({ success: false, error: 'Could not dismiss this item' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const forbidden = await requireRole(STAFF)
  if (forbidden) return forbidden
  const auth = await orgAuth()
  if (auth.error || !auth.supabase || !auth.org_id) {
    return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
  }

  const body = await readBody(request)
  const key = typeof body.key === 'string' ? body.key : ''
  if (!key || key.length > MAX_KEY) {
    return NextResponse.json({ success: false, error: 'A valid item key is required' }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from('dashboard_attention_dismissals')
    .delete()
    .eq('org_id', auth.org_id)
    .eq('item_key', key)
  if (error) {
    console.error('attention undismiss failed:', error.message)
    return NextResponse.json({ success: false, error: 'Could not restore this item' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
