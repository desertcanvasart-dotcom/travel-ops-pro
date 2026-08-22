import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getOrgDefaultMargin, normaliseMargin, resolveMarginPercent } from '@/lib/org-default-margin'

async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

/**
 * The currency to fall back on when a user has expressed no preference: their
 * ORGANISATION'S, and only then a constant.
 *
 * Resolved here rather than in the client because this is where the caller's
 * org is known. 'USD' survives as a last resort for an org that has never set
 * one — it is not a good answer, which is the point: it should be visibly wrong
 * rather than quietly plausible.
 */
// The company's margin, for a user who has set none of their own (→ 25 when the org has none either).
async function orgDefaultMargin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  return resolveMarginPercent({ orgDefault: await getOrgDefaultMargin(supabase, await getCurrentOrgId()) })
}

async function orgDefaultCurrency(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  // getCurrentOrgId is the one authority on which org a request belongs to —
  // reading organization_members directly here would pick an arbitrary
  // membership for anyone who belongs to two.
  const orgId = await getCurrentOrgId()
  if (!orgId) return 'USD'
  const { data } = await supabase
    .from('organizations')
    .select('default_currency')
    .eq('id', orgId)
    .maybeSingle()
  return (data as { default_currency?: string | null } | null)?.default_currency || 'USD'
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching preferences:', error)
      throw error
    }

    const preferences = data || {
      default_cost_mode: 'auto',
      default_tier: 'standard',
      default_margin_percent: await orgDefaultMargin(supabase),
      default_currency: await orgDefaultCurrency(supabase),
    }

    // Not a user preference — an org fact the client needs to label engine
    // amounts correctly (the rates are in this, the billing is in default_currency).
    const rate_currency = await getOrgRateCurrency(supabase, await getCurrentOrgId())

    return NextResponse.json({
      success: true,
      data: { ...preferences, rate_currency }
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const prefData = {
      user_id: user.id,
      default_cost_mode: body.default_cost_mode || 'auto',
      default_tier: body.default_tier || 'standard',
      default_margin_percent: normaliseMargin(body.default_margin_percent) ?? (await orgDefaultMargin(supabase)),
      default_currency: body.default_currency || (await orgDefaultCurrency(supabase)),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(prefData, { 
        onConflict: 'user_id',
        ignoreDuplicates: false 
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving preferences:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}