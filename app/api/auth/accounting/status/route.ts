import { NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // The COMPANY's connections (accounting_tokens UNIQUE (org_id, provider)):
    // every admin of the company sees the same "Connected to …", whoever
    // connected it. It used to read the caller's own row — so a second admin
    // saw "Connect Xero" over a live connection, and a person in both
    // companies saw the other company's Xero file. Settings › Integrations is
    // the reader, a screen for admins and managers.
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabase
      .from('accounting_tokens')
      .select('provider, company_name, is_active, updated_at')
      .eq('org_id', orgId)

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
