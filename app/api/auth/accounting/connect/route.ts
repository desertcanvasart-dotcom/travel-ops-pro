import { NextRequest, NextResponse } from 'next/server'
import { newNonce, setNonceCookie } from '@/lib/oauth/csrf-nonce'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
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

    // Whose books every invoice, payment and expense is pushed into is the
    // company's decision, not any member's: a viewer could otherwise attach
    // their own Xero file and receive the company's invoices from then on.
    // Admin (the owner passes) in the company the request is acting in; the
    // callback checks the same again, since it runs without a session.
    const denied = await requireRole(['admin'])
    if (denied) return denied

    // Bind the connection to the org the user is ACTING IN, carried through the
    // signed state so the callback attaches the tokens to the right tenant
    // rather than to the user's oldest membership.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const accountingProvider = getAccountingProvider(provider as AccountingProviderType)
    // CSRF nonce is the LAST state segment (see the callback).
    const nonce = newNonce()
    const state = signState(`${user.id}:${provider}:${orgId}:${nonce}`)
    const authUrl = accountingProvider.getAuthUrl(state)

    const res = NextResponse.json({ authUrl })
    setNonceCookie(res, nonce)
    return res
  } catch (error) {
    console.error('Accounting connect error:', error)
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    )
  }
}
