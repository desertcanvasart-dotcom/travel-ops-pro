import { NextRequest, NextResponse } from 'next/server'
import { getAccountingProvider, AccountingProviderType } from '@/lib/accounting'

export async function POST(request: NextRequest) {
  try {
    const { userId, provider } = await request.json()

    if (!userId || !provider) {
      return NextResponse.json(
        { error: 'userId and provider are required' },
        { status: 400 }
      )
    }

    if (provider !== 'xero' && provider !== 'quickbooks') {
      return NextResponse.json(
        { error: 'Provider must be "xero" or "quickbooks"' },
        { status: 400 }
      )
    }

    const accountingProvider = getAccountingProvider(provider as AccountingProviderType)
    const state = `${userId}:${provider}`
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
