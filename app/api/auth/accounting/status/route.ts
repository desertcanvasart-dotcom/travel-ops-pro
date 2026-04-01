import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
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
