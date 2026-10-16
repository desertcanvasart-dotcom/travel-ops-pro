import { NextRequest, NextResponse } from 'next/server'
import { nonceMatches, clearNonceCookie } from '@/lib/oauth/csrf-nonce'
import { encryptToken } from '@/lib/crypto/token-cipher'
import { createClient } from '@supabase/supabase-js'
import { getAccountingProvider } from '@/lib/accounting'
import { verifyState } from '@/lib/oauth-state'
import { mayManageAccounting, otherAccountingProvider, parseAccountingState } from '@/lib/accounting/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || ''

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state') // userId:provider:orgId:nonce
  const error = searchParams.get('error')
  const realmId = searchParams.get('realmId') // QuickBooks passes this

  // Redirect target is the CONFIGURED app URL only. It used to fall back to the
  // caller-controlled x-forwarded-host, so an attacker could craft a callback
  // that redirected (with the ?error/?realmId params) to a host of their
  // choosing. A relative path is the safe fallback when BASE_URL is unset.
  const baseUrl = BASE_URL || new URL(request.url).origin
  const redirectTo = (qs: string) =>
    BASE_URL
      ? NextResponse.redirect(new URL(`/settings?tab=integrations&${qs}`, baseUrl))
      : NextResponse.redirect(new URL(`/settings?tab=integrations&${qs}`, request.url))

  if (error) {
    // Reflect only a constrained code, never the raw provider string.
    const safe = /^[a-z_]{1,40}$/.test(error) ? error : 'provider_error'
    return redirectTo(`error=${encodeURIComponent(safe)}`)
  }

  if (!code || !state) {
    return redirectTo('error=missing_params')
  }

  // Verify the signed state before trusting the embedded user id / provider —
  // otherwise an attacker could attach their accounting tokens to any account.
  // `${userId}:${provider}:${orgId}:${nonce}`. A state without the company is
  // refused: the connection is the company's, and guessing it from the
  // person's oldest membership is how one company's books were bound to the
  // other's.
  const parsed = parseAccountingState(verifyState(state))
  if (!parsed) {
    return NextResponse.redirect(
      new URL('/settings?tab=integrations&error=invalid_state', baseUrl)
    )
  }
  const { userId, provider: providerName, orgId, nonce: stateNonce } = parsed

  // CSRF: the state nonce must match the httpOnly cookie set when this browser
  // began the flow — a signed state alone does not prove the victim started it.
  if (!nonceMatches(request, stateNonce)) {
    const res = redirectTo('error=invalid_state')
    clearNonceCookie(res)
    return res
  }

  try {
    // Re-checked here, not only at connect: this route runs without a session,
    // and a person demoted (or removed) between the two steps must not finish
    // attaching their file to the company's books. Admin, owner included, in
    // the company named in the signed state.
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!mayManageAccounting((membership as { role?: string } | null)?.role)) {
      return redirectTo('error=not_admin')
    }

    const provider = getAccountingProvider(providerName)
    const extras: Record<string, string> = {}
    if (realmId) extras.realmId = realmId

    const tokens = await provider.exchangeCodeForTokens(code, extras)

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('No tokens received')
    }

    // One accounting provider per company (accounting_tokens_one_active_per_org):
    // connecting Xero switches QuickBooks off, and the reverse. Said on the
    // page, never done silently — the books the sync writes to just changed.
    const other = otherAccountingProvider(providerName)
    const { data: replaced } = await supabase
      .from('accounting_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('provider', other)
      .eq('is_active', true)
      .select('id')

    // The company's row for this provider: a reconnect (or a colleague's
    // connection) replaces it. user_id records who connected it.
    const { error: dbError } = await supabase
      .from('accounting_tokens')
      .upsert({
        user_id: userId,
        org_id: orgId,
        provider: providerName,
        access_token: encryptToken(tokens.access_token),
        refresh_token: encryptToken(tokens.refresh_token),
        token_expiry: new Date(tokens.expiry_date).toISOString(),
        tenant_id: tokens.tenant_id || null,
        realm_id: tokens.realm_id || null,
        company_name: tokens.company_name || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'org_id,provider'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      throw new Error('Failed to save accounting tokens')
    }

    const replacedQs = (replaced ?? []).length > 0 ? `&replaced=${other}` : ''
    // The nonce is single-use: a connected flow spends it.
    const done = NextResponse.redirect(
      new URL(`/settings?tab=integrations&accounting=connected&provider=${providerName}${replacedQs}`, baseUrl)
    )
    clearNonceCookie(done)
    return done
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Accounting OAuth callback error:', err)
    return NextResponse.redirect(
      new URL(`/settings?tab=integrations&error=${encodeURIComponent(message)}`, baseUrl)
    )
  }
}
