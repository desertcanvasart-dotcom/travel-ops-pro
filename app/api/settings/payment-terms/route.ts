// ============================================
// The organisation's payment terms
// ============================================
// GET  the stored values plus the standing defaults they fall back to
// PUT  update them (owner only — these are commercial terms)
//
// NULL is a meaningful value here and the API preserves it: an unset column
// means "trade on the standing rule" (20% / +3 days / −60 days), which is
// different from having chosen those same numbers explicitly. Clearing a field
// in the UI therefore stores NULL, not a copy of the default that would then
// stop tracking any future change to the rule.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { DEFAULT_PAYMENT_RULE } from '@/lib/payment-schedule'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COLUMNS = 'deposit_percent, deposit_due_days, balance_due_days_before_departure'

export async function GET() {
  const orgId = await getCurrentOrgId()
  if (!orgId) return noOrgResponse()

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select(COLUMNS)
    .eq('id', orgId)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to load payment terms') },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    terms: data ?? {
      deposit_percent: null,
      deposit_due_days: null,
      balance_due_days_before_departure: null,
    },
    // What a NULL falls back to — shown as placeholders, never stored.
    defaults: DEFAULT_PAYMENT_RULE,
  })
}

/** null clears the field; otherwise a number within [min, max]. */
function parseField(
  value: unknown,
  { min, max, integer }: { min: number; max: number; integer: boolean }
): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return { ok: false }
  if (integer && !Number.isInteger(n)) return { ok: false }
  return { ok: true, value: n }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set() {}, remove() {},
        },
      }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return noOrgResponse()

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Owner gate, mirroring the org-rename rule: how much money is asked for
    // and when is not a per-agent preference.
    const { data: membership } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()
    if ((membership as { role?: string } | null)?.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'Only organization owners can change payment terms' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))

    const percent = parseField(body?.deposit_percent, { min: 0, max: 100, integer: false })
    const depositDays = parseField(body?.deposit_due_days, { min: 0, max: 365, integer: true })
    const balanceDays = parseField(body?.balance_due_days_before_departure, {
      min: 0,
      max: 365,
      integer: true,
    })

    if (!percent.ok || !depositDays.ok || !balanceDays.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Deposit must be 0–100%, and the day counts whole numbers between 0 and 365.',
        },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update({
        deposit_percent: percent.value,
        deposit_due_days: depositDays.value,
        balance_due_days_before_departure: balanceDays.value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)
      .select(COLUMNS)
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Failed to save payment terms') },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, terms: data, defaults: DEFAULT_PAYMENT_RULE })
  } catch (error) {
    console.error('Error updating payment terms:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
