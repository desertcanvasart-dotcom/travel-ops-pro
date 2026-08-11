// ============================================
// API: GET /api/accounting/accounts — chart of accounts + config status (M4)
// ============================================
// The sync needs to name real ledger accounts, and those ids/codes are specific
// to the connected company. This endpoint answers both halves of that problem:
//
//   1. what is currently configured, and what is missing
//   2. what the connected company's accounts actually ARE, so the operator can
//      pick the right value instead of guessing
//
// Read-only. It never writes config — the values live in environment variables,
// which is deliberate: a ledger mapping is deployment configuration, not
// something to be changed from a browser session.

import { NextResponse } from 'next/server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { getAuthenticatedProvider } from '@/lib/accounting'
import { checkAccountConfig, type AccountingProviderName } from '@/lib/accounting/account-config'
import { clientMessage } from '@/lib/api-errors'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const connection = await getAuthenticatedProvider(userId)

    // Config status is useful even with nothing connected — it is how an
    // operator learns what to set BEFORE wiring up QuickBooks or Xero.
    if (!connection) {
      return NextResponse.json({
        success: true,
        connected: false,
        message:
          'No accounting provider is connected. Connect QuickBooks or Xero first, ' +
          'then call this again to list the chart of accounts.',
        config: {
          quickbooks: checkAccountConfig('quickbooks'),
          xero: checkAccountConfig('xero'),
        },
        accounts: [],
      })
    }

    const providerName = connection.providerType as AccountingProviderName
    const config = checkAccountConfig(providerName)

    let accounts
    try {
      accounts = await connection.provider.listAccounts()
    } catch (error: unknown) {
      // A failed lookup must not read as "this company has no accounts" — that
      // would send someone hunting for a chart of accounts that is right there.
      return NextResponse.json(
        {
          success: false,
          connected: true,
          provider: providerName,
          config,
          error: clientMessage(error, 'Could not read the chart of accounts'),
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      connected: true,
      provider: providerName,
      config,
      // Archived/inactive accounts are excluded: they cannot be posted to, so
      // offering them as choices would only produce a later failure.
      accounts: accounts
        .filter(a => a.active)
        .map(a => ({ ref: a.ref, name: a.name, type: a.type, subType: a.subType })),
    })
  } catch (error: unknown) {
    console.error('Accounting accounts GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
