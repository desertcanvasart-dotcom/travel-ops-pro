import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/supabase-secure'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { isAccountingProvider } from '@/lib/accounting/connection'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json(
        { error: 'provider is required' },
        { status: 400 }
      )
    }
    if (!isAccountingProvider(provider)) {
      return NextResponse.json(
        { error: 'Provider must be "xero" or "quickbooks"' },
        { status: 400 }
      )
    }

    // The session decides who is asking — NOT the request body.
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // The connection is the COMPANY's (accounting_tokens UNIQUE (org_id,
    // provider)), so disconnecting stops every invoice, payment and expense
    // reaching its books: an admin act, in the company the request is acting
    // in. It used to delete the caller's own row in whichever company it was —
    // from one company's tab, a person in both disconnected the other's.
    const denied = await requireRole(['admin'])
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { error } = await supabase
      .from('accounting_tokens')
      .delete()
      .eq('org_id', orgId)
      .eq('provider', provider)

    if (error) {
      console.error('Error disconnecting accounting:', error)
      return NextResponse.json(
        { error: 'Failed to disconnect' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Accounting disconnect error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
