import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { getAccountingProvider, AccountingProviderType } from '@/lib/accounting'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import { signState } from '@/lib/oauth-state'

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json(
        { error: 'provider is required' },
        { status: 400 }
      )
    }

    if (provider !== 'xero' && provider !== 'quickbooks') {
      return NextResponse.json(
        { error: 'Provider must be "xero" or "quickbooks"' },
        { status: 400 }
      )
    }

    // Derive the user from the session and sign the state so the callback can't
    // be tricked into attaching tokens to another user's account.
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Bind the connection to the org the user is ACTING IN, carried through the
    // signed state so the callback attaches the tokens to the right tenant
    // rather than to the user's oldest membership.
    const orgId = await getCurrentOrgId()
    const accountingProvider = getAccountingProvider(provider as AccountingProviderType)
    const state = signState(`${user.id}:${provider}${orgId ? `:${orgId}` : ''}`)
    const authUrl = accountingProvider.getAuthUrl(state)

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Accounting connect error:', error)
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    )
  }
}
