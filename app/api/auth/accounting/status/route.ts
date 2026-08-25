import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // WHOSE integration status comes from the session, never the query string.
    // It used to read `?userId=`, so any authenticated user could enumerate any
    // other user's connected accounting providers and company names.
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('accounting_tokens')
      .select('provider, company_name, is_active, tenant_id, realm_id, updated_at')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching accounting status:', error)
      return NextResponse.json({ xero: null, quickbooks: null })
    }

    const result: Record<string, unknown> = {
      xero: null,
      quickbooks: null,
    }

    for (const token of data || []) {
      result[token.provider] = {
        connected: token.is_active,
        company_name: token.company_name,
        last_updated: token.updated_at,
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Accounting status error:', error)
    return NextResponse.json({ xero: null, quickbooks: null })
  }
}
