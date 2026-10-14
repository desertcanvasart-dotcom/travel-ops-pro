import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { getOrgRateCurrency, normaliseRateCurrency, RATE_CURRENCIES } from '@/lib/org-rate-currency'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getOrgDefaultMargin, normaliseMargin, resolveMarginPercent } from '@/lib/org-default-margin'
import { marginToStore } from '@/lib/settings/preferences'

// Preferences are per (person, company) — user_preferences UNIQUE (user_id,
// org_id), migration 20261209. default_tier is a key of the company's
// vocabulary and margin/currency are the company's business settings, so
// someone in both companies has one row in each, and reads and writes the
// one of the workspace they have active (getCurrentOrgId).

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

    // No active company (no membership): the defaults, nothing stored.
    const orgId = await getCurrentOrgId()
    const { data, error } = orgId
      ? await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .eq('org_id', orgId)
          .maybeSingle()
      : { data: null, error: null }

    if (error) {
      console.error('Error fetching preferences:', error)
      throw error
    }

    const preferences = data || {
      default_cost_mode: 'auto',
      default_tier: 'standard',
      default_margin_percent: null,
      default_currency: await orgDefaultCurrency(supabase),
    }
    // A user with no margin of their own — no row, or a row whose margin was
    // cleared so they follow the company — sees the company's figure, not a
    // null the Settings form would render as 25. margin_follows_company says
    // which it is, so a save sends it back and the figure is not pinned
    // (lib/settings/preferences marginToStore).
    const ownMargin = normaliseMargin(preferences.default_margin_percent)
    const margin_follows_company = ownMargin === null
    preferences.default_margin_percent = ownMargin ?? (await orgDefaultMargin(supabase))

    // Not a user preference — an org fact the client needs to label engine
    // amounts correctly (the rates are in this, the billing is in default_currency).
    const rate_currency = await getOrgRateCurrency(supabase, orgId)

    return NextResponse.json({
      success: true,
      data: { ...preferences, margin_follows_company, rate_currency }
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

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // A currency is one of the app's five codes; anything else is refused
    // rather than stored as the money format of every page this person opens.
    let default_currency: string
    if (body.default_currency) {
      const code = normaliseRateCurrency(body.default_currency)
      if (!code) {
        return NextResponse.json(
          { success: false, error: `Currency must be one of ${RATE_CURRENCIES.join(', ')}` },
          { status: 400 }
        )
      }
      default_currency = code
    } else {
      default_currency = await orgDefaultCurrency(supabase)
    }

    const prefData: Record<string, unknown> = {
      user_id: user.id,
      org_id: orgId,
      default_cost_mode: body.default_cost_mode || 'auto',
      default_tier: body.default_tier || 'standard',
      default_currency,
      updated_at: new Date().toISOString()
    }
    // Never the company's figure copied in: null follows the company.
    const margin = marginToStore(body)
    if (margin.write) prefData.default_margin_percent = margin.value

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(prefData, { 
        onConflict: 'user_id,org_id',
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