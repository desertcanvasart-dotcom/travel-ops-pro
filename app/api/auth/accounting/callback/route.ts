import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccountingProvider, AccountingProviderType } from '@/lib/accounting'
import { verifyState } from '@/lib/oauth-state'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || ''

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // userId:provider
  const error = searchParams.get('error')
  const realmId = searchParams.get('realmId') // QuickBooks passes this

  const baseUrl = BASE_URL || (request.headers.get('x-forwarded-host')
    ? `https://${request.headers.get('x-forwarded-host')}`
    : request.url)

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?tab=integrations&error=${error}`, baseUrl)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings?tab=integrations&error=missing_params', baseUrl)
    )
  }

  // Verify the signed state before trusting the embedded user id / provider —
  // otherwise an attacker could attach their accounting tokens to any account.
  const verified = verifyState(state)
  const [userId, providerName] = (verified || '').split(':')
  if (!verified || !userId || !providerName) {
    return NextResponse.redirect(
      new URL('/settings?tab=integrations&error=invalid_state', baseUrl)
    )
  }

  try {
    const provider = getAccountingProvider(providerName as AccountingProviderType)
    const extras: Record<string, string> = {}
    if (realmId) extras.realmId = realmId

    const tokens = await provider.exchangeCodeForTokens(code, extras)

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('No tokens received')
    }

    // M3 Phase 1: resolve the connecting user's org so the new token row
    // can satisfy the NOT NULL accounting_tokens.org_id added by
    // 20260624_organizations_phase1.sql. The migration's backfill made
    // every existing user_profiles row an owner of the default org, so
    // there's always at least one membership to find here.
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const orgId = (membership as { org_id?: string } | null)?.org_id ?? null

    if (!orgId) {
      // Hard-fail rather than silently inserting a NULL org_id — without an
      // org we don't know which tenant this connection belongs to and the
      // sync resolver would have to fall back to a singleton again.
      console.error('Accounting OAuth callback: no organization_members row for user', userId)
      return NextResponse.redirect(
        new URL('/settings?tab=integrations&error=no_organization', baseUrl)
      )
    }

    // Upsert token record
    const { error: dbError } = await supabase
      .from('accounting_tokens')
      .upsert({
        user_id: userId,
        org_id: orgId,
        provider: providerName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: new Date(tokens.expiry_date).toISOString(),
        tenant_id: tokens.tenant_id || null,
        realm_id: tokens.realm_id || null,
        company_name: tokens.company_name || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save accounting tokens')
    }

    return NextResponse.redirect(
      new URL(`/settings?tab=integrations&accounting=connected&provider=${providerName}`, baseUrl)
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Accounting OAuth callback error:', err)
    return NextResponse.redirect(
      new URL(`/settings?tab=integrations&error=${encodeURIComponent(message)}`, baseUrl)
    )
  }
}
