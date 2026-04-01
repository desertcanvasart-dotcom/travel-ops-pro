import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccountingProvider, AccountingProviderType } from '@/lib/accounting'

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

  const [userId, providerName] = state.split(':')
  if (!userId || !providerName) {
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

    // Upsert token record
    const { error: dbError } = await supabase
      .from('accounting_tokens')
      .upsert({
        user_id: userId,
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
